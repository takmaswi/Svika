"use server";

/**
 * Phase Z — passenger-driven journey simulator (animated).
 *
 * Advances an active journey one stage at a time. Computes a polyline path
 * between the vehicle's current position and the next target stop, updates
 * the database to the FINAL state immediately, and returns the path so the
 * client RAF-animates the kombi marker over ~6 seconds. Lets the user walk
 * through every stage on a real phone without depending on the simRunner
 * broadcasting in the background.
 *
 * Position changes are NOT broadcast over Realtime — the client owns the
 * visual via RAF, and the Journey component refreshes from the server once
 * the animation completes. Ticket-redeemed events ARE still broadcast so the
 * boarding flash + fare-cleared toast fire in real time.
 *
 * Gated behind NEXT_PUBLIC_DEMO_MODE !== 'false' (default-on for the sprint).
 */

import { revalidatePath } from "next/cache";

import along from "@turf/along";
import length from "@turf/length";
import { lineString, point } from "@turf/helpers";
import lineSlice from "@turf/line-slice";

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { resolvePersona } from "@/lib/personas";
import { createServerClient } from "@/lib/supabase/server";
import { loadActiveJourney } from "@/lib/passenger/journey";
import {
  deriveJourneyStage,
  type VehicleSnapshot,
} from "@/lib/passenger/journey-stage";
import { pointWkt } from "@/lib/sim/geometry";
import {
  SIM_CHANNEL,
  TICKET_REDEEMED_EVENT,
  type TicketRedeemedPayload,
} from "@/lib/sim/simRunner";
import type { JourneyKombiLeg } from "@/lib/passenger/journey-types";

const seed = network as unknown as SeedNetwork;

interface VehicleRowMinimal {
  id: string;
  route_id: string;
  current_position: string | null;
  capacity_seats: number;
  current_passenger_count: number;
  direction: "outbound" | "inbound" | null;
}

/** Number of waypoints in the returned path (~30–50 keeps the curve smooth). */
const PATH_WAYPOINTS = 36;
const SIMULATE_DURATION_MS = 6000;

export interface SimulatedPathStep {
  ok: true;
  stage_before: string;
  message: string;
  /** Vehicle the client should animate. */
  vehicle_id: string;
  route_id: string;
  /** Polyline waypoints in [lng, lat] order, ready to feed into Mapbox sources. */
  path: Array<[number, number]>;
  /** Final position of the vehicle once the animation completes. */
  final_lat: number;
  final_lng: number;
  /** How long the client should run the RAF interpolation, in milliseconds. */
  duration_ms: number;
  /** True when this step also redeemed the ticket (boarding events). */
  ticket_redeemed: boolean;
  advances_to:
    | "boarding"
    | "in-transit"
    | "walking-transfer"
    | "boarding-leg-2"
    | "arrived";
}

export interface ActionError {
  ok: false;
  error: string;
}

/**
 * Parse PostGIS geography Point — accepts both WKT (SRID=4326;POINT(lng lat))
 * and PostgREST's hex EWKB (the default surface format for geography columns).
 * Returns null for anything else; callers fall back to picking the first
 * vehicle on the route.
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

/**
 * Resamples the seed route polyline between `from` and `to` into
 * `PATH_WAYPOINTS` evenly-spaced waypoints. Falls back to a straight-line
 * interpolation when the route is unknown or turf can't slice it cleanly
 * (e.g., when the vehicle has drifted far off the polyline).
 */
function buildPath(
  routeId: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Array<[number, number]> {
  const route = seed.routes.find((r) => r.id === routeId);
  const fallback = (): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= PATH_WAYPOINTS; i += 1) {
      const t = i / PATH_WAYPOINTS;
      out.push([fromLng + (toLng - fromLng) * t, fromLat + (toLat - fromLat) * t]);
    }
    return out;
  };
  if (!route || !Array.isArray(route.polyline) || route.polyline.length < 2) {
    return fallback();
  }
  // Seed file stores polylines as [lat, lng]; turf wants [lng, lat].
  const geoCoords = route.polyline.map(
    ([lat, lng]) => [lng, lat] as [number, number],
  );
  try {
    const line = lineString(geoCoords);
    const fromPt = point([fromLng, fromLat]);
    const toPt = point([toLng, toLat]);
    const slice = lineSlice(fromPt, toPt, line);
    const sliceCoords = slice.geometry.coordinates as Array<[number, number]>;
    if (sliceCoords.length < 2) return fallback();
    const sliceLine = lineString(sliceCoords);
    const totalKm = length(sliceLine, { units: "kilometers" });
    if (!Number.isFinite(totalKm) || totalKm < 0.0005) {
      // Slice is degenerate (probably from + to are nearly the same point).
      return [
        [fromLng, fromLat],
        [toLng, toLat],
      ];
    }
    const out: Array<[number, number]> = [];
    // Anchor first point at the actual vehicle position so the marker doesn't
    // jump to the polyline before easing forward.
    out.push([fromLng, fromLat]);
    for (let i = 1; i < PATH_WAYPOINTS; i += 1) {
      const f = i / PATH_WAYPOINTS;
      const pt = along(sliceLine, f * totalKm, { units: "kilometers" });
      const [lng, lat] = pt.geometry.coordinates as [number, number];
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lng, lat]);
    }
    // Anchor final point at the target stop so the marker lands exactly there.
    out.push([toLng, toLat]);
    return out;
  } catch {
    return fallback();
  }
}

export async function simulateNextStepAction(input: {
  persona_slug: string;
  trip_id: string;
}): Promise<SimulatedPathStep | ActionError> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    return { ok: false, error: "Demo mode disabled." };
  }

  try {
    const persona = await resolvePersona(input.persona_slug, "passenger");
    const journey = await loadActiveJourney(persona.id);
    if (!journey || journey.trip_id !== input.trip_id) {
      return { ok: false, error: "No active trip for this persona." };
    }
    if (journey.kind === "parcel") {
      return { ok: false, error: "Cannot simulate a parcel journey." };
    }

    const client = await createServerClient();

    const { data: vehiclesData } = await client
      .from("vehicles")
      .select(
        "id, route_id, current_position, capacity_seats, current_passenger_count, direction",
      );
    const vehiclesRaw = (vehiclesData ?? []) as VehicleRowMinimal[];

    const vehicleSnaps: VehicleSnapshot[] = [];
    const vehiclesById = new Map<string, VehicleSnapshot>();
    for (const v of vehiclesRaw) {
      const p = parsePoint(v.current_position);
      if (!p) continue;
      const snap: VehicleSnapshot = {
        vehicle_id: v.id,
        route_id: v.route_id,
        lat: p.lat,
        lng: p.lng,
      };
      vehicleSnaps.push(snap);
      vehiclesById.set(v.id, snap);
    }

    const stage = deriveJourneyStage({
      journey,
      vehiclesById,
      vehicles: vehicleSnaps,
      nowMs: Date.now(),
    });

    const redeems: TicketRedeemedPayload[] = [];

    function legByIndex(idx: number): JourneyKombiLeg | null {
      if (idx < 0 || idx >= journey!.legs.length) return null;
      const l = journey!.legs[idx];
      return l.kind === "kombi" ? l : null;
    }

    function pickVehicleForRoute(routeId: string): VehicleRowMinimal | null {
      for (const v of vehiclesRaw) {
        if (v.route_id === routeId) return v;
      }
      return null;
    }

    function vehicleStartPos(
      vehicleId: string,
      fallbackLat: number,
      fallbackLng: number,
    ): { lat: number; lng: number } {
      const snap = vehiclesById.get(vehicleId);
      if (snap) return { lat: snap.lat, lng: snap.lng };
      return { lat: fallbackLat, lng: fallbackLng };
    }

    async function ensureVehicleForLeg(leg: JourneyKombiLeg): Promise<string> {
      if (leg.vehicle_id) return leg.vehicle_id;
      const v = pickVehicleForRoute(leg.route_id);
      if (!v) throw new Error(`No vehicles on route ${leg.route_id}.`);
      return v.id;
    }

    async function moveVehicle(
      vehicleId: string,
      finalLat: number,
      finalLng: number,
    ): Promise<void> {
      const at = new Date().toISOString();
      await client
        .from("vehicles")
        .update({
          current_position: pointWkt([finalLat, finalLng]),
          last_position_at: at,
        })
        .eq("id", vehicleId);
    }

    async function redeemLeg(
      leg: JourneyKombiLeg,
      vehicleId: string,
    ): Promise<void> {
      const now = new Date().toISOString();
      const v = vehiclesRaw.find((x) => x.id === vehicleId);
      const newCount = Math.min(
        v?.capacity_seats ?? 15,
        (v?.current_passenger_count ?? 0) + 1,
      );
      await client
        .from("tickets")
        .update({
          status: "redeemed",
          vehicle_id: vehicleId,
          redeemed_at: now,
        })
        .eq("id", leg.ticket_id);
      await client
        .from("vehicles")
        .update({ current_passenger_count: newCount })
        .eq("id", vehicleId);
      redeems.push({
        ticket_id: leg.ticket_id,
        vehicle_id: vehicleId,
        route_id: leg.route_id,
        current_holder_user_id: persona.id,
        redeemed_at: now,
      });
    }

    let result: SimulatedPathStep;
    switch (stage.kind) {
      case "walk-to-board": {
        const idx = stage.active_kombi_leg_index ?? 0;
        const leg = legByIndex(idx);
        if (!leg) return { ok: false, error: "Active leg missing." };
        const vehicleId = await ensureVehicleForLeg(leg);
        const start = vehicleStartPos(
          vehicleId,
          leg.board_stop.lat,
          leg.board_stop.lng,
        );
        const path = buildPath(
          leg.route_id,
          start.lat,
          start.lng,
          leg.board_stop.lat,
          leg.board_stop.lng,
        );
        await moveVehicle(vehicleId, leg.board_stop.lat, leg.board_stop.lng);
        await redeemLeg(leg, vehicleId);
        result = {
          ok: true,
          stage_before: stage.kind,
          message: "Boarding cleared.",
          vehicle_id: vehicleId,
          route_id: leg.route_id,
          path,
          final_lat: leg.board_stop.lat,
          final_lng: leg.board_stop.lng,
          duration_ms: SIMULATE_DURATION_MS,
          ticket_redeemed: true,
          advances_to: "boarding",
        };
        break;
      }
      case "boarding":
      case "in-transit": {
        const idx = stage.active_kombi_leg_index ?? 0;
        const leg = legByIndex(idx);
        if (!leg) return { ok: false, error: "Active leg missing." };
        const vehicleId = leg.vehicle_id ?? stage.assigned_vehicle_id;
        if (!vehicleId) return { ok: false, error: "No assigned vehicle." };
        const start = vehicleStartPos(
          vehicleId,
          leg.board_stop.lat,
          leg.board_stop.lng,
        );
        const path = buildPath(
          leg.route_id,
          start.lat,
          start.lng,
          leg.alight_stop.lat,
          leg.alight_stop.lng,
        );
        await moveVehicle(vehicleId, leg.alight_stop.lat, leg.alight_stop.lng);
        const isLastLeg =
          journey.legs.filter((l) => l.kind === "kombi").length === idx + 1 ||
          !journey.legs
            .slice(idx + 1)
            .some((l) => l.kind === "kombi");
        result = {
          ok: true,
          stage_before: stage.kind,
          message: "Arrived at drop-off.",
          vehicle_id: vehicleId,
          route_id: leg.route_id,
          path,
          final_lat: leg.alight_stop.lat,
          final_lng: leg.alight_stop.lng,
          duration_ms: SIMULATE_DURATION_MS,
          ticket_redeemed: false,
          advances_to: isLastLeg ? "arrived" : "walking-transfer",
        };
        break;
      }
      case "walking-transfer": {
        const nextIdx = stage.active_kombi_leg_index;
        if (nextIdx === null) {
          return { ok: false, error: "No next leg index." };
        }
        const nextLeg = legByIndex(nextIdx);
        if (!nextLeg) return { ok: false, error: "Next leg missing." };
        const vehicleId = await ensureVehicleForLeg(nextLeg);
        const start = vehicleStartPos(
          vehicleId,
          nextLeg.board_stop.lat,
          nextLeg.board_stop.lng,
        );
        const path = buildPath(
          nextLeg.route_id,
          start.lat,
          start.lng,
          nextLeg.board_stop.lat,
          nextLeg.board_stop.lng,
        );
        await moveVehicle(
          vehicleId,
          nextLeg.board_stop.lat,
          nextLeg.board_stop.lng,
        );
        await redeemLeg(nextLeg, vehicleId);
        result = {
          ok: true,
          stage_before: stage.kind,
          message: "Boarded the next kombi.",
          vehicle_id: vehicleId,
          route_id: nextLeg.route_id,
          path,
          final_lat: nextLeg.board_stop.lat,
          final_lng: nextLeg.board_stop.lng,
          duration_ms: SIMULATE_DURATION_MS,
          ticket_redeemed: true,
          advances_to: "boarding-leg-2",
        };
        break;
      }
      case "boarding-leg-2": {
        const idx = stage.active_kombi_leg_index;
        if (idx === null) return { ok: false, error: "No leg index." };
        const leg = legByIndex(idx);
        if (!leg) return { ok: false, error: "Leg missing." };
        const vehicleId = leg.vehicle_id ?? stage.assigned_vehicle_id;
        if (!vehicleId) {
          return { ok: false, error: "Leg-2 vehicle missing." };
        }
        const start = vehicleStartPos(
          vehicleId,
          leg.board_stop.lat,
          leg.board_stop.lng,
        );
        const path = buildPath(
          leg.route_id,
          start.lat,
          start.lng,
          leg.alight_stop.lat,
          leg.alight_stop.lng,
        );
        await moveVehicle(vehicleId, leg.alight_stop.lat, leg.alight_stop.lng);
        result = {
          ok: true,
          stage_before: stage.kind,
          message: "Arrived at final drop-off.",
          vehicle_id: vehicleId,
          route_id: leg.route_id,
          path,
          final_lat: leg.alight_stop.lat,
          final_lng: leg.alight_stop.lng,
          duration_ms: SIMULATE_DURATION_MS,
          ticket_redeemed: false,
          advances_to: "arrived",
        };
        break;
      }
      case "arrived":
        return { ok: false, error: "Already arrived." };
      default:
        return { ok: false, error: `Unhandled stage ${stage.kind}.` };
    }

    void broadcastRedeems(client, redeems);

    revalidatePath("/");
    return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Simulate failed.",
    };
  }
}

async function broadcastRedeems(
  client: Awaited<ReturnType<typeof createServerClient>>,
  redeems: TicketRedeemedPayload[],
): Promise<void> {
  if (redeems.length === 0) return;
  try {
    const channel = client.channel(SIM_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 800);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    for (const r of redeems) {
      await channel.send({
        type: "broadcast",
        event: TICKET_REDEEMED_EVENT,
        payload: r,
      });
    }
    await client.removeChannel(channel);
  } catch {
    // best-effort; revalidate will reconcile on next render.
  }
}
