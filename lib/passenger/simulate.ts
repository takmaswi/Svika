"use server";

/**
 * Phase Z — passenger-driven journey simulator.
 *
 * Advances an active journey one stage at a time by teleporting the assigned
 * kombi to the right stop and redeeming the right ticket. Lets the user walk
 * through every stage on a real phone without depending on the simRunner
 * broadcasting in the background. Honest shortcut: positions teleport rather
 * than animate along the polyline; live sim still works in parallel.
 *
 * Gated behind NEXT_PUBLIC_DEMO_MODE !== 'false' (default-on for the sprint).
 */

import { revalidatePath } from "next/cache";

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
  SIM_EVENT,
  TICKET_REDEEMED_EVENT,
  type KombiTickPayload,
  type TicketRedeemedPayload,
} from "@/lib/sim/simRunner";
import type { JourneyKombiLeg } from "@/lib/passenger/journey-types";

interface VehicleRowMinimal {
  id: string;
  route_id: string;
  current_position: string | null;
  capacity_seats: number;
  current_passenger_count: number;
  direction: "outbound" | "inbound" | null;
}

export interface SimulateNextResult {
  ok: true;
  stage_before: string;
  message: string;
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

export async function simulateNextStepAction(input: {
  persona_slug: string;
  trip_id: string;
}): Promise<SimulateNextResult | ActionError> {
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

    const broadcasts: KombiTickPayload[] = [];
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

    async function ensureVehicleForLeg(leg: JourneyKombiLeg): Promise<string> {
      if (leg.vehicle_id) return leg.vehicle_id;
      const v = pickVehicleForRoute(leg.route_id);
      if (!v) throw new Error(`No vehicles on route ${leg.route_id}.`);
      return v.id;
    }

    async function teleport(
      vehicleId: string,
      routeId: string,
      lat: number,
      lng: number,
    ): Promise<void> {
      const at = new Date().toISOString();
      const v = vehiclesRaw.find((x) => x.id === vehicleId);
      const direction = v?.direction ?? "outbound";
      await client
        .from("vehicles")
        .update({
          current_position: pointWkt([lat, lng]),
          last_position_at: at,
        })
        .eq("id", vehicleId);
      broadcasts.push({
        vehicle_id: vehicleId,
        route_id: routeId,
        lat,
        lng,
        direction,
        bearing: 0,
        at,
      });
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

    let message = "";
    switch (stage.kind) {
      case "walk-to-board": {
        const idx = stage.active_kombi_leg_index ?? 0;
        const leg = legByIndex(idx);
        if (!leg) return { ok: false, error: "Active leg missing." };
        const vehicleId = await ensureVehicleForLeg(leg);
        await teleport(
          vehicleId,
          leg.route_id,
          leg.board_stop.lat,
          leg.board_stop.lng,
        );
        await redeemLeg(leg, vehicleId);
        message = "Boarding cleared.";
        break;
      }
      case "boarding":
      case "in-transit": {
        const idx = stage.active_kombi_leg_index ?? 0;
        const leg = legByIndex(idx);
        if (!leg) return { ok: false, error: "Active leg missing." };
        const vehicleId = leg.vehicle_id ?? stage.assigned_vehicle_id;
        if (!vehicleId) {
          return { ok: false, error: "No assigned vehicle." };
        }
        await teleport(
          vehicleId,
          leg.route_id,
          leg.alight_stop.lat,
          leg.alight_stop.lng,
        );
        message = "Arrived at drop-off.";
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
        await teleport(
          vehicleId,
          nextLeg.route_id,
          nextLeg.board_stop.lat,
          nextLeg.board_stop.lng,
        );
        await redeemLeg(nextLeg, vehicleId);
        message = "Boarded the next kombi.";
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
        await teleport(
          vehicleId,
          leg.route_id,
          leg.alight_stop.lat,
          leg.alight_stop.lng,
        );
        message = "Arrived at final drop-off.";
        break;
      }
      case "arrived":
        return { ok: true, stage_before: stage.kind, message: "Already arrived." };
      default:
        return { ok: false, error: `Unhandled stage ${stage.kind}.` };
    }

    void broadcastSimEvents(client, broadcasts, redeems);

    revalidatePath("/");
    return { ok: true, stage_before: stage.kind, message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Simulate failed.",
    };
  }
}

async function broadcastSimEvents(
  client: Awaited<ReturnType<typeof createServerClient>>,
  ticks: KombiTickPayload[],
  redeems: TicketRedeemedPayload[],
): Promise<void> {
  if (ticks.length === 0 && redeems.length === 0) return;
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
    if (ticks.length > 0) {
      await channel.send({
        type: "broadcast",
        event: SIM_EVENT,
        payload: { ticks },
      });
    }
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
