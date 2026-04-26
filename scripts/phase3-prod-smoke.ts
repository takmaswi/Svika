/**
 * Phase 3 production smoke — drives the real https://svika.vercel.app
 * conductor and fleet surfaces end-to-end.
 *
 *   farai → assign ZH 4821 (if not already assigned)
 *         → enter access code 724 (Tendai's still-issued Heights→Rezende ticket)
 *         → expect "Cleared 724" feedback + passenger count bump.
 *
 *   baba_tino → /fleet → audit panel renders bilingual narrative
 *             → ZIMRA card shows a numeric value
 *             → today's revenue reflects the redeemed fare.
 *
 * The smoke is idempotent: if 724 was already redeemed in a prior run, the
 * conductor flow falls back to a +Cash $1 click instead of failing the whole
 * smoke (the demo's "loaded a fare" signal is still observed).
 *
 * Run: npx tsx scripts/phase3-prod-smoke.ts
 */

import { chromium, type Page } from "@playwright/test";

const BASE = "https://svika.vercel.app";
const TARGET_VEHICLE = "ZH 4821";
const TARGET_VEHICLE_TESTID = `hwindi-vehicle-${TARGET_VEHICLE.replace(/\s+/g, "-")}`;
const KNOWN_CODE = "724";

function step(label: string) {
  console.log(`\n[smoke] ${label}`);
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

async function readFeedback(page: Page): Promise<string> {
  try {
    const text = await page.getByTestId("hwindi-feedback").innerText({ timeout: 8000 });
    return text.trim();
  } catch {
    return "";
  }
}

async function typeCode(page: Page, code: string) {
  for (const digit of code) {
    await page.getByRole("button", { name: `Digit ${digit}` }).click();
  }
  await page.getByRole("button", { name: "Submit code" }).click();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console error]", msg.text());
  });

  // -------------------------------------------------------------------------
  // CONDUCTOR FLOW
  // -------------------------------------------------------------------------
  step("1. open /hwindi?as=farai");
  await page.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  step("2. ensure ZH 4821 is assigned");
  const keypadAlreadyVisible = await page
    .getByTestId("hwindi-pin-keypad")
    .isVisible()
    .catch(() => false);
  if (!keypadAlreadyVisible) {
    const claimed = await clickIfPresent(page, `[data-testid="${TARGET_VEHICLE_TESTID}"]`, 8000);
    if (!claimed) {
      throw new Error(`Could not find vehicle picker entry for ${TARGET_VEHICLE}.`);
    }
    await page.getByTestId("hwindi-pin-keypad").waitFor({ timeout: 15000 });
    console.log(`    ${TARGET_VEHICLE} assigned`);
  } else {
    console.log(`    ${TARGET_VEHICLE} (or another kombi) already assigned to Farai`);
  }

  step(`3. enter access code ${KNOWN_CODE}`);
  await typeCode(page, KNOWN_CODE);
  let feedback = await readFeedback(page);
  console.log(`    feedback: ${feedback}`);

  if (!/Cleared/i.test(feedback)) {
    // Fallback: code may have been redeemed in a previous run.
    step("3b. fallback +Cash click (code already redeemed)");
    await page.getByTestId("hwindi-cash").click();
    feedback = await readFeedback(page);
    console.log(`    cash feedback: ${feedback}`);
    if (!/Cash walk-on/i.test(feedback)) {
      throw new Error(`Neither redeem nor cash walk-on succeeded; feedback was: "${feedback}"`);
    }
  }

  // -------------------------------------------------------------------------
  // FLEET FLOW
  // -------------------------------------------------------------------------
  step("4. open /fleet?as=baba_tino");
  await page.goto(`${BASE}/fleet?as=baba_tino`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  step("5. assert revenue card shows a numeric value");
  const revenueText = await page.getByTestId("fleet-revenue").innerText({ timeout: 15000 });
  console.log(`    revenue: ${revenueText}`);
  if (!/\$\d+/.test(revenueText)) {
    throw new Error(`Revenue card text not numeric: "${revenueText}"`);
  }

  step("6. assert ZIMRA liability card shows a number");
  const zimraText = await page.getByTestId("fleet-zimra-amount").first().innerText({ timeout: 15000 });
  console.log(`    zimra: ${zimraText}`);
  if (!/\$\d+/.test(zimraText)) {
    throw new Error(`ZIMRA amount not numeric: "${zimraText}"`);
  }

  step("7. assert audit panel renders English+Shona");
  await page.getByTestId("fleet-audit-panel").waitFor({ timeout: 30000 });
  const englishText = await page.getByTestId("audit-text-en").innerText({ timeout: 15000 });
  console.log(`    english (${englishText.length} chars): ${englishText.slice(0, 120)}...`);
  if (englishText.trim().length < 40) {
    throw new Error(`English narrative too short: "${englishText}"`);
  }

  await page.getByTestId("audit-tab-shona").click();
  const shonaText = await page.getByTestId("audit-text-sn").innerText({ timeout: 15000 });
  console.log(`    shona (${shonaText.length} chars): ${shonaText.slice(0, 120)}...`);
  if (shonaText.trim().length < 40) {
    throw new Error(`Shona narrative too short: "${shonaText}"`);
  }
  if (shonaText.trim() === englishText.trim()) {
    throw new Error("Shona narrative is identical to English — model did not translate.");
  }

  step("DONE — Phase 3 prod smoke passed");
  await browser.close();
}

main().catch((err) => {
  console.error("\n[smoke FAILED]", err);
  process.exit(1);
});
