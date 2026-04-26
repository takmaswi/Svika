import { cookies } from "next/headers";

import {
  createServerClient as createSsrServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Server Supabase client for App Router server components and route handlers.
 * Per CLAUDE.md → "RLS" locked decision: demo-only service-role bypass during
 * the sprint. Uses the service-role key on the server side. Real persona-scoped
 * RLS is roadmap, see docs/ROADMAP.md → Phase Eight or post-submission.
 *
 * Returned as `SupabaseClient<Database>` to match the typing path used by the
 * sim runner — the 3-generic form `@supabase/ssr` exposes can collapse table
 * Insert/Update types to `never` once a schema grows past a handful of tables,
 * which broke the Phase 2 trip booking flow during the build.
 */
export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createSsrServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies — silently ignore.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
