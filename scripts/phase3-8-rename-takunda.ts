/**
 * Phase 3.8 — rename the demo passenger persona Tendai → Takunda.
 *
 * Data-only update. No schema change. The seed user row keeps its UUID
 * (00000000-0000-0000-0000-000000000001) so every existing ticket, transfer,
 * and trip stays linked to the same persona.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase3-8-rename-takunda.ts
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pre } = await client
    .from("users")
    .select("id, name, phone, role")
    .order("name", { ascending: true });
  console.log("[pre] users:", pre);

  const { error: nameErr } = await client
    .from("users")
    .update({ name: "Takunda", phone: "+263772000010" })
    .eq("name", "Tendai");
  if (nameErr) throw new Error("rename failed: " + nameErr.message);

  const { data: post, error: postErr } = await client
    .from("users")
    .select("id, name, phone, role")
    .order("name", { ascending: true });
  if (postErr) throw new Error("verify failed: " + postErr.message);
  console.log("[post] users:", post);

  const names = (post ?? []).map((u) => u.name).sort();
  const expected = ["Baba Tino", "Farai", "Rudo", "Takunda"];
  const ok = JSON.stringify(names) === JSON.stringify(expected);
  if (!ok) {
    throw new Error(`Unexpected user set: ${JSON.stringify(names)}`);
  }
  console.log("[ok] users now: Takunda, Rudo, Farai, Baba Tino");
}

main().catch((err) => {
  console.error("[rename FAILED]", err);
  process.exit(1);
});
