/**
 * Phase A rehearsal — drives the post-book moment locally and proves:
 *  1. After booking, the wallet drawer does NOT slide over the journey card.
 *  2. The post-book confirmation toast auto-dismisses 6 s later, leaving
 *     the journey card unobstructed.
 *
 * Steps:
 *  - Drain Takunda's active tickets and top him up to $5 so the wallet has
 *    enough to pay the $1.50 Heights → Avondale featured plan.
 *  - Open http://localhost:3000/?as=takunda in headed Chromium at 390x844.
 *  - Click the FEATURED bento tile.
 *  - Click the first "Buy for $X.XX" CTA in the plan list.
 *  - Click "Pay $X.XX from wallet" in the payment choice sheet.
 *  - Wait for [data-phase-a="post-book-toast"] + [data-testid="journey-sheet"].
 *  - Capture scripts/phase-A-rehearsal-1-post-book.png.
 *  - Wait 6.5 s for the auto-dismiss.
 *  - Capture scripts/phase-A-rehearsal-2-toast-dismissed.png.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase-A-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOT_1 = join(SCREENSHOT_DIR, "phase-A-rehearsal-1-post-book.png");
const SHOT_2 = join(SCREENSHOT_DIR, "phase-A-rehearsal-2-toast-dismissed.png");

function log(label: string): void {
  console.log(`\n[phase-A] ${label}`);
}

async function resetTakunda(
  client: SupabaseClient<Database>,
): Promise<{ takundaId: string }> {
  log("0. resolve Takunda, drain active tickets, top up to $5");
  const { data: users, error } = await client
    .from("users")
    .select("id, name")
    .eq("name", "Takunda");
  if (error || !users || users.length === 0) {
    throw new Error("Could not resolve Takunda: " + error?.message);
  }
  const takundaId = users[0].id;

  // Drain active trips so the empty hero (bento) renders.
  const { data: openTrips } = await client
    .from("trips")
    .select("id")
    .eq("originating_user_id", takundaId)
    .is("completed_at", null);
  if (openTrips && openTrips.length > 0) {
    await client
      .from("trips")
      // The TripRow type does not surface `completed_at` even though the
      // column exists in the live schema; the rehearsal needs to mark trips
      // closed so the empty hero re-renders.
      // @ts-expect-error — schema/types drift; safe at runtime.
      .update({ completed_at: new Date().toISOString() })
      .in(
        "id",
        openTrips.map((t) => t.id),
      );
  }

  // Drain any active Takunda-held tickets.
  await client
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("current_holder_user_id", takundaId)
    .in("status", ["issued", "held", "redeemed"]);

  // Restore wallet to a clean $5.
  await client
    .from("users")
    .update({ credit_balance_usd: 5 })
    .eq("id", takundaId);

  console.log(`    takunda=${takundaId} balance=$5.00`);
  return { takundaId };
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await resetTakunda(client);

  // Mapbox GL v3 + the SVG kombi icon has a chromium-headless quirk where
  // page.screenshot captures a transparent canvas. Run headed so the
  // rehearsal evidence reflects what a passenger sees.
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

  log("1. open /?as=takunda");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });

  log("2. click featured quick pick (Heights → Avondale)");
  await page.waitForSelector('[data-testid="quick-pick-featured"]', {
    timeout: 30_000,
  });
  await page.click('[data-testid="quick-pick-featured"]');

  log("3. wait for plan list, click first Buy CTA");
  // PlanList renders inside the glass-strong panel; the first button with
  // text "Buy for $" is the cheapest plan. The AI parse can take 30-90s on
  // cold start, so allow a generous timeout here.
  const buyButton = page.locator("button", { hasText: "Buy for $" }).first();
  await buyButton.waitFor({ state: "visible", timeout: 120_000 });
  await buyButton.click();

  log("4. payment choice sheet → pay from wallet");
  await page.waitForSelector(
    '[data-testid="journey-sheet-content"][data-state="choosing-payment"]',
    { timeout: 10_000 },
  );
  await page.click('[data-testid="payment-wallet"]');

  log("5. wait for post-book toast and journey card");
  await page.waitForSelector('[data-phase-a="post-book-toast"]', {
    timeout: 20_000,
  });
  await page.waitForSelector('[data-testid="journey-sheet"]', {
    timeout: 20_000,
  });

  // Wallet returns null when closed, so the absence of any "Close wallet"
  // button proves the drawer is not rendered. This is the regression check
  // Phase A is built around: handleBook must not trigger setWalletOpen(true).
  const walletButtons = await page
    .locator('button[aria-label="Close wallet"]')
    .count();
  if (walletButtons > 0) {
    throw new Error(
      "FAIL: wallet drawer is open after booking — Phase A regression",
    );
  }
  console.log("    wallet drawer closed: OK");

  log("6. capture screenshot 1 (post-book, toast visible, journey dominant)");
  // Settle one paint frame so the toast and journey card are stable.
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT_1 });
  console.log(`    wrote ${SHOT_1}`);

  log("7. wait 6.5 s for auto-dismiss");
  await page.waitForTimeout(6500);

  const stillThere = await page.locator('[data-phase-a="post-book-toast"]').count();
  if (stillThere > 0) {
    throw new Error(
      "FAIL: post-book-toast did not auto-dismiss after 6 s — Phase A regression",
    );
  }
  console.log("    toast dismissed: OK");

  log("8. capture screenshot 2 (toast gone, journey card unobstructed)");
  await page.screenshot({ path: SHOT_2 });
  console.log(`    wrote ${SHOT_2}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-A FAILED]", err);
  process.exit(1);
});
