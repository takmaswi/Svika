/**
 * Phase 2 production smoke — drives the real https://svika.vercel.app surface
 * end-to-end with a fresh chromium profile (no shared user-data-dir).
 *
 *   tendai → search → buy → wallet → transfer to rudo → claim as rudo
 *
 * Run: npx tsx scripts/phase2-prod-smoke.ts
 */

import { chromium } from "@playwright/test";

const BASE = "https://svika.vercel.app";

function step(label: string) {
  console.log(`\n[smoke] ${label}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console error]", msg.text());
  });

  step("1. open /?as=tendai");
  await page.goto(`${BASE}/?as=tendai`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#trip-search", { timeout: 15000 });
  console.log("    persona + search bar rendered");

  step("2. click 'Heights to Avondale' preset");
  await page.getByRole("button", { name: "Heights to Avondale" }).click();
  // Wait for at least one plan card with a Buy button.
  try {
    await page.getByRole("button", { name: /Buy for \$/i }).first().waitFor({ timeout: 30000 });
  } catch (err) {
    const errorBanner = await page.locator("text=/Search failed|Could not identify|enough credit/").allInnerTexts();
    const headerText = await page.locator("header").innerText();
    console.error(`    plan list never rendered; header text:\n${headerText}\n    error banners: ${JSON.stringify(errorBanner)}`);
    throw err;
  }
  const planButtons = await page.getByRole("button", { name: /Buy for \$/i }).all();
  console.log(`    plans returned: ${planButtons.length}`);

  step("3. buy fastest option ($1.50)");
  await page.getByRole("button", { name: /Buy for \$1\.50/ }).click();
  // Wallet auto-opens with two tickets.
  await page.getByText(/access code/i).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => null);
  // Access codes are 3 digits in font-mono — locate them inside the wallet.
  await page.getByRole("heading", { name: "Wallet" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  const codeNodes = await page
    .locator("aside :text-matches('^\\\\d{3}$')")
    .all();
  const codes: string[] = [];
  for (const n of codeNodes) codes.push((await n.innerText()).trim());
  console.log(`    access codes minted: ${JSON.stringify(codes)}`);
  if (codes.length < 2) {
    throw new Error(`expected ≥2 codes, got ${codes.length}`);
  }

  step("4. tap 'Share / transfer' on the first ticket");
  await page.getByRole("button", { name: "Share / transfer" }).first().click();
  await page.getByRole("button", { name: /Transfer to Rudo/ }).waitFor({ timeout: 5000 });

  step("5. transfer to Rudo");
  await page.getByRole("button", { name: /Transfer to Rudo/ }).click();
  // Wait for the success banner with "Sent to Rudo".
  await page.getByText(/Sent to Rudo/).waitFor({ timeout: 15000 });
  // Read the clipboard share URL via the page's clipboard.
  let shareUrl = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  console.log(`    share url: ${shareUrl}`);
  let claimMatch = shareUrl.match(/claim=([0-9a-f-]{36})/i);
  if (!claimMatch) {
    // Fall back: hit the "Share again" button to copy, then re-read.
    await page.getByRole("button", { name: "Share again" }).click().catch(() => null);
    await page.waitForTimeout(500);
    shareUrl = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    console.log(`    share url (retry): ${shareUrl}`);
    claimMatch = shareUrl.match(/claim=([0-9a-f-]{36})/i);
    if (!claimMatch) throw new Error("no ticket id in share URL");
  }
  const claimId = claimMatch[1];
  console.log(`    ticket id to claim: ${claimId}`);

  step("6. open /?as=rudo&claim=<id>");
  await page.goto(`${BASE}/?as=rudo&claim=${claimId}`, { waitUntil: "domcontentloaded" });
  // Auto-claim opens the wallet with a confirmation banner.
  await page.getByText(/in Rudo's wallet/).waitFor({ timeout: 15000 });
  console.log("    claim banner: visible");

  step("7. confirm Rudo's wallet contains the ticket");
  // Wallet drawer should show the same access code we transferred.
  await page.getByRole("heading", { name: "Wallet" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const rudoCodes = await page
    .locator("aside :text-matches('^\\\\d{3}$')")
    .allInnerTexts();
  console.log(`    rudo wallet codes: ${JSON.stringify(rudoCodes)}`);
  const hasTransferred = rudoCodes.some((c) => codes.includes(c.trim()));
  if (!hasTransferred) {
    throw new Error(`transferred code missing in Rudo's wallet (had ${JSON.stringify(rudoCodes)})`);
  }

  step("DONE — Phase 2 prod smoke passed");
  await browser.close();
}

main().catch((err) => {
  console.error("\n[smoke FAILED]", err);
  process.exit(1);
});
