/**
 * Idempotent seed loader for the Svika kombi network.
 *
 * Reads seed/network.json (verified by the user against Google Maps + Waze)
 * and inserts:
 *   - stop_points       (deduped across routes)
 *   - routes            (with polylines densified via Mapbox Directions —
 *                        silent fallback to the raw polyline on any error)
 *   - route_stops       (sequence == position in seed file)
 *   - fare_segments     (per-route wipe + insert; effective_from defaults)
 *   - transfer_points
 *   - vehicles          (two per route, Baba Tino owner, Farai on ZH 4821)
 *   - kombi_pings       (one initial ping per vehicle at the polyline start,
 *                        only if the vehicle has no pings yet)
 *
 * Demo users (Takunda, Rudo, Farai, Baba Tino) are seeded by SQL migration
 * 0003 — they exist before this script runs. We just resolve their IDs.
 *
 * Run with: pnpm db:seed
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { densifyPolyline, type LatLng } from "@/lib/mapbox/densify";
import { lineStringWkt, pointWkt } from "@/lib/sim/geometry";
import type { Database } from "@/lib/supabase/types";

import network from "./network.json" with { type: "json" };
import type { SeedNetwork, SeedRoute } from "./schema";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
}

const supabase: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const seed = network as unknown as SeedNetwork;

// One Farai-driven kombi per docs/CLAUDE.md, then a quiet sister vehicle per
// route so the simulation can show two kombis sliding along each route. Plates
// outside ZH 4821 are demo placeholders and can be renamed without breaking
// anything — they are only referenced through vehicles.id.
const VEHICLE_PLAN: Array<{ route_id: string; plates: [string, string] }> = [
  { route_id: "route_heights_rezende", plates: ["ZH 4821", "ZH 4822"] },
  { route_id: "route_marketsq_avondale", plates: ["ZH 4901", "ZH 4902"] },
  { route_id: "route_fourthst_borrowdale", plates: ["ZH 5001", "ZH 5002"] },
  { route_id: "route_westgate_copa_segment", plates: ["ZH 5101", "ZH 5102"] },
];

const FARAI_VEHICLE = "ZH 4821";

async function resolveDemoUserIds(): Promise<{ farai: string; baba_tino: string }> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .in("name", ["Farai", "Baba Tino"]);
  if (error) throw error;
  const farai = data?.find((u) => u.name === "Farai")?.id;
  const baba_tino = data?.find((u) => u.name === "Baba Tino")?.id;
  if (!farai || !baba_tino) {
    throw new Error(
      "Demo users (Farai, Baba Tino) missing — run `supabase db push` to apply migration 0003.",
    );
  }
  return { farai, baba_tino };
}

async function loadStopPoints(): Promise<number> {
  const seen = new Map<string, (typeof seed.routes)[number]["stop_points"][number]>();
  for (const route of seed.routes) {
    for (const stop of route.stop_points) {
      if (!seen.has(stop.id)) seen.set(stop.id, stop);
    }
  }
  const rows = Array.from(seen.values()).map((s) => ({
    id: s.id,
    name: s.name,
    location: pointWkt([s.lat, s.lng]),
    is_terminal: s.is_terminal,
    is_rank: s.is_rank,
  }));
  const { error } = await supabase.from("stop_points").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return rows.length;
}

interface DensifiedRoute {
  route: SeedRoute;
  polyline: LatLng[];
  source: "mapbox" | "raw";
}

async function densifyAllRoutes(): Promise<DensifiedRoute[]> {
  const out = await Promise.all(
    seed.routes.map(async (route) => {
      const raw = route.polyline.map(([lat, lng]) => [lat, lng] as LatLng);
      const densified = await densifyPolyline(raw);
      return { route, polyline: densified.coordinates, source: densified.source };
    }),
  );
  for (const { route, polyline, source } of out) {
    console.log(
      `[seed] densify ${route.id}: ${route.polyline.length} → ${polyline.length} points (${source})`,
    );
  }
  return out;
}

async function loadRoutes(densified: DensifiedRoute[]): Promise<void> {
  const rows = densified.map(({ route, polyline }) => ({
    id: route.id,
    name: route.name,
    direction_summary: route.direction_summary,
    polyline: lineStringWkt(polyline),
    default_fare_usd: route.default_fare_usd,
    typical_duration_minutes: route.typical_duration_minutes,
    endpoint_start_stop_id: route.stop_points[0].id,
    endpoint_end_stop_id: route.stop_points[route.stop_points.length - 1].id,
    notes: route.notes ?? null,
  }));
  const { error } = await supabase.from("routes").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function loadRouteStops(): Promise<number> {
  const rows = seed.routes.flatMap((route) =>
    route.stop_points.map((stop, idx) => ({
      route_id: route.id,
      stop_id: stop.id,
      sequence: idx,
    })),
  );
  const { error } = await supabase
    .from("route_stops")
    .upsert(rows, { onConflict: "route_id,stop_id" });
  if (error) throw error;
  return rows.length;
}

async function loadFareSegments(): Promise<number> {
  // effective_from defaults to now() and is part of the unique key, so a plain
  // upsert would create a new row each run. Wipe-and-reinsert per route keeps
  // the loader idempotent and matches the per-segment fare model in the docs
  // (price changes are append-only in production; the demo just rewrites).
  const routeIds = seed.routes.map((r) => r.id);
  const { error: delErr } = await supabase
    .from("fare_segments")
    .delete()
    .in("route_id", routeIds);
  if (delErr) throw delErr;

  const rows = seed.routes.flatMap((route) =>
    route.fare_segments.map((seg) => ({
      route_id: route.id,
      from_stop_id: seg.from_stop_id,
      to_stop_id: seg.to_stop_id,
      fare_usd: seg.fare_usd,
    })),
  );
  const { error } = await supabase.from("fare_segments").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function loadTransferPoints(): Promise<number> {
  const rows = seed.transfer_points.map((t) => ({
    id: t.id,
    type: t.type,
    from_stop_id: t.from_stop_id,
    to_stop_id: t.to_stop_id,
    walking_distance_meters: t.walking_distance_meters,
    walking_duration_minutes: t.walking_duration_minutes,
    walking_polyline: lineStringWkt(t.walking_polyline.map(([lat, lng]) => [lat, lng] as LatLng)),
    notes: t.notes ?? null,
  }));
  const { error } = await supabase.from("transfer_points").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return rows.length;
}

async function loadVehicles(
  densified: DensifiedRoute[],
  ownerId: string,
  conductorId: string,
): Promise<number> {
  const polylineByRoute = new Map(densified.map((d) => [d.route.id, d.polyline] as const));
  const rows = VEHICLE_PLAN.flatMap(({ route_id, plates }) => {
    const polyline = polylineByRoute.get(route_id);
    if (!polyline || polyline.length === 0) {
      throw new Error(`No densified polyline for route ${route_id}`);
    }
    const start = polyline[0];
    return plates.map((plate, idx) => ({
      id: plate,
      route_id,
      fleet_owner_id: ownerId,
      current_conductor_id: plate === FARAI_VEHICLE ? conductorId : null,
      capacity_seats: 15,
      current_position: pointWkt(start),
      current_passenger_count: 0,
      direction: (idx === 0 ? "outbound" : "inbound") as "outbound" | "inbound",
      last_position_at: new Date().toISOString(),
    }));
  });
  const { error } = await supabase.from("vehicles").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return rows.length;
}

async function seedInitialPings(densified: DensifiedRoute[]): Promise<number> {
  const polylineByRoute = new Map(densified.map((d) => [d.route.id, d.polyline] as const));
  let inserted = 0;
  for (const { route_id, plates } of VEHICLE_PLAN) {
    const polyline = polylineByRoute.get(route_id);
    if (!polyline) continue;
    const start = polyline[0];
    const startStopId = densified.find((d) => d.route.id === route_id)!.route.stop_points[0].id;
    for (const plate of plates) {
      const { count } = await supabase
        .from("kombi_pings")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", plate);
      if ((count ?? 0) > 0) continue;
      const { error } = await supabase.from("kombi_pings").insert({
        vehicle_id: plate,
        position: pointWkt(start),
        nearest_stop_id: startStopId,
        is_at_stop: true,
      });
      if (error) throw error;
      inserted += 1;
    }
  }
  return inserted;
}

async function main() {
  console.log("[seed] starting...");
  const users = await resolveDemoUserIds();

  const stopsCount = await loadStopPoints();
  console.log(`[seed] stop_points: ${stopsCount} upserted`);

  const densified = await densifyAllRoutes();
  await loadRoutes(densified);
  console.log(`[seed] routes: ${densified.length} upserted`);

  const routeStopsCount = await loadRouteStops();
  console.log(`[seed] route_stops: ${routeStopsCount} upserted`);

  const fareCount = await loadFareSegments();
  console.log(`[seed] fare_segments: ${fareCount} inserted (route-scoped wipe)`);

  const transferCount = await loadTransferPoints();
  console.log(`[seed] transfer_points: ${transferCount} upserted`);

  const vehicleCount = await loadVehicles(densified, users.baba_tino, users.farai);
  console.log(`[seed] vehicles: ${vehicleCount} upserted`);

  const pingCount = await seedInitialPings(densified);
  console.log(`[seed] kombi_pings: ${pingCount} initial pings inserted (skipped if existed)`);

  console.log("[seed] done.");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
