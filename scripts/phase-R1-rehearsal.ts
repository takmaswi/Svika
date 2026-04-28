/**
 * R1 rehearsal — verifies the new dark/glass/Apple-blue chrome lands.
 *
 *   1. idle              — dark map, no header, floating tab bar at the
 *                          bottom, Home tab active. Booking content at peek.
 *   2. account-tab tap   — PersonaDrawer slides in from the right.
 *   3. rides-tab tap     — Wallet drawer opens (existing component).
 *   4. map detail        — zoomed out, dark-v11 paint overrides land
 *                          (water/roads/landuse) with no light beige.
 *
 * Run: pnpm dev (terminal 1), then
 *      npx tsx --env-file=.env.local scripts/phase-R1-rehearsal.ts
 */

import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  idle: join(SCREENSHOT_DIR, "phase-R1-rehearsal-1.png"),
  accountTab: join(SCREENSHOT_DIR, "phase-R1-rehearsal-2.png"),
  ridesTab: join(SCREENSHOT_DIR, "phase-R1-rehearsal-3.png"),
  mapDetail: join(SCREENSHOT_DIR, "phase-R1-rehearsal-4.png"),
};

function log(message: string): void {
  console.log(`\n[phase-R1] ${message}`);
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

  log("1. idle — dark map, floating tab bar");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="svika-tab-bar"]', {
    timeout: 30_000,
  });
  await page.waitForSelector('[data-testid="journey-sheet"]', {
    timeout: 30_000,
  });
  // Allow map tiles + fitBounds to settle so dark-v11 paint overrides
  // visibly land before the screenshot.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOTS.idle });
  console.log(`    wrote ${SHOTS.idle}`);

  log("2. account-tab tap — PersonaDrawer slides in");
  await page.click('[data-testid="svika-tab-account"]');
  // Drawer transition is 280ms — wait through plus a buffer.
  await page.waitForTimeout(700);
  // Scroll the drawer to its bottom so the pb-24 clearance below the
  // GitHub tile is visible above the floating tab bar.
  await page.evaluate(() => {
    const body = document.querySelector(
      '[data-testid="persona-drawer"] .flex-1.overflow-y-auto',
    ) as HTMLElement | null;
    body?.scrollTo({ top: body.scrollHeight });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS.accountTab });
  console.log(`    wrote ${SHOTS.accountTab}`);

  // Reset to home so the next tap is from the same baseline.
  await page.click('[data-testid="svika-tab-home"]');
  await page.waitForTimeout(700);

  log("3. rides-tab tap — Wallet opens");
  await page.click('[data-testid="svika-tab-rides"]');
  // Sheet snap-to-full transition is 320ms — wait through plus a buffer.
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOTS.ridesTab });
  console.log(`    wrote ${SHOTS.ridesTab}`);

  // Reset to home.
  await page.click('[data-testid="svika-tab-home"]');
  await page.waitForTimeout(900);

  log("4. map detail — zoom out, confirm dark paint overrides");
  await page.evaluate(async () => {
    type W = {
      __svikaMap?: {
        setZoom: (z: number) => void;
        setCenter: (c: [number, number]) => void;
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return;
    map.setCenter([31.0335, -17.8252]);
    map.setZoom(11);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: SHOTS.mapDetail });
  console.log(`    wrote ${SHOTS.mapDetail}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-R1 FAILED]", err);
  process.exit(1);
});
