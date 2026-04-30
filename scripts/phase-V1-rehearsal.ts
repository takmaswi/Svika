// scripts/phase-V1-rehearsal.ts
// Drive localhost:3000 across the 8 V1 rehearsal frames.
// Pre-req: pnpm dev + pnpm sim:start running in two other terminals.
// Run: pnpm exec tsx --env-file=.env.local scripts/phase-V1-rehearsal.ts
//
// Drains Takunda before the run so the script lands on idle (no active
// trip, $5 wallet) every time — same pattern as scripts/phase-R5-rehearsal.ts.
//
// Frames captured (paths surfaced in console):
//   1. landing-hero          — v2 logo, wordmark, Forest CTA, footer
//   2. suburb-picker-open    — modal listing the 6 demo suburbs
//   3. heights-idle          — passenger surface idle, map centered on Heights
//   4. avondale-trip-preview — Avondale quick pick → trip preview card
//   5. wallet-drawer         — Account → Wallet on the v2 brand
//   6. hwindi-keypad         — conductor surface, keypad on v2 brand
//   7. fleet-dashboard       — fleet dashboard, ZIMRA card + audit panel
//   8. wa-companion          — WhatsApp companion, chrome restyled, bubbles green

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";

async function snap(page: Page, n: number, label: string): Promise<void> {
  const path = `scripts/phase-V1-rehearsal-${n}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[V1] ${n} · ${label} · ${path}`);
}

async function drainTakunda(client: SupabaseClient<Database>): Promise<void> {
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
  console.log("[V1] drained Takunda → no active trips, $5 wallet");
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

  // 1. Landing hero (no params)
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="landing-find-kombis"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(1200);
  await snap(page, 1, "landing-hero");

  // 2. Suburb picker open — use the "or pick a suburb" link so we don't trip
  //    geolocation prompt on localhost (the brief calls this out as a known
  //    failure mode for headless rehearsals).
  await page.click('[data-testid="landing-pick-suburb"]');
  await page.waitForSelector('[data-testid="landing-suburb-picker"]', {
    timeout: 4000,
  });
  await page.waitForTimeout(400);
  await snap(page, 2, "suburb-picker-open");

  // 3. Heights — idle passenger surface centered on Mt Pleasant Heights
  await page.click('[data-testid="landing-suburb-mount-pleasant-heights"]');
  await page.waitForURL(/lat=.+&lng=.+/, { timeout: 8000 });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2500); // let map tiles paint
  await snap(page, 3, "heights-idle");

  // Expand the sheet from peek → half so the quick-pick row is reachable.
  // Same pattern as the R5 rehearsal — native page.mouse with a tap on the
  // sheet drag zone cycles peek → half. Pointer-capture-aware so no
  // NotFoundError from setPointerCapture.
  const dragZone = page.locator(
    '[data-testid="journey-sheet"] .svika-sheet-drag-zone',
  );
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

  // 4. Trip preview — Avondale quick pick (the Lomagundi walking transfer)
  await page.click('[data-testid="quick-pick-avondale"]');
  await page.waitForSelector('[data-testid="trip-preview-card"]', {
    timeout: 6000,
  });
  await page.waitForTimeout(700);
  await snap(page, 4, "avondale-trip-preview");

  // 5. Wallet drawer — Account tab → Wallet tile
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
  await snap(page, 5, "wallet-drawer");

  // 6. Conductor — keypad on v2 brand
  await page.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await snap(page, 6, "hwindi-keypad");

  // 7. Fleet — ZIMRA card + audit panel
  await page.goto(`${BASE}/fleet?as=baba_tino`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('[data-testid="fleet-revenue"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
  await snap(page, 7, "fleet-dashboard");

  // 8. WhatsApp companion — chrome restyled, green outgoing bubbles preserved
  await page.goto(`${BASE}/wa?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="wa-shell"]', { timeout: 10_000 });
  await page.waitForTimeout(700);
  await snap(page, 8, "wa-companion");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
