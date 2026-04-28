/**
 * Phase 3.7 screenshot tour — captures the brand landing, passenger empty
 * state, payment-choice sheet, top-up sheet, persona action sheet, and the
 * conductor cash badge. Pointed at a running prod URL via BASE env var.
 *
 *   pnpm tsx --env-file=.env.local scripts/phase3-7-shots.ts
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3030";
const OUT_DIR = join(process.cwd(), "scripts", "phase3-7-screenshots");

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err.message));

  // 1. Brand landing.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Try the demo");
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(OUT_DIR, "01-landing.png"),
    fullPage: false,
  });
  console.log("[ok] 01-landing.png");

  // 2. Passenger empty state.
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]');
  await page.waitForTimeout(1100);
  await page.screenshot({
    path: join(OUT_DIR, "02-passenger-empty.png"),
    fullPage: false,
  });
  console.log("[ok] 02-passenger-empty.png");

  // 3. Persona action sheet.
  await page.click('[data-testid="persona-chip"]');
  await page.waitForSelector('[data-testid="persona-action-sheet"]');
  await page.waitForTimeout(450);
  await page.screenshot({
    path: join(OUT_DIR, "03-persona-action-sheet.png"),
    fullPage: false,
  });
  console.log("[ok] 03-persona-action-sheet.png");
  await page.click('[data-testid="persona-action-cancel"]');

  // 4. Plan results, then payment-choice sheet.
  await page.click('[data-testid="quick-pick-featured"]');
  await page.waitForSelector("text=Buy for $1.50", { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.click("text=Buy for $1.50");
  await page.waitForSelector('[data-testid="journey-sheet-content"][data-state="choosing-payment"]');
  await page.waitForTimeout(450);
  await page.screenshot({
    path: join(OUT_DIR, "04-payment-choice.png"),
    fullPage: false,
  });
  console.log("[ok] 04-payment-choice.png");

  // 5. Top-up sheet (open from payment choice if balance < fare; otherwise just
  // open it directly via the close+reopen flow). Some demo personas start with
  // $5; force the disabled-balance path with a query.
  await page.goto(`${BASE}/?as=rudo`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="quick-pick-samlevys"]'); // Sam Levy's $3
  await page.waitForSelector("text=Buy for $3.00", { timeout: 8000 });
  await page.click("text=Buy for $3.00");
  await page.waitForSelector('[data-testid="journey-sheet-content"][data-state="choosing-payment"]');
  // If Rudo has < $3 the wallet button is replaced by Top up.
  const topUpButton = await page.$('[data-testid="payment-topup"]');
  if (topUpButton) {
    await topUpButton.click();
    await page.waitForSelector('[data-testid="top-up-sheet"]');
    await page.waitForTimeout(450);
    await page.screenshot({
      path: join(OUT_DIR, "05-top-up.png"),
      fullPage: false,
    });
    console.log("[ok] 05-top-up.png");
  } else {
    await page.screenshot({
      path: join(OUT_DIR, "05-top-up.png"),
      fullPage: false,
    });
    console.log("[skip] Rudo had enough balance — captured payment sheet.");
  }

  // 6. Conductor cash badge — initial render only; full cash flow needs a
  // matching cash ticket and is exercised manually.
  await page.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Hwindi");
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(OUT_DIR, "06-conductor.png"),
    fullPage: false,
  });
  console.log("[ok] 06-conductor.png");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
