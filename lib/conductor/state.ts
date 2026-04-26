/**
 * Server-side conductor state loader.
 *
 * Resolves the conductor's assigned vehicle (if any), the kombis they are
 * allowed to claim (anything `current_conductor_id` is null or already them),
 * and the day's redeemed-ticket feed for the assigned vehicle so the conductor
 * screen can show "last 5 fares cleared".
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";
import type { TicketRow, VehicleRow } from "@/lib/supabase/types";

const seed = network as unknown as SeedNetwork;

const stopNameById = new Map<string, string>();
const routeById = new Map<string, { name: string; default_fare_usd: number }>();
for (const r of seed.routes) {
  routeById.set(r.id, { name: r.name, default_fare_usd: r.default_fare_usd });
  for (const s of r.stop_points) {
    if (!stopNameById.has(s.id)) stopNameById.set(s.id, s.name);
  }
}

export interface ConductorVehicleOption {
  id: string;
  route_id: string;
  route_name: string;
  current_passenger_count: number;
  capacity_seats: number;
  is_mine: boolean;
  is_taken_by_other: boolean;
  /** GeoJSON LineString coordinates [lng, lat] for the small route map. */
  route_geometry: Array<[number, number]>;
  /** Vehicle's most recent position [lng, lat], if any. */
  position: [number, number] | null;
}

export interface ConductorActivityEntry {
  ticket_id: string;
  access_code: string;
  fare_usd: number;
  status: TicketRow["status"];
  kind: TicketRow["kind"];
  board_at_stop_name: string;
  alight_at_stop_name: string;
  redeemed_at: string | null;
  completed_at: string | null;
}

export interface ConductorState {
  conductor_id: string;
  vehicles: ConductorVehicleOption[];
  /** The vehicle currently assigned to this conductor, if any. */
  active_vehicle_id: string | null;
  /** Today's fare-clear feed for the active vehicle. */
  recent_activity: ConductorActivityEntry[];
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function geometryFor(routeId: string): Array<[number, number]> {
  const route = seed.routes.find((r) => r.id === routeId);
  if (!route) return [];
  // Seed file stores [lat, lng]; GeoJSON / Mapbox want [lng, lat].
  return route.polyline.map(([lat, lng]) => [lng, lat] as [number, number]);
}

function parsePoint(wkt: string | null): [number, number] | null {
  if (!wkt) return null;
  // Geography points come back as a hex EWKB string when read via the JS SDK
  // unless wrapped by an RPC. The seed file primes pings/positions via WKT
  // ("SRID=4326;POINT(lng lat)"), but the value returned over PostgREST has
  // already been re-encoded. We prefer the most recent kombi_pings row, which
  // we read separately, so this fallback is best-effort only.
  const match = wkt.match(/POINT\(([-0-9.]+) ([-0-9.]+)\)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export async function loadConductorState(conductorId: string): Promise<ConductorState> {
  try {
    const client = await createServerClient();

    const { data: vehiclesData, error: vehiclesError } = await client
      .from("vehicles")
      .select("*")
      .order("id", { ascending: true });
    if (vehiclesError || !vehiclesData) {
      return { conductor_id: conductorId, vehicles: [], active_vehicle_id: null, recent_activity: [] };
    }

    const vehicles = vehiclesData as VehicleRow[];
    const activeVehicle = vehicles.find((v) => v.current_conductor_id === conductorId) ?? null;

    // For each vehicle, pull the most recent kombi_ping so the small map can
    // render an honest position dot. Cheap because vehicles is at most 8 rows.
    const positionByVehicle = new Map<string, [number, number] | null>();
    await Promise.all(
      vehicles.map(async (v) => {
        const { data: ping } = await client
          .from("kombi_pings")
          .select("position")
          .eq("vehicle_id", v.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const pos = ping?.position ? parsePoint(ping.position) : parsePoint(v.current_position);
        positionByVehicle.set(v.id, pos);
      }),
    );

    const options: ConductorVehicleOption[] = vehicles.map((v) => ({
      id: v.id,
      route_id: v.route_id,
      route_name: routeById.get(v.route_id)?.name ?? v.route_id,
      current_passenger_count: v.current_passenger_count,
      capacity_seats: v.capacity_seats,
      is_mine: v.current_conductor_id === conductorId,
      is_taken_by_other:
        v.current_conductor_id !== null && v.current_conductor_id !== conductorId,
      route_geometry: geometryFor(v.route_id),
      position: positionByVehicle.get(v.id) ?? null,
    }));

    let recent: ConductorActivityEntry[] = [];
    if (activeVehicle) {
      const sinceIso = startOfTodayIso();
      const { data: ticketsData } = await client
        .from("tickets")
        .select(
          "id, access_code, fare_usd, status, kind, board_at_stop_id, alight_at_stop_id, redeemed_at, completed_at, vehicle_id, created_at",
        )
        .eq("vehicle_id", activeVehicle.id)
        .in("status", ["redeemed", "completed"])
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(8);
      if (ticketsData) {
        recent = (ticketsData as TicketRow[]).map((t) => ({
          ticket_id: t.id,
          access_code: t.access_code,
          fare_usd: Number(t.fare_usd),
          status: t.status,
          kind: t.kind,
          board_at_stop_name: stopNameById.get(t.board_at_stop_id) ?? t.board_at_stop_id,
          alight_at_stop_name: stopNameById.get(t.alight_at_stop_id) ?? t.alight_at_stop_id,
          redeemed_at: t.redeemed_at,
          completed_at: t.completed_at,
        }));
      }
    }

    return {
      conductor_id: conductorId,
      vehicles: options,
      active_vehicle_id: activeVehicle?.id ?? null,
      recent_activity: recent,
    };
  } catch {
    return { conductor_id: conductorId, vehicles: [], active_vehicle_id: null, recent_activity: [] };
  }
}
