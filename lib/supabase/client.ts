"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";

/**
 * Browser Supabase client. Reads cookies/local storage for any session that
 * may exist in the future. For the hackathon there is no real auth — the
 * client is used for anonymous reads and Realtime subscriptions only.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
