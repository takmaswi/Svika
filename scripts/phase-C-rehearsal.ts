/**
 * Phase C rehearsal — opens the persona-chip drawer and captures two
 * screenshots covering the secondary-navigation surface:
 *
 *   1. drawer closed — idle landing, persona chip visible
 *   2. drawer open — drawer slid in from the right, all four sections
 *      (wallet, actions, behind-the-scenes, about) visible, scrim dimming
 *      the map behind it
 *
 * Run: pnpm dev (terminal 1), then
 *      npx tsx --env-file=.env.local scripts/phase-C-rehearsal.ts
 */

import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  closed: join(SCREENSHOT_DIR, "phase-C-rehearsal-1-drawer-closed.png"),
  open: join(SCREENSHOT_DIR, "phase-C-rehearsal-2-drawer-open.png"),
};

function log(label: string): void {
  console.log(`\n[phase-C] ${label}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console error]", msg.text());
  });

  log("1. drawer closed");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS.closed });
  console.log(`    wrote ${SHOTS.closed}`);

  log("2. drawer open — tap persona chip");
  await page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="persona-chip-tap"]',
    ) as HTMLElement | null;
    el?.click();
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="persona-drawer"]');
      return el?.getAttribute("data-open") === "true";
    },
    undefined,
    { timeout: 4000 },
  );
  // Wait for the slide-in transition to settle.
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS.open });
  console.log(`    wrote ${SHOTS.open}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-C FAILED]", err);
  process.exit(1);
});
