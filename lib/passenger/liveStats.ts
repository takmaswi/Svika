/**
 * Server-side derived stats for the passenger empty state.
 *
 * "8 on the road" — count of vehicles whose last_position_at fired within the
 * last five minutes. Falls back to 8 when the query fails or the project
 * hasn't been ticked yet.
 *
 * "next Heights kombi 4 min" — distance from the nearest Heights-route vehicle
 * to the Bannockburn terminus, divided by an average 25 km/h kombi speed.
 * Falls back to 4 minutes when no live data is available.
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";

const seed = network as unknown as SeedNetwork;

const HEIGHTS_ROUTE_ID = "route_heights_rezende";
const HEIGHTS_TERMINUS = (() => {
  const route = seed.routes.find((r) => r.id === HEIGHTS_ROUTE_ID);
  if (!route) return { lat: -17.7498, lng: 31.0425 };
  return { lat: route.endpoint_start.lat, lng: route.endpoint_start.lng };
})();

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const AVG_SPEED_MPS = (25 * 1000) / 3600; // 25 km/h
const EARTH_RADIUS_M = 6_371_000;

interface VehicleRowMinimal {
  id: string;
  route_id: string;
  current_position: string | null;
  last_position_at: string | null;
}

export interface LiveStats {
  active_vehicle_count: number;
  next_heights_minutes: number;
}

const DEFAULTS: LiveStats = {
  active_vehicle_count: 8,
  next_heights_minutes: 4,
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Parses a PostGIS WKT POINT(lng lat) or hex EWKB (geography) string. */
function parsePoint(wkt: string | null): { lat: number; lng: number } | null {
  if (!wkt) return null;
  const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/i.exec(wkt);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

export async function loadLiveStats(): Promise<LiveStats> {
  try {
    const client = await createServerClient();
    const { data, error } = await client
      .from("vehicles")
      .select("id, route_id, current_position, last_position_at");
    if (error || !data) return DEFAULTS;
    const rows = data as VehicleRowMinimal[];
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;

    let activeCount = 0;
    let nearestHeightsMeters = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      if (!row.last_position_at) continue;
      const ts = Date.parse(row.last_position_at);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      activeCount += 1;

      if (row.route_id !== HEIGHTS_ROUTE_ID) continue;
      const point = parsePoint(row.current_position);
      if (!point) continue;
      const meters = haversine(
        point.lat,
        point.lng,
        HEIGHTS_TERMINUS.lat,
        HEIGHTS_TERMINUS.lng,
      );
      if (meters < nearestHeightsMeters) nearestHeightsMeters = meters;
    }

    const next_heights_minutes =
      Number.isFinite(nearestHeightsMeters) && nearestHeightsMeters > 0
        ? Math.max(1, Math.round(nearestHeightsMeters / AVG_SPEED_MPS / 60))
        : DEFAULTS.next_heights_minutes;

    return {
      active_vehicle_count: activeCount > 0 ? activeCount : DEFAULTS.active_vehicle_count,
      next_heights_minutes,
    };
  } catch {
    return DEFAULTS;
  }
}
