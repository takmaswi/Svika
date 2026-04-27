"use server";

import { revalidatePath } from "next/cache";

import { resolvePersona } from "@/lib/personas";
import { createServerClient } from "@/lib/supabase/server";
import {
  SIM_CHANNEL,
  TICKET_REDEEMED_EVENT,
  type TicketRedeemedPayload,
} from "@/lib/sim/simRunner";
import type { TicketRow, VehicleRow } from "@/lib/supabase/types";
import { PG_UNIQUE_VIOLATION, randomAccessCode } from "@/lib/passenger/access-code";

const ACCESS_CODE_RETRIES = 12;

export interface ActionError {
  ok: false;
  error: string;
}

// ---------------------------------------------------------------------------
// assignVehicleAction — conductor picks which kombi they are working on.
// ---------------------------------------------------------------------------

export interface AssignVehicleResult {
  ok: true;
  vehicle_id: string;
}

export async function assignVehicleAction(input: {
  persona_slug: string;
  vehicle_id: string;
}): Promise<AssignVehicleResult | ActionError> {
  const persona = await resolvePersona(input.persona_slug, "conductor");
  if (persona.role !== "conductor") {
    return { ok: false, error: "Only conductors can claim a kombi." };
  }

  try {
    const client = await createServerClient();

    const { data, error } = await client
      .from("vehicles")
      .select("id")
      .eq("id", input.vehicle_id)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Kombi not found." };

    const { error: updateError } = await client
      .from("vehicles")
      .update({ current_conductor_id: persona.id })
      .eq("id", input.vehicle_id);
    if (updateError) return { ok: false, error: updateError.message };

    revalidatePath("/hwindi");
    return { ok: true, vehicle_id: input.vehicle_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assign failed." };
  }
}

// ---------------------------------------------------------------------------
// redeemTicketAction — conductor types a 3-digit code; ticket flips to redeemed.
// ---------------------------------------------------------------------------

export interface RedeemResult {
  ok: true;
  ticket_id: string;
  access_code: string;
  fare_usd: number;
  passenger_count: number;
  board_at_stop_id: string;
  alight_at_stop_id: string;
  payment_method: "wallet" | "cash";
}

export async function redeemTicketAction(input: {
  persona_slug: string;
  vehicle_id: string;
  access_code: string;
}): Promise<RedeemResult | ActionError> {
  const code = input.access_code.trim();
  if (!/^\d{3}$/.test(code)) {
    return { ok: false, error: "Code must be three digits." };
  }

  const persona = await resolvePersona(input.persona_slug, "conductor");
  if (persona.role !== "conductor") {
    return { ok: false, error: "Only conductors can clear fares." };
  }

  try {
    const client = await createServerClient();

    // Find an active ticket with this code. The partial unique index
    // (tickets_access_code_active_idx) guarantees at most one row per code
    // among issued/transferred_pending/held/redeemed statuses.
    const { data: ticketData, error: ticketError } = await client
      .from("tickets")
      .select("*")
      .eq("access_code", code)
      .in("status", ["issued", "held", "redeemed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ticketError) return { ok: false, error: ticketError.message };
    if (!ticketData) return { ok: false, error: `No active ticket with code ${code}.` };

    const ticket = ticketData as TicketRow;
    if (ticket.status === "redeemed") {
      return { ok: false, error: `Code ${code} already redeemed.` };
    }
    if (ticket.kind === "parcel") {
      return { ok: false, error: "Parcel codes use the Parcel button." };
    }

    // Fetch the assigned vehicle to validate route + bump passenger count.
    const { data: vehicleData, error: vehicleError } = await client
      .from("vehicles")
      .select("*")
      .eq("id", input.vehicle_id)
      .maybeSingle();
    if (vehicleError || !vehicleData) {
      return { ok: false, error: "Kombi not assigned. Pick a kombi first." };
    }
    const vehicle = vehicleData as VehicleRow;

    if (vehicle.route_id !== ticket.route_id) {
      return {
        ok: false,
        error: "Wrong route. This ticket is for a different kombi line.",
      };
    }

    const newPassengerCount = Math.min(
      vehicle.capacity_seats,
      vehicle.current_passenger_count + 1,
    );

    const { error: ticketUpdateError } = await client
      .from("tickets")
      .update({
        status: "redeemed",
        vehicle_id: vehicle.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);
    if (ticketUpdateError) return { ok: false, error: ticketUpdateError.message };

    const { error: vehicleUpdateError } = await client
      .from("vehicles")
      .update({ current_passenger_count: newPassengerCount })
      .eq("id", vehicle.id);
    if (vehicleUpdateError) return { ok: false, error: vehicleUpdateError.message };

    // Best-effort broadcast so the passenger's Journey sheet flashes the
    // boarding moment without waiting for revalidation. Realtime hiccups must
    // never block a fare clearance.
    void broadcastTicketRedeemed(client, {
      ticket_id: ticket.id,
      vehicle_id: vehicle.id,
      route_id: ticket.route_id,
      current_holder_user_id: ticket.current_holder_user_id,
      redeemed_at: new Date().toISOString(),
    });

    revalidatePath("/hwindi");
    revalidatePath("/fleet");
    revalidatePath("/");
    return {
      ok: true,
      ticket_id: ticket.id,
      access_code: ticket.access_code,
      fare_usd: Number(ticket.fare_usd),
      passenger_count: newPassengerCount,
      board_at_stop_id: ticket.board_at_stop_id,
      alight_at_stop_id: ticket.alight_at_stop_id,
      payment_method: ticket.payment_method ?? "wallet",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Redeem failed." };
  }
}

async function broadcastTicketRedeemed(
  client: Awaited<ReturnType<typeof createServerClient>>,
  payload: TicketRedeemedPayload,
): Promise<void> {
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
    await channel.send({
      type: "broadcast",
      event: TICKET_REDEEMED_EVENT,
      payload,
    });
    await client.removeChannel(channel);
  } catch {
    // Realtime hiccup; the next revalidate / page load will reconcile.
  }
}

// ---------------------------------------------------------------------------
// redeemParcelAction — Phase 4 stretch 1.
//
// Conductor types the 3-digit code on a parcel ticket. We flip status straight
// to `redeemed` AND set `completed_at` because parcels do not have an in-vehicle
// arrival lifecycle to wait on — once the conductor accepts, it's on board and
// the audit ledger considers it delivered for demo purposes.
// ---------------------------------------------------------------------------

export interface RedeemParcelResult {
  ok: true;
  ticket_id: string;
  access_code: string;
  fare_usd: number;
  receiver_phone: string;
  description: string;
  alight_at_stop_id: string;
  passenger_count: number;
}

export async function redeemParcelAction(input: {
  persona_slug: string;
  vehicle_id: string;
  access_code: string;
}): Promise<RedeemParcelResult | ActionError> {
  const code = input.access_code.trim();
  if (!/^\d{3}$/.test(code)) {
    return { ok: false, error: "Code must be three digits." };
  }

  const persona = await resolvePersona(input.persona_slug, "conductor");
  if (persona.role !== "conductor") {
    return { ok: false, error: "Only conductors can clear parcels." };
  }

  try {
    const client = await createServerClient();

    const { data: ticketData, error: ticketError } = await client
      .from("tickets")
      .select("*")
      .eq("access_code", code)
      .in("status", ["issued", "held"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ticketError) return { ok: false, error: ticketError.message };
    if (!ticketData) {
      return { ok: false, error: `No active ticket with code ${code}.` };
    }
    const ticket = ticketData as TicketRow;
    if (ticket.kind !== "parcel") {
      return { ok: false, error: "Code is for a passenger ticket — use the keypad." };
    }

    const { data: vehicleData } = await client
      .from("vehicles")
      .select("*")
      .eq("id", input.vehicle_id)
      .maybeSingle();
    if (!vehicleData) {
      return { ok: false, error: "Pick a kombi first." };
    }
    const vehicle = vehicleData as VehicleRow;

    if (vehicle.route_id !== ticket.route_id) {
      return {
        ok: false,
        error: "Wrong route. This parcel is for a different kombi line.",
      };
    }

    const now = new Date().toISOString();
    const { error: ticketUpdateError } = await client
      .from("tickets")
      .update({
        status: "redeemed",
        vehicle_id: vehicle.id,
        redeemed_at: now,
        completed_at: now,
      })
      .eq("id", ticket.id);
    if (ticketUpdateError) return { ok: false, error: ticketUpdateError.message };

    revalidatePath("/hwindi");
    revalidatePath("/fleet");
    revalidatePath("/");

    return {
      ok: true,
      ticket_id: ticket.id,
      access_code: ticket.access_code,
      fare_usd: Number(ticket.fare_usd),
      receiver_phone: ticket.parcel_receiver_phone ?? "",
      description: ticket.parcel_description ?? "",
      alight_at_stop_id: ticket.alight_at_stop_id,
      passenger_count: vehicle.current_passenger_count,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Parcel clear failed." };
  }
}

// ---------------------------------------------------------------------------
// cashWalkonAction — +1 cash $1 button. Mints a cash_walkin ticket and
// immediately marks it completed. No originating user, no transfer history.
// ---------------------------------------------------------------------------

export interface CashWalkonResult {
  ok: true;
  ticket_id: string;
  access_code: string;
  fare_usd: number;
  passenger_count: number;
}

export async function cashWalkonAction(input: {
  persona_slug: string;
  vehicle_id: string;
  fare_usd?: number;
}): Promise<CashWalkonResult | ActionError> {
  const persona = await resolvePersona(input.persona_slug, "conductor");
  if (persona.role !== "conductor") {
    return { ok: false, error: "Only conductors can log cash walk-ons." };
  }

  try {
    const client = await createServerClient();

    const { data: vehicleData, error: vehicleError } = await client
      .from("vehicles")
      .select("*")
      .eq("id", input.vehicle_id)
      .maybeSingle();
    if (vehicleError || !vehicleData) {
      return { ok: false, error: "Kombi not assigned." };
    }
    const vehicle = vehicleData as VehicleRow;

    // Resolve default fare from the route. Cash walk-ons charge the route's
    // default fare unless the conductor screen overrides it.
    const { data: routeData } = await client
      .from("routes")
      .select("default_fare_usd, endpoint_start_stop_id, endpoint_end_stop_id")
      .eq("id", vehicle.route_id)
      .maybeSingle();
    const fareUsd = Number(input.fare_usd ?? routeData?.default_fare_usd ?? 1);

    const startStopId = routeData?.endpoint_start_stop_id;
    const endStopId = routeData?.endpoint_end_stop_id;
    if (!startStopId || !endStopId) {
      return { ok: false, error: "Route endpoints missing — cannot mint cash ticket." };
    }

    let inserted: TicketRow | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < ACCESS_CODE_RETRIES; attempt += 1) {
      const access_code = randomAccessCode();
      const { data, error } = await client
        .from("tickets")
        .insert({
          access_code,
          route_id: vehicle.route_id,
          board_at_stop_id: startStopId,
          alight_at_stop_id: endStopId,
          fare_usd: fareUsd,
          originating_user_id: null,
          current_holder_user_id: null,
          vehicle_id: vehicle.id,
          status: "completed",
          kind: "passenger",
          completed_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (!error && data) {
        inserted = data as TicketRow;
        break;
      }
      if (error && error.code !== PG_UNIQUE_VIOLATION) {
        lastError = error.message;
        break;
      }
    }
    if (!inserted) {
      return { ok: false, error: lastError ?? "Could not mint a cash ticket." };
    }

    const newPassengerCount = Math.min(
      vehicle.capacity_seats,
      vehicle.current_passenger_count + 1,
    );
    const { error: vehicleUpdateError } = await client
      .from("vehicles")
      .update({ current_passenger_count: newPassengerCount })
      .eq("id", vehicle.id);
    if (vehicleUpdateError) return { ok: false, error: vehicleUpdateError.message };

    revalidatePath("/hwindi");
    revalidatePath("/fleet");
    return {
      ok: true,
      ticket_id: inserted.id,
      access_code: inserted.access_code,
      fare_usd: Number(inserted.fare_usd),
      passenger_count: newPassengerCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cash walk-on failed." };
  }
}
