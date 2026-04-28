/**
 * R2 rehearsal — verifies the Heights→Rezende empty state.
 *
 *   1. idle, no journey   — map centered on Bannockburn at zoom ~13.5,
 *                           pulsing blue user dot, exactly 3 kombi markers
 *                           on the Heights→Rezende corridor, the route line
 *                           in Apple-blue, the other three routes faint.
 *   2. wider zoom (~11)   — pinch-zoom out programmatically to network
 *                           overview, confirm only the 3 corridor kombis
 *                           remain on the map (no fleet plates from other
 *                           routes appearing as the viewport widens).
 *   3. sim running ≥30 s  — confirm ZH 4821 and ZH 4822 are advancing along
 *                           the polyline; ZH 4823 stays pinned at UZ Gate.
 *   4. layer audit        — `window.__svikaMap.getStyle().layers.map(l=>l.id)`
 *                           contains svika-user-halo, svika-user-dot,
 *                           svika-routes-base-primary.
 *
 * Run: pnpm dev (terminal 1), pnpm sim:start (terminal 2 — important for
 *      step 3 so broadcasts actually flow), then
 *      npx tsx --env-file=.env.local scripts/phase-R2-rehearsal.ts
 */

import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  idle: join(SCREENSHOT_DIR, "phase-R2-rehearsal-1.png"),
  wider: join(SCREENSHOT_DIR, "phase-R2-rehearsal-2.png"),
  withSim: join(SCREENSHOT_DIR, "phase-R2-rehearsal-3.png"),
  layerAudit: join(SCREENSHOT_DIR, "phase-R2-rehearsal-4.png"),
};

function log(message: string): void {
  console.log(`\n[phase-R2] ${message}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[browser ${t}]`, msg.text());
    }
  });

  log("1. idle — Bannockburn zoom 13.5, blue user dot, 3 corridor kombis");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="svika-tab-bar"]', {
    timeout: 30_000,
  });
  // Allow map style + R2 user/route layers + initial kombi GeoJSON to settle.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: SHOTS.idle });
  console.log(`    wrote ${SHOTS.idle}`);

  log("2. wider zoom (~11) — network overview, only 3 corridor kombis visible");
  await page.evaluate(() => {
    type W = {
      __svikaMap?: {
        setZoom: (z: number) => void;
        setCenter: (c: [number, number]) => void;
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return;
    // Re-center on the route midpoint so the whole Heights→Rezende corridor
    // and the surrounding three faint routes are all in the frame; zoom 11
    // is wide enough to expose any stray fleet-plate markers on the other
    // routes if the corridor filter regressed.
    map.setCenter([31.0470, -17.7910]);
    map.setZoom(11);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: SHOTS.wider });
  console.log(`    wrote ${SHOTS.wider}`);

  // Reset to the rehearsal zoom for the sim observation.
  await page.evaluate(() => {
    type W = {
      __svikaMap?: {
        setZoom: (z: number) => void;
        setCenter: (c: [number, number]) => void;
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return;
    map.setCenter([31.04250, -17.74980]);
    map.setZoom(13.5);
  });
  await page.waitForTimeout(1200);

  log("3. sim observation window — ZH 4821 + ZH 4822 advance, ZH 4823 pins");
  // Stay on the page long enough that the sim broadcasts ≥10 ticks.
  // pnpm sim:start drives a 2s tick, so 32s ≈ 16 ticks of motion.
  await page.waitForTimeout(32_000);
  await page.screenshot({ path: SHOTS.withSim });
  console.log(`    wrote ${SHOTS.withSim}`);

  log("4. layer audit — svika-user-halo / -dot / -routes-base-primary");
  const layerIds = await page.evaluate(() => {
    type W = {
      __svikaMap?: {
        getStyle: () => { layers: Array<{ id: string }> };
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return [];
    return map.getStyle().layers.map((l) => l.id);
  });
  console.log("    svika-user-halo:           ", layerIds.includes("svika-user-halo"));
  console.log("    svika-user-dot:            ", layerIds.includes("svika-user-dot"));
  console.log("    svika-routes-base-primary: ", layerIds.includes("svika-routes-base-primary"));
  console.log("    layers (svika-*):", layerIds.filter((id) => id.startsWith("svika-")));
  await page.screenshot({ path: SHOTS.layerAudit });
  console.log(`    wrote ${SHOTS.layerAudit}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-R2 FAILED]", err);
  process.exit(1);
});
