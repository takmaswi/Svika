/**
 * Server-side wallet reader for the passenger surface.
 *
 * Pulls the persona's active tickets — anything held, issued, in transit, or
 * already redeemed today. Joins route + stop names from the seed file rather
 * than from the database, so the wallet renders even when the geo RPCs are
 * not present.
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";
import type { TicketRow, TicketStatus } from "@/lib/supabase/types";

const seed = network as unknown as SeedNetwork;

const stopNameById = new Map<string, string>();
const routeNameById = new Map<string, string>();
for (const r of seed.routes) {
  routeNameById.set(r.id, r.name);
  for (const s of r.stop_points) {
    if (!stopNameById.has(s.id)) stopNameById.set(s.id, s.name);
  }
}

export interface WalletTicket {
  id: string;
  access_code: string;
  status: TicketStatus;
  fare_usd: number;
  route_id: string;
  route_name: string;
  board_at_stop_id: string;
  board_at_stop_name: string;
  alight_at_stop_id: string;
  alight_at_stop_name: string;
  kind: "passenger" | "parcel";
  is_outgoing_transfer: boolean;
  created_at: string;
}

const ACTIVE_STATUSES: TicketStatus[] = [
  "issued",
  "held",
  "transferred_pending",
  "redeemed",
];

export async function loadWallet(personaId: string): Promise<WalletTicket[]> {
  try {
    const client = await createServerClient();

    // Pull anything the persona is involved with — current holder OR original
    // payer. The "outgoing transfer" view of a ticket the persona paid for
    // but no longer holds is what tells Takunda "Transferred to Rudo".
    const { data, error } = await client
      .from("tickets")
      .select(
        "id, access_code, status, fare_usd, route_id, board_at_stop_id, alight_at_stop_id, originating_user_id, current_holder_user_id, kind, created_at",
      )
      .or(`current_holder_user_id.eq.${personaId},originating_user_id.eq.${personaId}`)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return (data as TicketRow[]).map((t) => ({
      id: t.id,
      access_code: t.access_code,
      status: t.status,
      fare_usd: Number(t.fare_usd),
      route_id: t.route_id,
      route_name: routeNameById.get(t.route_id) ?? t.route_id,
      board_at_stop_id: t.board_at_stop_id,
      board_at_stop_name: stopNameById.get(t.board_at_stop_id) ?? t.board_at_stop_id,
      alight_at_stop_id: t.alight_at_stop_id,
      alight_at_stop_name: stopNameById.get(t.alight_at_stop_id) ?? t.alight_at_stop_id,
      kind: t.kind,
      is_outgoing_transfer:
        t.originating_user_id === personaId && t.current_holder_user_id !== personaId,
      created_at: t.created_at,
    }));
  } catch {
    return [];
  }
}
