/**
 * Server-side helper that loads the kombi network for the passenger map.
 *
 * Reads three RPCs (added by migration 0004): `routes_geojson()`,
 * `stop_points_geojson()`, and `route_stops_ordered()`. Falls back to the raw
 * seed file if the database is unreachable so the placeholder map still
 * renders during local dev with no DB.
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";

export interface RouteForMap {
  id: string;
  name: string;
  direction_summary: string | null;
  default_fare_usd: number;
  typical_duration_minutes: number;
  endpoint_start_stop_id: string | null;
  endpoint_end_stop_id: string | null;
  /** GeoJSON LineString geometry as plain object. */
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
}

export interface StopForMap {
  id: string;
  name: string;
  lng: number;
  lat: number;
  is_terminal: boolean;
  is_rank: boolean;
}

export interface RouteStopForMap {
  route_id: string;
  stop_id: string;
  sequence: number;
  stop_name: string;
  lng: number;
  lat: number;
  is_terminal: boolean;
  is_rank: boolean;
}

export interface NetworkPayload {
  routes: RouteForMap[];
  stops: StopForMap[];
  routeStops: RouteStopForMap[];
  source: "database" | "seed";
}

const seed = network as unknown as SeedNetwork;

function fromSeed(): NetworkPayload {
  const routes: RouteForMap[] = seed.routes.map((r) => ({
    id: r.id,
    name: r.name,
    direction_summary: r.direction_summary,
    default_fare_usd: r.default_fare_usd,
    typical_duration_minutes: r.typical_duration_minutes,
    endpoint_start_stop_id: r.stop_points[0]?.id ?? null,
    endpoint_end_stop_id: r.stop_points[r.stop_points.length - 1]?.id ?? null,
    geometry: {
      type: "LineString",
      // GeoJSON wants [lng, lat]. Seed file is [lat, lng].
      coordinates: r.polyline.map(([lat, lng]) => [lng, lat] as [number, number]),
    },
  }));

  const stopMap = new Map<string, StopForMap>();
  for (const r of seed.routes) {
    for (const s of r.stop_points) {
      if (!stopMap.has(s.id)) {
        stopMap.set(s.id, {
          id: s.id,
          name: s.name,
          lng: s.lng,
          lat: s.lat,
          is_terminal: s.is_terminal,
          is_rank: s.is_rank,
        });
      }
    }
  }
  const stops = Array.from(stopMap.values());

  const routeStops: RouteStopForMap[] = seed.routes.flatMap((r) =>
    r.stop_points.map((s, idx) => ({
      route_id: r.id,
      stop_id: s.id,
      sequence: idx,
      stop_name: s.name,
      lng: s.lng,
      lat: s.lat,
      is_terminal: s.is_terminal,
      is_rank: s.is_rank,
    })),
  );

  return { routes, stops, routeStops, source: "seed" };
}

export async function loadNetwork(): Promise<NetworkPayload> {
  try {
    const client = await createServerClient();
    const [routesRes, stopsRes, routeStopsRes] = await Promise.all([
      client.rpc("routes_geojson"),
      client.rpc("stop_points_geojson"),
      client.rpc("route_stops_ordered"),
    ]);

    if (routesRes.error || stopsRes.error || routeStopsRes.error) {
      return fromSeed();
    }

    type DbRoute = {
      id: string;
      name: string;
      direction_summary: string | null;
      default_fare_usd: number;
      typical_duration_minutes: number;
      endpoint_start_stop_id: string | null;
      endpoint_end_stop_id: string | null;
      geojson: { type: string; coordinates: Array<[number, number]> } | null;
    };
    type DbStop = {
      id: string;
      name: string;
      lng: number;
      lat: number;
      is_terminal: boolean;
      is_rank: boolean;
    };
    type DbRouteStop = DbStop & { route_id: string; stop_id: string; sequence: number; stop_name: string };

    const dbRoutes = (routesRes.data ?? []) as DbRoute[];
    if (dbRoutes.length === 0) return fromSeed();

    const routes: RouteForMap[] = dbRoutes
      .filter((r) => r.geojson && r.geojson.type === "LineString")
      .map((r) => ({
        id: r.id,
        name: r.name,
        direction_summary: r.direction_summary,
        default_fare_usd: Number(r.default_fare_usd),
        typical_duration_minutes: r.typical_duration_minutes,
        endpoint_start_stop_id: r.endpoint_start_stop_id,
        endpoint_end_stop_id: r.endpoint_end_stop_id,
        geometry: {
          type: "LineString",
          coordinates: r.geojson!.coordinates,
        },
      }));

    const stops: StopForMap[] = ((stopsRes.data ?? []) as DbStop[]).map((s) => ({
      id: s.id,
      name: s.name,
      lng: Number(s.lng),
      lat: Number(s.lat),
      is_terminal: s.is_terminal,
      is_rank: s.is_rank,
    }));

    const routeStops: RouteStopForMap[] = ((routeStopsRes.data ?? []) as DbRouteStop[]).map(
      (rs) => ({
        route_id: rs.route_id,
        stop_id: rs.stop_id,
        sequence: rs.sequence,
        stop_name: rs.stop_name,
        lng: Number(rs.lng),
        lat: Number(rs.lat),
        is_terminal: rs.is_terminal,
        is_rank: rs.is_rank,
      }),
    );

    return { routes, stops, routeStops, source: "database" };
  } catch {
    return fromSeed();
  }
}
