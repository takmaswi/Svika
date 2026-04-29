// scripts/phase-R5-rehearsal.ts
// Drive localhost:3000 across the 10 R5 rehearsal frames.
// Pre-req: pnpm dev + pnpm sim:start running in two other terminals.
// Run: pnpm exec tsx --env-file=.env.local scripts/phase-R5-rehearsal.ts
//
// Drains Takunda before the run so the script lands on idle (no active
// trip, $5 wallet) every time — same pattern as scripts/phase-D-rehearsal.ts.
//
// Frames captured (paths surfaced in console):
//   1. idle-light            — passenger idle, white surface, Apple-blue route
//   2. account-drawer-light  — Account tab → PersonaDrawer with Display section
//   3. theme-toggle-fired    — mid-toggle (light → dark)
//   4. idle-dark             — passenger idle, dark surface, route still Apple-blue
//   5. trip-preview-light    — Avondale quick pick → trip preview card
//   6. payment-choice-light  — Continue → payment-choice sheet
//   7. wallet-light          — Account drawer → Wallet
//   8. hwindi-light          — conductor surface
//   9. fleet-light           — fleet dashboard
//  10. wa-light              — WhatsApp companion (chrome restyled, bubbles green)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";

async function snap(page: Page, n: number, label: string): Promise<void> {
  const path = `scripts/phase-R5-rehearsal-${n}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[R5] ${n} · ${label} · ${path}`);
}

async function drainTakunda(
  client: SupabaseClient<Database>,
): Promise<void> {
  const { data: takunda } = await client
    .from("users")
    .select("id")
    .eq("name", "Takunda")
    .maybeSingle();
  if (!takunda) throw new Error("Takunda user missing");
  await client
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("current_holder_user_id", takunda.id)
    .in("status", ["issued", "held", "redeemed"]);
  await client
    .from("users")
    .update({ credit_balance_usd: 5 })
    .eq("id", takunda.id);
  console.log("[R5] drained Takunda → no active trips, $5 wallet");
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local",
    );
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await drainTakunda(client);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, // iPhone 14 Pro
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // 1. Idle, light theme
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2500); // let map tiles paint
  await snap(page, 1, "idle-light");

  // 2. Account tab open, light
  await page.click('[data-testid="svika-tab-account"]');
  await page.waitForSelector('[data-testid="persona-drawer"][data-open="true"]', {
    timeout: 4000,
  });
  await page.waitForTimeout(500);
  await snap(page, 2, "account-drawer-light");

  // 3. Theme toggle tap (light → dark mid-animation)
  await page.click('[data-testid="svika-theme-toggle"]');
  await page.waitForTimeout(900);
  await snap(page, 3, "theme-toggle-fired");

  // 4. Idle, dark — close drawer first
  await page.click('[data-testid="svika-tab-home"]');
  await page.waitForTimeout(2000);
  await snap(page, 4, "idle-dark");

  // Flip back to light for the rest
  await page.click('[data-testid="svika-tab-account"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="svika-theme-toggle"]');
  await page.waitForTimeout(700);
  await page.click('[data-testid="svika-tab-home"]');
  await page.waitForTimeout(1500);

  // Expand the sheet from peek → half so the quick-pick row is no longer
  // sitting beneath the floating tab bar. Use Playwright's native mouse API
  // (page.mouse.down/up) instead of `dispatchEvent(new PointerEvent(...))`
  // — the latter throws `NotFoundError` from the JourneySheet's
  // `setPointerCapture(e.pointerId)` call because synthetic dispatched
  // events don't register as active pointers in the browser's pointer
  // system. Native page.mouse.* registers a real pointer; setPointerCapture
  // succeeds; no Next.js dev-tools "1 Issue" badge appears in the captures.
  // The drag-zone handle cycles peek → half → full on a sub-8px tap.
  const dragZone = page.locator('[data-testid="journey-sheet"] .svika-sheet-drag-zone');
  const dragBox = await dragZone.boundingBox();
  if (!dragBox) {
    throw new Error("Could not locate sheet drag zone bounding box");
  }
  const dragX = dragBox.x + dragBox.width / 2;
  const dragY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="journey-sheet"]')
        ?.getAttribute("data-snap") === "half",
    undefined,
    { timeout: 4000 },
  );
  await page.waitForTimeout(500);

  // 5. Trip preview — Avondale quick pick
  await page.click('[data-testid="quick-pick-avondale"]');
  await page.waitForSelector('[data-testid="trip-preview-card"]', {
    timeout: 6000,
  });
  await page.waitForTimeout(700);
  await snap(page, 5, "trip-preview-light");

  // 6. Payment-choice — tap "Buy" on the preview to advance
  await page.click('[data-testid="trip-preview-buy"]');
  await page.waitForSelector('[data-testid="payment-wallet"]', {
    timeout: 6000,
  });
  await page.waitForTimeout(500);
  await snap(page, 6, "payment-choice-light");

  // 7. Wallet — Account → Wallet tile. The payment sheet may have wallet-charged
  // and started a trip; we still want to capture the wallet view, so open it
  // from the Account tab regardless of current state.
  await page.click('[data-testid="svika-tab-account"]');
  await page.waitForSelector('[data-testid="persona-drawer"][data-open="true"]', {
    timeout: 4000,
  });
  await page.waitForTimeout(300);
  await page.click('[data-testid="persona-drawer-wallet"]');
  await page.waitForSelector('[data-testid="wallet-content"]', {
    timeout: 4000,
  });
  await page.waitForTimeout(500);
  await snap(page, 7, "wallet-light");

  // 8. /hwindi
  await page.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await snap(page, 8, "hwindi-light");

  // 9. /fleet
  await page.goto(`${BASE}/fleet?as=baba_tino`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="fleet-revenue"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
  await snap(page, 9, "fleet-light");

  // 10. /wa
  await page.goto(`${BASE}/wa?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="wa-shell"]', { timeout: 10_000 });
  await page.waitForTimeout(700);
  await snap(page, 10, "wa-light");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
