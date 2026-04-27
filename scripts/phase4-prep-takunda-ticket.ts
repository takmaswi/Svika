/**
 * One-shot prep — guarantees Takunda owns at least one active passenger
 * ticket so the WA `transfer NNN to +PHONE` step in phase4-prod-smoke has
 * something real to send. Idempotent: skips when a ticket already exists.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-prep-takunda-ticket.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(URL, KEY, {
  auth: { persistSession: false },
});

function randomCode(): string {
  return Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
}

async function main(): Promise<void> {
  const { data: takunda } = await supabase
    .from("users")
    .select("id, name, credit_balance_usd")
    .ilike("name", "Takunda")
    .maybeSingle();
  if (!takunda) {
    console.error("Takunda persona missing.");
    process.exit(1);
  }

  const { data: existing } = await supabase
    .from("tickets")
    .select("access_code, status")
    .eq("current_holder_user_id", takunda.id)
    .eq("kind", "passenger")
    .in("status", ["issued", "held"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    console.log(`Takunda already holds ${existing.access_code} (${existing.status}).`);
    return;
  }

  // Mint a single-leg Heights → UZ ticket. Same route as Farai's ZH 4821 so
  // a transfer-then-redeem chain is plausible if Cowork wants to demo it.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const access_code = randomCode();
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        access_code,
        route_id: "route_heights_rezende",
        board_at_stop_id: "sp_heights_start_north",
        alight_at_stop_id: "sp_uz_gate",
        fare_usd: 1.0,
        originating_user_id: takunda.id,
        current_holder_user_id: takunda.id,
        status: "issued",
        kind: "passenger",
        payment_method: "wallet",
      })
      .select("access_code")
      .single();
    if (!error && data) {
      console.log(`Minted Takunda passenger ticket ${data.access_code}.`);
      return;
    }
    if (error?.code !== "23505") {
      console.error("Insert failed:", error?.message);
      process.exit(1);
    }
  }
  console.error("Could not assign a unique access code after 12 retries.");
  process.exit(1);
}

main();
