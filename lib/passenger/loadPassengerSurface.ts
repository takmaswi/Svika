import along from "@turf/along";
import length from "@turf/length";
import { lineString } from "@turf/helpers";

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
        progressMeters: 0,
        at: row.last_position_at ?? new Date().toISOString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Haversine distance in metres between two lat/lng pairs. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const COLOCATED_RADIUS_M = 5;

/**
 * The seed loader places both vehicles per route at the same polyline start,
 * so without a sim ticking the 8 markers visually collapse to 4 overlapping
 * pairs. This pass groups vehicles by route_id and, when a group of N
 * vehicles is colocated within COLOCATED_RADIUS_M, redistributes them along
 * the route polyline at fractions 0/N, 1/N, 2/N, ... so the empty-state map
 * shows 8 distinct kombis. Vehicles whose positions have already drifted
 * (i.e. a sim ran recently) are left alone.
 */
function spreadColocatedAlongRoutes(
  kombis: KombiTickPayload[],
  network: NetworkPayload,
): KombiTickPayload[] {
  if (kombis.length === 0) return kombis;
  const groups = new Map<string, KombiTickPayload[]>();
  for (const k of kombis) {
    const arr = groups.get(k.route_id);
    if (arr) arr.push(k);
    else groups.set(k.route_id, [k]);
  }

  const out = new Map<string, KombiTickPayload>();
  for (const k of kombis) out.set(k.vehicle_id, k);

  for (const [routeId, group] of groups.entries()) {
    if (group.length < 2) continue;
    // Colocated check — every vehicle within COLOCATED_RADIUS_M of the first.
    const head = group[0];
    const allColocated = group.every(
      (v) => haversineMeters(head.lat, head.lng, v.lat, v.lng) <= COLOCATED_RADIUS_M,
    );
    if (!allColocated) continue;

    const route = network.routes.find((r) => r.id === routeId);
    if (!route) continue;
    const coords = route.geometry.coordinates;
    if (coords.length < 2) continue;

    try {
      const line = lineString(coords);
      const lengthKm = length(line, { units: "kilometers" });
      // Stable order so re-renders don't reshuffle vehicles between positions.
      const ordered = [...group].sort((a, b) =>
        a.vehicle_id.localeCompare(b.vehicle_id),
      );
      ordered.forEach((v, i) => {
        // Skip 0/N (route endpoint) when N > 1 — distribute at 1/(N+1) ... N/(N+1)
        const fraction = (i + 1) / (ordered.length + 1);
        const point = along(line, fraction * lengthKm, {
          units: "kilometers",
        });
        const [lng, lat] = point.geometry.coordinates;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          out.set(v.vehicle_id, { ...v, lat, lng });
        }
      });
    } catch {
      // turf can throw on degenerate geometry — leave the group untouched.
    }
  }
  return Array.from(out.values());
}

/* ============================================================================
 * R2 — corridor filter
 *
 * Surface-side override that confines visible kombis to the Heights→Rezende
 * corridor for the rebuilt empty state. Two real plates (ZH 4821, ZH 4822)
 * remain DB-backed and continue to receive sim broadcasts. A third synthetic
 * plate (ZH 4823) is injected at SSR time only — no DB row, no broadcasts,
 * pinned at the UZ Main Gate stop with bearing 0 (inbound visual).
 *
 * The other fleet plates (ZH 4901, ZH 4902, ZH 5001, ZH 5002, ZH 5101,
 * ZH 5102) are dropped here AND must also be filtered at the client-side
 * broadcast handler in PassengerMap.tsx — see R2 step 3.
 * =========================================================================*/

const HEIGHTS_NATIVE_PLATES: ReadonlySet<string> = new Set([
  "ZH 4821",
  "ZH 4822",
]);

const R2_SYNTHETIC_PLATE = "ZH 4823" as const;
const R2_UZ_GATE: Readonly<{ lat: number; lng: number }> = {
  lat: -17.78465,
  lng: 31.05154,
};

function applyR2CorridorFilter(
  kombis: ReadonlyArray<KombiTickPayload>,
): KombiTickPayload[] {
  const corridor = kombis.filter((k) => HEIGHTS_NATIVE_PLATES.has(k.vehicle_id));
  corridor.push({
    vehicle_id: R2_SYNTHETIC_PLATE,
    route_id: "route_heights_rezende",
    lat: R2_UZ_GATE.lat,
    lng: R2_UZ_GATE.lng,
    direction: "inbound",
    bearing: 0,
    progressMeters: 0,
    at: new Date().toISOString(),
  });
  return corridor;
}

/* ============================================================================
 * V1 — bbox filter
 *
 * When the landing page forwards a chosen location (geolocation success or
 * suburb pick), the passenger surface filters its initial kombi feed to a
 * 5 km square bounding box around that point so the rider only sees kombis
 * relevant to where they are. Approximation: 1 deg lat ≈ 111 km, 1 deg lng
 * at Harare's ~-17.8° latitude ≈ 106 km. Same arithmetic as the client-side
 * filter in PassengerMap.tsx so the seed and the live broadcast stay in
 * sync about which vehicles are "near".
 * =========================================================================*/

const V1_BBOX_RADIUS_KM = 5;

function applyV1BboxFilter(
  kombis: ReadonlyArray<KombiTickPayload>,
  centerLat: number,
  centerLng: number,
): KombiTickPayload[] {
  return kombis.filter((k) => {
    const dLat = Math.abs(k.lat - centerLat) * 111;
    const dLng = Math.abs(k.lng - centerLng) * 106;
    return dLat <= V1_BBOX_RADIUS_KM && dLng <= V1_BBOX_RADIUS_KM;
  });
}

/**
 * Server-side composition for the passenger surface. Shared between the
 * landing dispatcher and any future deep-linked entry points so the data
 * graph stays in one place.
 */
export async function loadPassengerSurface(args: {
  asParam?: string;
  claimParam?: string;
  /**
   * V1 — when the landing page forwards a chosen location (geolocation
   * success or suburb pick), the seed kombis are filtered to a 5 km bbox
   * around it. Falling back to the R2 corridor filter when absent keeps
   * direct deep links like `/?as=takunda` working without a location.
   */
  location?: { lat: number; lng: number } | null;
}): Promise<PassengerSurfaceData> {
  const personaSlug = (args.asParam ?? "takunda").toLowerCase();
  const persona = await resolvePersona(personaSlug, "passenger");
  const [network, tickets, journey, liveStats, rawKombis] =
    await Promise.all([
      loadNetwork(),
      loadWallet(persona.id),
      loadActiveJourney(persona.id),
      loadLiveStats(),
      loadInitialKombis(),
    ]);
  const spread = spreadColocatedAlongRoutes(rawKombis, network);
  const initialKombis = args.location
    ? applyV1BboxFilter(spread, args.location.lat, args.location.lng)
    : applyR2CorridorFilter(spread);
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
