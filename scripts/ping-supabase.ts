/**
 * Daily heartbeat ping. Prevents Supabase free tier from pausing after
 * 7 days of inactivity. Wired into .github/workflows/supabase-keepalive.yml.
 *
 * Run locally: pnpm ping
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("Supabase env vars missing");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const { error, count } = await supabase
  .from("users")
  .select("*", { count: "exact", head: true });

if (error) {
  console.error("Ping failed:", error.message);
  process.exit(1);
}

console.log(`Ping OK · users count = ${count} · ${new Date().toISOString()}`);
