/**
 * Idempotent seed loader.
 *
 * Reads seed/network.json (verified by the user against Google Maps + Waze)
 * and inserts:
 *   - routes
 *   - stop_points (deduped across routes)
 *   - route_stops join rows in order
 *   - fare_segments
 *   - transfer_points
 *   - two seeded vehicles per route (assigned to Baba Tino)
 *   - a small batch of historical tickets and pings for the dashboard's first paint
 *
 * Run with: pnpm db:seed
 *
 * Phase 1 task. Skeleton today; full implementation lands as part of Phase 1.
 */

import { createClient } from "@supabase/supabase-js";

import network from "./network.json" with { type: "json" };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface StopInput {
  id: string;
  name: string;
  lat: number;
  lng: number;
  is_terminal: boolean;
  is_rank: boolean;
}

async function loadStopPoints() {
  const seen = new Map<string, StopInput>();
  const routes = (network as unknown as { routes?: Array<{ stop_points?: StopInput[] }> }).routes ?? [];
  for (const route of routes) {
    for (const stop of route.stop_points ?? []) {
      if (!seen.has(stop.id)) seen.set(stop.id, stop);
    }
  }

  const rows = Array.from(seen.values()).map((s) => ({
    id: s.id,
    name: s.name,
    location: `SRID=4326;POINT(${s.lng} ${s.lat})`,
    is_terminal: s.is_terminal,
    is_rank: s.is_rank,
  }));

  const { error } = await supabase.from("stop_points").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  console.log(`[seed] stop_points: ${rows.length} upserted`);
}

async function loadRoutes() {
  // Phase 1: implement route insert with polyline as PostGIS LINESTRING.
  console.log("[seed] routes: TODO Phase 1");
}

async function loadVehicles() {
  // Phase 1: two vehicles per route, owned by Baba Tino, conducted by Farai for ZH 4821.
  console.log("[seed] vehicles: TODO Phase 1");
}

async function main() {
  console.log("[seed] starting...");
  await loadStopPoints();
  await loadRoutes();
  await loadVehicles();
  console.log("[seed] done.");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
