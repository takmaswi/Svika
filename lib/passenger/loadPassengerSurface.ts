import { loadActiveJourney } from "@/lib/passenger/journey";
import { loadLiveStats } from "@/lib/passenger/liveStats";
import { loadNetwork } from "@/lib/network/loadNetwork";
import { loadWallet } from "@/lib/passenger/wallet";
import { resolvePersona, type Persona } from "@/lib/personas";
import { createServerClient } from "@/lib/supabase/server";
import type { KombiTickPayload } from "@/lib/sim/simRunner";
import type { ActiveJourney } from "@/lib/passenger/journey-types";
import type { LiveStats } from "@/lib/passenger/liveStats";
import type { NetworkPayload } from "@/lib/network/loadNetwork";
import type { WalletTicket } from "@/lib/passenger/wallet";

export interface PassengerSurfaceData {
  persona: Persona;
  personaSlug: string;
  network: NetworkPayload;
  mapboxToken: string;
  initialTickets: WalletTicket[];
  initialJourney: ActiveJourney | null;
  initialKombis: KombiTickPayload[];
  liveStats: LiveStats;
  pendingClaim: string | null;
}

interface VehicleRowMinimal {
  id: string;
  route_id: string;
  current_position: string | null;
  last_position_at: string | null;
  direction: "outbound" | "inbound" | null;
}

/**
 * Parses PostGIS geography Point — accepts both WKT and PostgREST's hex EWKB.
 * Returns null for anything else; the kombi just won't seed in that case.
 */
function parsePoint(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const wkt = /POINT\(([-\d.]+)\s+([-\d.]+)\)/i.exec(raw);
  if (wkt) {
    const lng = Number(wkt[1]);
    const lat = Number(wkt[2]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lat, lng };
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(raw) || raw.length < 50) return null;
  try {
    const buf = Buffer.from(raw, "hex");
    if (buf.length < 25) return null;
    if (buf.readUInt8(0) !== 1) return null;
    const lng = buf.readDoubleLE(9);
    const lat = buf.readDoubleLE(17);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function loadInitialKombis(): Promise<KombiTickPayload[]> {
  try {
    const client = await createServerClient();
    const { data } = await client
      .from("vehicles")
      .select("id, route_id, current_position, last_position_at, direction");
    const rows = (data ?? []) as VehicleRowMinimal[];
    const out: KombiTickPayload[] = [];
    for (const row of rows) {
      if (!row.current_position) continue;
      const point = parsePoint(row.current_position);
      if (!point) continue;
      out.push({
        vehicle_id: row.id,
        route_id: row.route_id,
        lat: point.lat,
        lng: point.lng,
        direction: row.direction ?? "outbound",
        bearing: 0,
        at: row.last_position_at ?? new Date().toISOString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Server-side composition for the passenger surface. Shared between the
 * landing dispatcher and any future deep-linked entry points so the data
 * graph stays in one place.
 */
export async function loadPassengerSurface(args: {
  asParam?: string;
  claimParam?: string;
}): Promise<PassengerSurfaceData> {
  const personaSlug = (args.asParam ?? "takunda").toLowerCase();
  const persona = await resolvePersona(personaSlug, "passenger");
  const [network, tickets, journey, liveStats, initialKombis] =
    await Promise.all([
      loadNetwork(),
      loadWallet(persona.id),
      loadActiveJourney(persona.id),
      loadLiveStats(),
      loadInitialKombis(),
    ]);
  return {
    persona,
    personaSlug,
    network,
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
    initialTickets: tickets,
    initialJourney: journey,
    initialKombis,
    liveStats,
    pendingClaim: args.claimParam ?? null,
  };
}
