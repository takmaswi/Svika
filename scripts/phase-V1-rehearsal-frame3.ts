// scripts/phase-V1-rehearsal-frame3.ts
// Re-capture only frame 3 (heights-idle) after the --sheet-peek bump.
// Pre-req: pnpm dev + pnpm sim:start running in two other terminals.
// Run: pnpm exec tsx --env-file=.env.local scripts/phase-V1-rehearsal-frame3.ts
//
// Drains Takunda first (no active trip, $5 wallet) so the idle sheet renders.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";

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
  console.log("[V1.frame3] drained Takunda → no active trips, $5 wallet");
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
    viewport: { width: 393, height: 852 },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // Landing → suburb picker (avoids geolocation prompt) → Mt Pleasant Heights
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="landing-find-kombis"]', {
    timeout: 15_000,
  });
  await page.click('[data-testid="landing-pick-suburb"]');
  await page.waitForSelector('[data-testid="landing-suburb-picker"]', {
    timeout: 4000,
  });
  await page.click('[data-testid="landing-suburb-mount-pleasant-heights"]');
  await page.waitForURL(/lat=.+&lng=.+/, { timeout: 8000 });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2500); // let map tiles paint

  const path = "scripts/phase-V1-rehearsal-3.png";
  await page.screenshot({ path, fullPage: false });
  console.log(`[V1.frame3] heights-idle · ${path}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
