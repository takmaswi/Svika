/**
 * Kombi simulation runner.
 *
 * Each tick advances every vehicle along its route polyline, writes the new
 * position to `vehicles` + `kombi_pings`, and broadcasts a batch on a Supabase
 * Realtime channel so every passenger map updates without polling the database.
 *
 * Run via `pnpm sim:start`. Not a route handler — Vercel Hobby has no
 * long-running processes — the demo recording either runs this on a dev box
 * or kicks it off briefly for the take.
 *
 * Routes/polylines are loaded from `seed/network.json` and densified through
 * Mapbox at startup, mirroring exactly what the seed loader writes to the
 * database. Vehicle membership is read from the database so the sim follows
 * whatever the seed loader produced.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { densifyPolyline, type LatLng } from "@/lib/mapbox/densify";
import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import type { Database } from "@/lib/supabase/types";

import {
  advanceVehicle,
  bearingDegrees,
  lookAheadPoint,
  pointWkt,
  polylineLengthMeters,
  type VehicleSimState,
} from "./geometry";

export const SIM_TICK_MS = 2000;
export const SIM_CHANNEL = "kombi-positions";
export const SIM_EVENT = "tick";
/**
 * Broadcast on the same channel as `SIM_EVENT` whenever a conductor clears a
 * fare. The passenger's Journey sheet listens for this to flash the boarding
 * moment in real time, ahead of the eventual server-side revalidation.
 */
export const TICKET_REDEEMED_EVENT = "ticket-redeemed";

export interface KombiTickPayload {
  vehicle_id: string;
  route_id: string;
  lat: number;
  lng: number;
  direction: "outbound" | "inbound";
  /** Compass bearing (0–359, clockwise from north) — drives icon-rotate. */
  bearing: number;
  /**
   * Distance along the densified route polyline, in meters from start.
   * Drives sub-segment road-following interpolation in PassengerMap RAF —
   * same value the sim uses internally to step the kombi via advance().
   */
  progressMeters: number;
  at: string;
}

export interface TicketRedeemedPayload {
  ticket_id: string;
  vehicle_id: string;
  route_id: string;
  current_holder_user_id: string | null;
  redeemed_at: string;
}

interface RoutePolyline {
  route_id: string;
  polyline: LatLng[];
  totalMeters: number;
  typicalDurationMinutes: number;
}

interface VehicleRuntimeState {
  vehicle_id: string;
  route_id: string;
  state: VehicleSimState;
}

const seed = network as unknown as SeedNetwork;

async function loadRoutePolylines(): Promise<Map<string, RoutePolyline>> {
  const out = new Map<string, RoutePolyline>();
  await Promise.all(
    seed.routes.map(async (route) => {
      const raw = route.polyline.map(([lat, lng]) => [lat, lng] as LatLng);
      const { coordinates, source } = await densifyPolyline(raw);
      if (source === "raw") {
        console.warn(
          `[sim] Route ${route.id} using raw polyline (${coordinates.length} pts). ` +
            `Kombis on this route will move in straight chord lines, not road-following arcs. ` +
            `Re-run pnpm db:seed with a working MAPBOX_SECRET_TOKEN to densify.`,
        );
      }
      out.set(route.id, {
        route_id: route.id,
        polyline: coordinates,
        totalMeters: polylineLengthMeters(coordinates),
        typicalDurationMinutes: route.typical_duration_minutes,
      });
    }),
  );
  return out;
}

async function loadVehicles(
  client: SupabaseClient<Database>,
  routes: Map<string, RoutePolyline>,
): Promise<VehicleRuntimeState[]> {
  const { data, error } = await client.from("vehicles").select("id, route_id, direction");
  if (error) throw error;
  const out: VehicleRuntimeState[] = [];
  // Stagger the two vehicles per route so they don't overlap visually.
  const seenPerRoute = new Map<string, number>();
  for (const row of data ?? []) {
    const route = routes.get(row.route_id);
    if (!route) continue;
    const idx = seenPerRoute.get(row.route_id) ?? 0;
    seenPerRoute.set(row.route_id, idx + 1);
    const startProgress =
      row.direction === "inbound" ? route.totalMeters * 0.65 : route.totalMeters * 0.15;
    out.push({
      vehicle_id: row.id,
      route_id: row.route_id,
      state: {
        progressMeters: startProgress + idx * 200,
        direction: row.direction ?? "outbound",
      },
    });
  }
  return out;
}

export interface SimRunnerOptions {
  client: SupabaseClient<Database>;
  tickMs?: number;
  onTick?: (payloads: KombiTickPayload[]) => void;
}

export interface SimHandle {
  stop: () => Promise<void>;
}

export async function startSim(opts: SimRunnerOptions): Promise<SimHandle> {
  const tickMs = opts.tickMs ?? SIM_TICK_MS;
  const routes = await loadRoutePolylines();
  if (routes.size === 0) throw new Error("sim: no routes in seed/network.json");
  const vehicles = await loadVehicles(opts.client, routes);
  if (vehicles.length === 0) {
    throw new Error("sim: no vehicles in DB — run `pnpm db:seed` first");
  }

  const channel = opts.client.channel(SIM_CHANNEL, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(new Error(`sim: realtime channel failed (${status})`));
      }
    });
  });

  let stopped = false;
  const interval = setInterval(() => {
    void tick();
  }, tickMs);

  async function tick(): Promise<void> {
    if (stopped) return;
    const now = new Date().toISOString();
    const payloads: KombiTickPayload[] = [];
    const pingInserts: Array<{
      vehicle_id: string;
      position: string;
      is_at_stop: boolean;
    }> = [];

    for (const v of vehicles) {
      const route = routes.get(v.route_id);
      if (!route) continue;
      const result = advanceVehicle(
        route.polyline,
        route.totalMeters,
        route.typicalDurationMinutes,
        v.state,
        tickMs,
      );
      v.state = result.state;
      const ahead = lookAheadPoint(
        route.polyline,
        route.totalMeters,
        v.state.progressMeters,
        v.state.direction,
      );
      const bearing = bearingDegrees(result.position, ahead);
      payloads.push({
        vehicle_id: v.vehicle_id,
        route_id: v.route_id,
        lat: result.position[0],
        lng: result.position[1],
        direction: v.state.direction,
        bearing,
        progressMeters: v.state.progressMeters,
        at: now,
      });
      pingInserts.push({
        vehicle_id: v.vehicle_id,
        position: pointWkt(result.position),
        is_at_stop: false,
      });
    }

    // Broadcast first — map updates immediately. DB writes are best-effort:
    // a transient hiccup must not freeze the demo.
    await channel.send({ type: "broadcast", event: SIM_EVENT, payload: { ticks: payloads } });
    if (opts.onTick) opts.onTick(payloads);

    await Promise.all([
      ...payloads.map(async (p) => {
        const { error } = await opts.client
          .from("vehicles")
          .update({
            current_position: pointWkt([p.lat, p.lng]),
            direction: p.direction,
            last_position_at: p.at,
          })
          .eq("id", p.vehicle_id);
        if (error) console.error(`[sim] vehicles update ${p.vehicle_id}:`, error.message);
      }),
      opts.client
        .from("kombi_pings")
        .insert(pingInserts)
        .then(({ error }) => {
          if (error) console.error("[sim] kombi_pings insert failed:", error.message);
        }),
    ]);
  }

  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      await opts.client.removeChannel(channel);
    },
  };
}
