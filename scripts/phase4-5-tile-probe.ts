/**
 * Quick prod probe — does the Mapbox basemap render under headless?
 * Visits /?as=takunda, waits 12s for tiles, then asks the map for:
 *   - styleLoaded()
 *   - loaded() (true once all queued sources/tiles are done)
 *   - areTilesLoaded()
 *   - the layer ids actually present
 *   - the basemap source name from the style
 *   - any console errors
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-5-tile-probe.ts
 */

import { chromium } from "@playwright/test";

const BASE = "https://svika.vercel.app";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  const consoleMsgs: string[] = [];
  page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __svikaMap?: unknown }).__svikaMap),
    null,
    { timeout: 20_000 },
  );

  console.log("waiting 12s for tiles...");
  await page.waitForTimeout(12_000);

  const layoutProbe = await page.evaluate(() => {
    const section = document.querySelector("section");
    const mapDiv = document.querySelector("section > div");
    const canvas = document.querySelector("canvas.mapboxgl-canvas") as HTMLCanvasElement | null;
    const mapContainer = document.querySelector(".mapboxgl-map");
    const innerContainer = mapContainer?.parentElement;
    const journey = document.querySelector('[data-testid="journey-sheet"]');
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    const dpr = window.devicePixelRatio;
    const sectionStyle = section ? getComputedStyle(section) : null;
    const mapDivStyle = mapDiv ? getComputedStyle(mapDiv as Element) : null;
    const innerStyle = innerContainer ? getComputedStyle(innerContainer) : null;
    const computedSection = sectionStyle
      ? {
          height: sectionStyle.height,
          minHeight: sectionStyle.minHeight,
          flex: sectionStyle.flex,
          display: sectionStyle.display,
        }
      : null;
    const computedMapDiv = mapDivStyle
      ? {
          height: mapDivStyle.height,
          minHeight: mapDivStyle.minHeight,
          position: mapDivStyle.position,
        }
      : null;
    const computedInner = innerStyle
      ? {
          height: innerStyle.height,
          minHeight: innerStyle.minHeight,
        }
      : null;
    return {
      dpr,
      windowH: window.innerHeight,
      mainH: main ? (main as HTMLElement).offsetHeight : null,
      headerH: header ? (header as HTMLElement).offsetHeight : null,
      sectionH: section ? section.offsetHeight : null,
      sectionW: section ? section.offsetWidth : null,
      mapDivH: mapDiv ? (mapDiv as HTMLElement).offsetHeight : null,
      canvasH: canvas ? canvas.offsetHeight : null,
      canvasCSSH: canvas ? canvas.style.height : null,
      canvasAttrH: canvas ? canvas.height : null,
      journeyH: journey ? (journey as HTMLElement).offsetHeight : null,
      computedSection,
      computedMapDiv,
      computedInner,
      mapboxMapH: mapContainer ? (mapContainer as HTMLElement).offsetHeight : null,
      innerH: innerContainer ? (innerContainer as HTMLElement).offsetHeight : null,
    };
  });
  console.log("[layout]", JSON.stringify(layoutProbe, null, 2));

  const probe = await page.evaluate(() => {
    const map = (
      window as unknown as {
        __svikaMap?: {
          isStyleLoaded: () => boolean;
          loaded: () => boolean;
          areTilesLoaded: () => boolean;
          getStyle: () => { layers?: Array<{ id: string }>; sources?: Record<string, { type?: string; url?: string }> };
          getCanvas: () => HTMLCanvasElement;
          hasImage: (id: string) => boolean;
        };
      }
    ).__svikaMap;
    if (!map) return { ok: false };
    const style = map.getStyle();
    const canvas = map.getCanvas();
    return {
      ok: true,
      styleLoaded: map.isStyleLoaded(),
      loaded: map.loaded(),
      areTilesLoaded: map.areTilesLoaded(),
      hasKombiIcon: map.hasImage("kombi-icon"),
      layerCount: style.layers?.length ?? 0,
      svikaLayerIds: (style.layers ?? [])
        .map((l) => l.id)
        .filter((id) => id.startsWith("svika-")),
      sourceKeys: Object.keys(style.sources ?? {}),
      canvasW: canvas.width,
      canvasH: canvas.height,
    };
  });

  console.log(JSON.stringify(probe, null, 2));

  // Map.triggerRepaint + sample a few canvas pixels to see if WebGL drew
  // anything at all.
  const pixelProbe = await page.evaluate(() => {
    const map = (
      window as unknown as {
        __svikaMap?: { triggerRepaint: () => void; getCanvas: () => HTMLCanvasElement };
      }
    ).__svikaMap;
    if (!map) return { ok: false, reason: "no map" };
    map.triggerRepaint();
    const canvas = map.getCanvas();
    const w = canvas.width;
    const h = canvas.height;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { ok: false, reason: "no GL context", w, h };
    // readPixels at the canvas centre.
    const pixels = new Uint8Array(4);
    try {
      gl.readPixels(
        Math.floor(w / 2),
        Math.floor(h / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
    } catch (e) {
      return { ok: false, reason: "readPixels threw", err: String(e), w, h };
    }
    const ext = gl.getExtension("WEBGL_lose_context");
    return {
      ok: true,
      w,
      h,
      centerPixel: Array.from(pixels),
      isContextLost: gl.isContextLost(),
      hasLoseExt: Boolean(ext),
    };
  });
  console.log("[pixel]", JSON.stringify(pixelProbe));

  // Stack inspection — what's actually drawn at center of map area?
  const elementProbe = await page.evaluate(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const stack = (
      document as unknown as {
        elementsFromPoint: (x: number, y: number) => Element[];
      }
    ).elementsFromPoint(cx, cy);
    const layers = stack.slice(0, 8).map((el) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className.toString(),
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        opacity: cs.opacity,
        z: cs.zIndex,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    });
    return { cx, cy, layers };
  });
  console.log("[elements]", JSON.stringify(elementProbe, null, 2));
  console.log("--- console (last 30) ---");
  for (const m of consoleMsgs.slice(-30)) console.log(m);

  await page.screenshot({ path: "scripts/phase4-5-tile-probe.png" });
  await browser.close();
}

main().catch((err) => {
  console.error("[tile-probe FAILED]", err);
  process.exit(1);
});
