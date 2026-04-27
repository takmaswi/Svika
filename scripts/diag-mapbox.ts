/**
 * Phase 3.5 diagnostic: capture every Mapbox network request on prod and
 * surface its status code, so we can see at a glance whether the basemap is
 * blocked by 401/403/429.
 */

import { chromium } from "@playwright/test";

const URL = process.env.SVIKA_URL ?? "https://svika.vercel.app/?as=takunda";

interface Hit {
  status: number;
  url: string;
  contentType: string;
  fromCache: boolean;
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 776 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  const hits: Hit[] = [];
  const errors: string[] = [];

  page.on("response", async (resp) => {
    const u = resp.url();
    if (!/mapbox/i.test(u)) return;
    let contentType = "";
    try {
      contentType = (await resp.headerValue("content-type")) ?? "";
    } catch {
      contentType = "";
    }
    hits.push({
      status: resp.status(),
      url: u.length > 140 ? u.slice(0, 140) + "..." : u,
      contentType,
      fromCache: resp.fromServiceWorker(),
    });
  });
  page.on("pageerror", (err) => errors.push("[pageerror] " + err.message));
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      errors.push("[console " + t + "] " + msg.text());
    }
  });

  console.log("[diag] navigating to", URL);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  // Pull the actual token used by the page bundle and the mapboxgl version,
  // so we can confirm whether the env var was even read.
  const tokenInfo = await page.evaluate(() => {
    // mapboxgl is loaded via the JS bundle; the token gets attached to the
    // global accessToken. Try a couple of paths.
    const w = window as unknown as {
      mapboxgl?: { accessToken?: string };
    };
    const tok = w.mapboxgl?.accessToken ?? null;
    return {
      hasMapboxGlobal: !!w.mapboxgl,
      tokenPrefix: tok ? tok.slice(0, 12) : null,
      tokenSuffix: tok ? tok.slice(-6) : null,
      tokenLength: tok ? tok.length : null,
    };
  });

  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });

  console.log("\n[diag] mapbox token visible to page:", tokenInfo);
  console.log("[diag] canvas size:", canvasBox);
  console.log(`\n[diag] mapbox responses captured: ${hits.length}`);
  for (const h of hits.slice(0, 20)) {
    console.log(`  ${h.status}  ${h.contentType}  ${h.url}`);
  }

  if (errors.length > 0) {
    console.log(`\n[diag] page errors: ${errors.length}`);
    for (const e of errors.slice(0, 10)) console.log("  " + e);
  }

  // Wait long enough for any deferred rendering to settle, then screenshot.
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "diag-mapbox-prod.png", fullPage: false });
  console.log("\n[diag] screenshot saved: diag-mapbox-prod.png");

  // Inspect the live layer state — proves the Phase 3.5 paint pipeline is wired.
  const layerState = await page.evaluate(() => {
    type LayerEntry = {
      id: string;
      filter?: unknown;
      lineOpacity?: unknown;
      circleOpacity?: unknown;
      circleRadius?: unknown;
      featureCount?: number;
    };
    const map = (
      window as unknown as {
        __svikaMap?: {
          getFilter: (id: string) => unknown;
          getPaintProperty: (id: string, prop: string) => unknown;
          querySourceFeatures: (
            sourceId: string,
            opts?: { sourceLayer?: string; filter?: unknown },
          ) => unknown[];
        };
      }
    ).__svikaMap;
    if (!map) return { ok: false, reason: "no __svikaMap handle on window" };
    const interesting = [
      "svika-routes-base",
      "svika-routes-highlight",
      "svika-walking-line",
      "svika-kombis-dot",
      "svika-kombis-halo",
    ];
    const out: LayerEntry[] = [];
    for (const id of interesting) {
      const entry: LayerEntry = { id };
      try { entry.filter = map.getFilter(id); } catch { /* */ }
      try { entry.lineOpacity = map.getPaintProperty(id, "line-opacity"); } catch { /* */ }
      try { entry.circleOpacity = map.getPaintProperty(id, "circle-opacity"); } catch { /* */ }
      try { entry.circleRadius = map.getPaintProperty(id, "circle-radius"); } catch { /* */ }
      out.push(entry);
    }
    let walkingFeatures = 0;
    try { walkingFeatures = map.querySourceFeatures("svika-walking").length; } catch { /* */ }
    let kombiFeatures = 0;
    try { kombiFeatures = map.querySourceFeatures("svika-kombis").length; } catch { /* */ }
    return { ok: true, layers: out, walkingFeatures, kombiFeatures };
  });
  console.log("[diag] phase 3.5 layer state:", JSON.stringify(layerState, null, 2));

  // Also probe the canvas pixel content directly: read a few pixels to see
  // if the WebGL context actually drew anything.
  const pixelProbe = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return { found: false } as const;
    const w = canvas.width;
    const h = canvas.height;
    // Try 2D first (may fail if WebGL is the active context).
    const ctx2d = canvas.getContext("2d");
    if (ctx2d) {
      try {
        const sample = ctx2d.getImageData(w / 2, h / 2, 1, 1);
        return {
          found: true,
          context: "2d" as const,
          w,
          h,
          midRGBA: Array.from(sample.data) as number[],
        };
      } catch {
        // fall through
      }
    }
    const gl = (canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { found: true, context: "none" as const, w, h };
    const buf = new Uint8Array(4);
    gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return {
      found: true,
      context: "webgl" as const,
      w,
      h,
      midRGBA: Array.from(buf) as number[],
    };
  });
  console.log("[diag] canvas pixel probe:", pixelProbe);

  await browser.close();
}

main().catch((err) => {
  console.error("[diag FAILED]", err);
  process.exit(1);
});
