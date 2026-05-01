import { createServerClient } from "@/lib/supabase/server";

export type Role = "passenger" | "conductor" | "fleet_owner";

export interface Persona {
  id: string;
  name: string;
  phone: string;
  role: Role;
  credit_balance_usd: number;
}

const FALLBACKS: Record<string, Persona> = {
  takunda: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Takunda",
    phone: "+263700000010",
    role: "passenger",
    credit_balance_usd: 5,
  },
  rudo: {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Rudo",
    phone: "+263700000011",
    role: "passenger",
    credit_balance_usd: 2,
  },
  farai: {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Farai",
    phone: "+263700000012",
    role: "conductor",
    credit_balance_usd: 0,
  },
  baba_tino: {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Baba Tino",
    phone: "+263700000013",
    role: "fleet_owner",
    credit_balance_usd: 0,
  },
};

const DEFAULTS: Record<Role, string> = {
  passenger: "takunda",
  conductor: "farai",
  fleet_owner: "baba_tino",
};

/**
 * Resolve the persona for a request based on the `?as=` query parameter.
 * For the hackathon there is NO real authentication — see CLAUDE.md
 * "Locked decisions" → Authentication.
 *
 * Tries the database first, falls back to seeded values so the app
 * keeps working before migrations have run.
 */
export async function resolvePersona(asParam: string | undefined, defaultRole: Role): Promise<Persona> {
  const slug = (asParam ?? DEFAULTS[defaultRole]).toLowerCase();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, name, phone, role, credit_balance_usd")
      .ilike("name", slug.replace("_", " "))
      .maybeSingle();

    if (data && !error) return data as Persona;
  } catch {
    // Database not yet provisioned — use the fallback table.
  }

  return FALLBACKS[slug] ?? FALLBACKS[DEFAULTS[defaultRole]];
}
