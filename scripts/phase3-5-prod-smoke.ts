/**
 * Phase 3.5 production smoke — drives the real https://svika.vercel.app
 * passenger surface through the Journey UX.
 *
 *   tendai → search 'Heights to Avondale' → buy fastest plan ($1.50)
 *          → close wallet → expect Journey bottom sheet at stage 1 of 6
 *          → screenshot stage 1
 *
 *   farai (in a second tab) → assign ZH 4821 → enter leg-1 access code
 *
 *   tendai → expect sheet to flash 'Boarding · code <leg1>' (stage 2)
 *          → settle into 'On board · heading to Second & Lomagundi' (stage 3)
 *          → screenshot stage 2 + 3
 *
 *   farai → assign ZH 5101 (route_westgate_copa_segment) → enter leg-2 code
 *
 *   tendai → expect sheet to flash 'Boarding leg 2 · code <leg2>' (stage 5)
 *          → screenshot stage 5
 *
 * The smoke is best-effort on the boarding flash window (1.1s) — if a screenshot
 * misses the flash, we still capture the steady stage and log it. Arrival
 * (stage 6) requires the assigned vehicle to drive within 80m of the alight
 * stop, which depends on sim cadence; we log the final stage without enforcing
 * stage 6.
 *
 * Run: npx tsx scripts/phase3-5-prod-smoke.ts
 */

import { chromium, type Page } from "@playwright/test";

const BASE = "https://svika.vercel.app";
const LEG1_VEHICLE = "ZH 4821"; // route_heights_rezende
const LEG2_VEHICLE = "ZH 5101"; // route_westgate_copa_segment

function step(label: string) {
  console.log(`\n[smoke] ${label}`);
}

async function readJourneyState(page: Page): Promise<{
  kind: string | null;
  index: string | null;
  text: string | null;
  arrived: boolean;
}> {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="journey-sheet"]');
    const arrived = document.querySelector('[data-testid="journey-arrived"]');
    if (arrived) {
      return { kind: "arrived", index: null, text: arrived.textContent ?? null, arrived: true };
    }
    if (!sheet) return { kind: null, index: null, text: null, arrived: false };
    return {
      kind: sheet.getAttribute("data-stage"),
      index: sheet.getAttribute("data-stage-index"),
      text: sheet.textContent?.slice(0, 240) ?? null,
      arrived: false,
    };
  });
}

async function clickIfPresent(page: Page, selector: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const el = page.locator(selector).first();
    await el.waitFor({ state: "visible", timeout: timeoutMs });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function ensureConductorOnVehicle(page: Page, plate: string): Promise<void> {
  await page.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  // If keypad already shown for the right vehicle, return; otherwise switch.
  const headerText = await page.locator("header").innerText().catch(() => "");
  if (headerText.includes(plate)) {
    console.log(`    farai already on ${plate}`);
    return;
  }
  // Switch flow: there is a "Switch kombi" button when keypad is visible.
  await clickIfPresent(page, 'button:has-text("Switch kombi")', 3000);
  await page.waitForLoadState("networkidle");
  const testId = `hwindi-vehicle-${plate.replace(/\s+/g, "-")}`;
  const ok = await clickIfPresent(page, `[data-testid="${testId}"]`, 8000);
  if (!ok) throw new Error(`Could not assign ${plate}`);
  await page.getByTestId("hwindi-pin-keypad").waitFor({ timeout: 15000 });
  console.log(`    farai assigned ${plate}`);
}

async function typeCode(page: Page, code: string): Promise<void> {
  for (const digit of code) {
    await page.getByRole("button", { name: `Digit ${digit}` }).click();
  }
  await page.getByRole("button", { name: "Submit code" }).click();
}

async function readKombiFeedback(page: Page): Promise<string> {
  try {
    return (await page.getByTestId("hwindi-feedback").innerText({ timeout: 8000 })).trim();
  } catch {
    return "";
  }
}

async function waitForStage(
  page: Page,
  predicate: (kind: string | null, index: string | null) => boolean,
  timeoutMs: number,
): Promise<{ kind: string | null; index: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await readJourneyState(page);
    if (predicate(s.kind, s.index)) return { kind: s.kind, index: s.index };
    await page.waitForTimeout(400);
  }
  const final = await readJourneyState(page);
  return { kind: final.kind, index: final.index };
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const tendaiCtx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const conductorCtx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
  });
  const tendai = await tendaiCtx.newPage();
  const farai = await conductorCtx.newPage();
  for (const p of [tendai, farai]) {
    p.on("pageerror", (err) => console.error("[page error]", err.message));
    p.on("console", (msg) => {
      if (msg.type() === "error") console.error("[console error]", msg.text());
    });
  }

  // 1. Tendai opens passenger surface, books Heights → Avondale.
  step("1. tendai opens /?as=tendai");
  await tendai.goto(`${BASE}/?as=tendai`, { waitUntil: "domcontentloaded" });
  await tendai.waitForLoadState("networkidle");

  step("2. plan 'Heights to Avondale'");
  // Use a fresh trip — reuse the preset.
  await tendai.getByRole("button", { name: "Heights to Avondale" }).click();
  await tendai
    .getByRole("button", { name: /Buy for \$1\.50/ })
    .first()
    .waitFor({ timeout: 30000 });

  step("3. buy fastest option ($1.50, two legs)");
  await tendai.getByRole("button", { name: /Buy for \$1\.50/ }).click();
  // Wallet auto-opens with two codes. Pull them so we know which to redeem.
  await tendai.getByRole("heading", { name: "Wallet" }).waitFor({ timeout: 15000 });
  await tendai.waitForTimeout(400);
  const codeNodes = await tendai.locator("aside :text-matches('^\\\\d{3}$')").all();
  const codes: string[] = [];
  for (const n of codeNodes) codes.push((await n.innerText()).trim());
  console.log(`    access codes: ${JSON.stringify(codes)}`);
  if (codes.length < 2) throw new Error(`expected 2 codes, got ${codes.length}`);
  // Tickets render newest-first; the kombi-leg sequence we want is reversed
  // (leg 1 was minted first, so it appears LAST in the wallet list).
  const leg1Code = codes[codes.length - 1];
  const leg2Code = codes[codes.length - 2];
  console.log(`    leg1=${leg1Code}, leg2=${leg2Code}`);

  step("4. close wallet → Journey sheet should be visible");
  await tendai.getByRole("button", { name: /Close wallet/ }).first().click();
  await tendai.waitForTimeout(800);
  const stage1 = await waitForStage(
    tendai,
    (k, i) => k === "walk-to-board" && i === "1",
    20_000,
  );
  console.log(`    journey stage after booking: kind=${stage1.kind} index=${stage1.index}`);
  if (stage1.kind !== "walk-to-board") {
    throw new Error(`expected walk-to-board after booking, got kind=${stage1.kind}`);
  }
  await tendai.screenshot({ path: "phase35-stage1-walk-to-board.png" });
  console.log("    captured phase35-stage1-walk-to-board.png");

  // 2. Farai redeems leg 1.
  step(`5. farai assign ${LEG1_VEHICLE} + redeem ${leg1Code}`);
  await ensureConductorOnVehicle(farai, LEG1_VEHICLE);
  await typeCode(farai, leg1Code);
  let feedback = await readKombiFeedback(farai);
  console.log(`    leg1 feedback: ${feedback}`);
  if (!/Cleared/i.test(feedback) && !/redeemed/i.test(feedback)) {
    throw new Error(`leg1 redeem failed: ${feedback}`);
  }

  step("6. tendai sheet should advance past walk-to-board");
  // Boarding flash is ~1.1s; we may catch it or the steady in-transit state.
  const stage23 = await waitForStage(
    tendai,
    (k) => k === "boarding" || k === "in-transit" || k === "walking-transfer",
    30_000,
  );
  console.log(`    leg1 stage: kind=${stage23.kind} index=${stage23.index}`);
  await tendai.screenshot({ path: "phase35-stage2or3-after-leg1.png" });
  console.log("    captured phase35-stage2or3-after-leg1.png");

  // 3. Farai switches to ZH 5101 and redeems leg 2.
  step(`7. farai switch to ${LEG2_VEHICLE} + redeem ${leg2Code}`);
  await ensureConductorOnVehicle(farai, LEG2_VEHICLE);
  await typeCode(farai, leg2Code);
  feedback = await readKombiFeedback(farai);
  console.log(`    leg2 feedback: ${feedback}`);
  if (!/Cleared/i.test(feedback) && !/redeemed/i.test(feedback)) {
    throw new Error(`leg2 redeem failed: ${feedback}`);
  }

  step("8. tendai sheet should reach boarding-leg-2 or in-transit on leg 2");
  const stage5 = await waitForStage(
    tendai,
    (k, i) => k === "boarding-leg-2" || (k === "in-transit" && i === "5") || k === "arrived",
    30_000,
  );
  console.log(`    leg2 stage: kind=${stage5.kind} index=${stage5.index}`);
  await tendai.screenshot({ path: "phase35-stage5or6-after-leg2.png" });
  console.log("    captured phase35-stage5or6-after-leg2.png");

  step("9. final journey snapshot");
  const final = await readJourneyState(tendai);
  console.log(`    final state: ${JSON.stringify(final)}`);

  step("DONE — Phase 3.5 prod smoke completed");
  await browser.close();
}

main().catch((err) => {
  console.error("\n[smoke FAILED]", err);
  process.exit(1);
});
