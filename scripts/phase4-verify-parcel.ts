/**
 * Read-only verification — confirms the parcel ticket the smoke just minted
 * has the right shape in the database (kind='parcel', receiver phone, status,
 * vehicle pinned by the conductor accept).
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-verify-parcel.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(URL, KEY, {
  auth: { persistSession: false },
});

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, access_code, kind, status, vehicle_id, route_id, board_at_stop_id, alight_at_stop_id, fare_usd, parcel_receiver_phone, parcel_description, redeemed_at, completed_at, created_at",
    )
    .eq("kind", "parcel")
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
