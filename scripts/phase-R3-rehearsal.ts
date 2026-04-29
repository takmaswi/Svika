/**
 * R3 rehearsal — verifies the redesigned booking flow:
 *
 *   1. idle, dark map, sheet at half showing "Where to, Takunda?" + 2 quick
 *      picks (Rezende Rank direct / Avondale Shops via Lomagundi walk). No
 *      UZ tile, no Sam Levy's tile.
 *   2. Avondale quick pick tapped → sheet snaps to half on the new
 *      "trip-preview" state, map fits the trip corridor (user dot at
 *      Bannockburn → Second/Lomagundi → King George → Avondale Shops),
 *      TripPreviewCard with kombi/walk/kombi chip strip and Apple-blue Buy.
 *   3. Buy tapped → PaymentChoiceSheet with Apple-blue primary "Pay $1.50
 *      from wallet" CTA and dark-glass cash secondary with Apple-blue ring.
 *   4. Pay from wallet → walk-to-board journey card mounted at full snap
 *      (sanity: existing R1/R2 journey flow still works after R3 wiring).
 *   5. Typed-search path → "I want to go to UZ from Heights" → PlanList
 *      restyled to dark-glass cards with kombi pill on Apple-blue tint.
 *
 * Run: pnpm dev (terminal 1), pnpm sim:start (terminal 2 — optional, only
 *      changes whether kombi positions advance during the capture), then
 *      npx tsx --env-file=.env.local scripts/phase-R3-rehearsal.ts
 */

import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  idle: join(SCREENSHOT_DIR, "phase-R3-rehearsal-1.png"),
  preview: join(SCREENSHOT_DIR, "phase-R3-rehearsal-2.png"),
  payment: join(SCREENSHOT_DIR, "phase-R3-rehearsal-3.png"),
  walkToBoard: join(SCREENSHOT_DIR, "phase-R3-rehearsal-4.png"),
  planList: join(SCREENSHOT_DIR, "phase-R3-rehearsal-5.png"),
};

function log(message: string): void {
  console.log(`\n[phase-R3] ${message}`);
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

  // ---------------- shot 1: idle, sheet at half, two quick picks ----------
  log("1. idle — two quick picks (Rezende + Avondale)");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="svika-tab-bar"]', {
    timeout: 30_000,
  });
  // Allow map style + R2 user/route layers + initial kombi GeoJSON to settle.
  await page.waitForTimeout(3500);
  // Drag-zone tap cycles peek → half so quick picks are in frame.
  await page.locator('[data-testid="journey-sheet"] .svika-sheet-drag-zone').click();
  await page.waitForTimeout(600);
  // Sanity: confirm both quick picks rendered.
  const rezende = await page.locator('[data-testid="quick-pick-rezende"]').count();
  const avondale = await page.locator('[data-testid="quick-pick-avondale"]').count();
  const uz = await page.locator('[data-testid="quick-pick-uz"]').count();
  const samlevys = await page.locator('[data-testid="quick-pick-samlevys"]').count();
  console.log(`    quick-pick-rezende:  ${rezende} (expect 1)`);
  console.log(`    quick-pick-avondale: ${avondale} (expect 1)`);
  console.log(`    quick-pick-uz:       ${uz} (expect 0)`);
  console.log(`    quick-pick-samlevys: ${samlevys} (expect 0)`);
  await page.screenshot({ path: SHOTS.idle });
  console.log(`    wrote ${SHOTS.idle}`);

  // ---------------- shot 2: tap Avondale → trip preview --------------------
  log("2. tap Avondale quick pick → TripPreviewCard");
  await page.locator('[data-testid="quick-pick-avondale"]').click();
  // Wait for the trip-preview state + map fitBounds animation to settle.
  await page.waitForSelector('[data-testid="trip-preview-card"]', {
    timeout: 5_000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS.preview });
  console.log(`    wrote ${SHOTS.preview}`);

  // ---------------- shot 3: tap Buy → PaymentChoiceSheet -------------------
  log("3. tap Buy → PaymentChoiceSheet");
  await page.locator('[data-testid="trip-preview-buy"]').click();
  await page.waitForSelector('[data-testid="payment-wallet"]', {
    timeout: 5_000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS.payment });
  console.log(`    wrote ${SHOTS.payment}`);

  // ---------------- shot 4: pay from wallet → walk-to-board ----------------
  log("4. pay from wallet → walk-to-board");
  await page.locator('[data-testid="payment-wallet"]').click();
  // Booking is a server action; allow round-trip + Journey mount. Booking
  // → revalidatePath('/') → router.refresh() → server re-renders the
  // PassengerShell with the new initialJourney; the active-journey state
  // can take a couple of seconds to propagate end-to-end.
  try {
    await page.waitForSelector(
      '[data-testid="journey-sheet-content"][data-state="walk-to-board"], [data-testid="journey-sheet-content"][data-state="in-transit"]',
      { timeout: 30_000 },
    );
  } catch (err) {
    const state = await page
      .locator('[data-testid="journey-sheet-content"]')
      .getAttribute("data-state")
      .catch(() => null);
    const flash = await page.locator("text=/error|missing|failed/i").first().textContent().catch(() => null);
    console.error(
      `    walk-to-board not visible. data-state=${state} bookingFlash=${flash}`,
    );
    await page.screenshot({ path: SHOTS.walkToBoard });
    throw err;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  // ---------------- shot 5: typed search → PlanList ------------------------
  log("5. typed search → PlanList (UZ via seed trip_plan)");
  // Reset to idle: open a fresh tab as a different persona so journey state
  // doesn't bleed in. Rudo is also a passenger; the new shell starts idle.
  const page5 = await ctx.newPage();
  page5.on("pageerror", (err) => console.error("[pageerror p5]", err.message));
  await page5.goto(`${BASE}/?as=rudo`, { waitUntil: "domcontentloaded" });
  await page5.waitForSelector('[data-testid="svika-tab-bar"]', {
    timeout: 30_000,
  });
  await page5.waitForTimeout(2500);
  await page5.locator('[data-testid="journey-sheet"] .svika-sheet-drag-zone').click();
  await page5.waitForTimeout(500);
  // Use the search bar's input. The placeholder text is "Avondale, Rezende, UZ…"
  const searchInput = page5.locator('input[placeholder*="Avondale"]').first();
  await searchInput.click();
  await searchInput.fill("Heights to UZ");
  await searchInput.press("Enter");
  // findPlansAction roundtrip — AI parsing can take 60s+ on cold-start, so
  // be patient. Fall back to capturing whatever state ended up on screen so
  // we at least see the dark-glass restyle of the no-plans/error path if
  // the AI is slow.
  try {
    await page5.waitForSelector(
      '[data-testid="journey-sheet-content"][data-state="plans-returned"]',
      { timeout: 90_000 },
    );
  } catch {
    const state = await page5
      .locator('[data-testid="journey-sheet-content"]')
      .getAttribute("data-state")
      .catch(() => null);
    console.warn(
      `    plans-returned not visible after 90s. Falling back. data-state=${state}`,
    );
  }
  await page5.waitForTimeout(800);
  await page5.screenshot({ path: SHOTS.planList });
  console.log(`    wrote ${SHOTS.planList}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-R3 FAILED]", err);
  process.exit(1);
});
