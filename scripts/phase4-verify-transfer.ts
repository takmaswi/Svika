/**
 * Read-only verification — confirms the WA `transfer 775 to +263772000002`
 * step landed the expected rows: tickets.status='transferred_pending' and
 * a fresh transfers row from Takunda → Rudo.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-verify-transfer.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(URL, KEY, {
  auth: { persistSession: false },
});

async function main(): Promise<void> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, access_code, status, kind, current_holder_user_id, originating_user_id",
    )
    .eq("access_code", "775")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log("ticket:", JSON.stringify(ticket, null, 2));
  if (!ticket) return;

  const { data: transfer } = await supabase
    .from("transfers")
    .select(
      "id, from_user_id, to_user_id, to_phone, transferred_at, claimed_at",
    )
    .eq("ticket_id", ticket.id)
    .order("transferred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log("transfer:", JSON.stringify(transfer, null, 2));

  const ids = [transfer?.from_user_id, transfer?.to_user_id].filter(
    (v): v is string => Boolean(v),
  );
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, phone")
      .in("id", ids);
    console.log("users:", JSON.stringify(users, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
