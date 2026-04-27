"use server";

import { revalidatePath } from "next/cache";

import { understand } from "@/lib/ai/aiClient";
import { resolvePersona } from "@/lib/personas";
import { planTrip, type TripPlan } from "@/lib/trip-planner";
import { createServerClient } from "@/lib/supabase/server";
import type { Intent } from "@/lib/ai/types";
import type { PaymentMethod, TicketRow, TripRow } from "@/lib/supabase/types";
import { PG_UNIQUE_VIOLATION, randomAccessCode } from "./access-code";

const RECIPIENT_SLUGS = ["takunda", "rudo", "farai", "baba_tino"] as const;
type RecipientSlug = (typeof RECIPIENT_SLUGS)[number];

function isRecipientSlug(value: string): value is RecipientSlug {
  return (RECIPIENT_SLUGS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// findPlansAction — natural-language → structured intent → trip plan options.
// ---------------------------------------------------------------------------

export interface FindPlansResult {
  ok: true;
  intent: Intent;
  options: TripPlan[];
  origin_stop_id: string | null;
  destination_stop_id: string | null;
}

export interface ActionError {
  ok: false;
  error: string;
}

export async function findPlansAction(formData: FormData): Promise<FindPlansResult | ActionError> {
  const rawText = (formData.get("text") as string | null)?.trim();
  if (!rawText) return { ok: false, error: "Type where you want to go." };

  let intent: Intent;
  try {
    intent = await understand(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not parse the request.";
    return { ok: false, error: `Search failed: ${message}` };
  }

  if (!intent.origin_stop_id || !intent.destination_stop_id) {
    return {
      ok: false,
      error:
        intent.notes ??
        "Could not identify both endpoints. Try naming a known stop, e.g. 'Heights to Avondale'.",
    };
  }

  const options = planTrip(intent.origin_stop_id, intent.destination_stop_id);
  return {
    ok: true,
    intent,
    options,
    origin_stop_id: intent.origin_stop_id,
    destination_stop_id: intent.destination_stop_id,
  };
}

// ---------------------------------------------------------------------------
// bookTripAction — create trip, mint a ticket per kombi leg, deduct credit.
// ---------------------------------------------------------------------------

export interface BookTripResult {
  ok: true;
  trip_id: string;
  ticket_ids: string[];
  access_codes: string[];
}

interface BookTripInput {
  persona_slug: string;
  origin_stop_id: string;
  destination_stop_id: string;
  option: TripPlan;
  payment_method: PaymentMethod;
}

const ACCESS_CODE_RETRIES = 12;

async function insertTicketWithUniqueCode(
  client: Awaited<ReturnType<typeof createServerClient>>,
  base: Omit<Partial<TicketRow>, "access_code">,
): Promise<TicketRow> {
  for (let attempt = 0; attempt < ACCESS_CODE_RETRIES; attempt += 1) {
    const access_code = randomAccessCode();
    const { data, error } = await client
      .from("tickets")
      .insert({ ...base, access_code })
      .select("*")
      .single();
    if (!error && data) return data as TicketRow;
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      throw new Error(error.message);
    }
  }
  throw new Error("Could not assign a unique access code. Please retry.");
}

export async function bookTripAction(input: BookTripInput): Promise<BookTripResult | ActionError> {
  const persona = await resolvePersona(input.persona_slug, "passenger");
  if (persona.role !== "passenger") {
    return { ok: false, error: "Only passengers can buy trips." };
  }
  const paymentMethod: PaymentMethod = input.payment_method ?? "wallet";
  if (paymentMethod === "wallet" && persona.credit_balance_usd < input.option.total_fare_usd) {
    return { ok: false, error: "Not enough credit. Top up to continue." };
  }

  try {
    const client = await createServerClient();

    const { data: tripData, error: tripError } = await client
      .from("trips")
      .insert({
        originating_user_id: persona.id,
        origin_stop_id: input.origin_stop_id,
        destination_stop_id: input.destination_stop_id,
        selected_option_label: input.option.label,
        total_fare_usd: input.option.total_fare_usd,
        total_duration_minutes: input.option.total_duration_minutes,
      })
      .select("id")
      .single();
    if (tripError || !tripData) {
      return { ok: false, error: tripError?.message ?? "Could not create trip." };
    }
    const trip = tripData as Pick<TripRow, "id">;

    const ticketIds: string[] = [];
    const accessCodes: string[] = [];
    let sequence = 0;

    for (const leg of input.option.legs) {
      if (leg.type !== "kombi") continue;
      if (!leg.route_id || !leg.board_at_stop_id || !leg.alight_at_stop_id) {
        return { ok: false, error: "Trip plan missing leg detail." };
      }
      const ticket = await insertTicketWithUniqueCode(client, {
        route_id: leg.route_id,
        board_at_stop_id: leg.board_at_stop_id,
        alight_at_stop_id: leg.alight_at_stop_id,
        fare_usd: leg.fare_usd ?? 0,
        originating_user_id: persona.id,
        current_holder_user_id: persona.id,
        status: "issued",
        kind: "passenger",
        payment_method: paymentMethod,
      });
      ticketIds.push(ticket.id);
      accessCodes.push(ticket.access_code);

      const { error: linkError } = await client
        .from("trip_tickets")
        .insert({ trip_id: trip.id, ticket_id: ticket.id, sequence });
      if (linkError) {
        return { ok: false, error: linkError.message };
      }
      sequence += 1;
    }

    if (ticketIds.length === 0) {
      return { ok: false, error: "Trip has no kombi legs to ticket." };
    }

    if (paymentMethod === "wallet") {
      const newBalance = Number(
        (persona.credit_balance_usd - input.option.total_fare_usd).toFixed(2),
      );
      const { error: balanceError } = await client
        .from("users")
        .update({ credit_balance_usd: newBalance })
        .eq("id", persona.id);
      if (balanceError) {
        return { ok: false, error: balanceError.message };
      }
    }

    revalidatePath("/");
    return { ok: true, trip_id: trip.id, ticket_ids: ticketIds, access_codes: accessCodes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Booking failed." };
  }
}

// ---------------------------------------------------------------------------
// topUpAction — mocked wallet credit top-up. Logs a row in `top_ups` and
// increments users.credit_balance_usd. No real fintech is touched.
// ---------------------------------------------------------------------------

export interface TopUpResult {
  ok: true;
  amount_usd: number;
  new_balance_usd: number;
}

export async function topUpAction(input: {
  persona_slug: string;
  amount_usd: number;
}): Promise<TopUpResult | ActionError> {
  const amount = Number(input.amount_usd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Top-up amount must be positive." };
  }
  const persona = await resolvePersona(input.persona_slug, "passenger");
  if (persona.role !== "passenger") {
    return { ok: false, error: "Only passengers can top up." };
  }

  try {
    const client = await createServerClient();
    const newBalance = Number((persona.credit_balance_usd + amount).toFixed(2));

    const { error: updateError } = await client
      .from("users")
      .update({ credit_balance_usd: newBalance })
      .eq("id", persona.id);
    if (updateError) return { ok: false, error: updateError.message };

    const { error: insertError } = await client
      .from("top_ups")
      .insert({ user_id: persona.id, amount_usd: amount });
    if (insertError) {
      // Roll the balance back on log-write failure so the demo stays consistent.
      await client
        .from("users")
        .update({ credit_balance_usd: persona.credit_balance_usd })
        .eq("id", persona.id);
      return { ok: false, error: insertError.message };
    }

    revalidatePath("/");
    return { ok: true, amount_usd: amount, new_balance_usd: newBalance };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Top-up failed." };
  }
}

// ---------------------------------------------------------------------------
// endTripAction — passenger-driven trip cancel.
//
// Marks every ticket the persona still holds on this trip as `completed`
// (status='completed', completed_at=now()). Demo behaviour only: credit is
// NOT refunded — refund-on-cancel is roadmap, see docs/ROADMAP.md.
// ---------------------------------------------------------------------------

export interface EndTripResult {
  ok: true;
  ended_count: number;
}

export async function endTripAction(input: {
  persona_slug: string;
  trip_id: string;
}): Promise<EndTripResult | ActionError> {
  const persona = await resolvePersona(input.persona_slug, "passenger");
  if (persona.role !== "passenger") {
    return { ok: false, error: "Only passengers can end a trip." };
  }

  try {
    const client = await createServerClient();

    const { data: tripData, error: tripError } = await client
      .from("trips")
      .select("id, originating_user_id")
      .eq("id", input.trip_id)
      .single();
    if (tripError || !tripData) {
      return { ok: false, error: "Trip not found." };
    }
    if ((tripData as Pick<TripRow, "id" | "originating_user_id">).originating_user_id !== persona.id) {
      return { ok: false, error: "Not your trip." };
    }

    const { data: linksData } = await client
      .from("trip_tickets")
      .select("ticket_id")
      .eq("trip_id", input.trip_id);
    const ticketIds = ((linksData ?? []) as Array<{ ticket_id: string }>).map(
      (l) => l.ticket_id,
    );
    if (ticketIds.length === 0) {
      return { ok: true, ended_count: 0 };
    }

    const { data: updated, error: updateError } = await client
      .from("tickets")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .in("id", ticketIds)
      .eq("current_holder_user_id", persona.id)
      .in("status", ["issued", "held", "redeemed"])
      .select("id");
    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    revalidatePath("/");
    return { ok: true, ended_count: ((updated ?? []) as Array<{ id: string }>).length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "End trip failed." };
  }
}

// ---------------------------------------------------------------------------
// transferTicketAction — flip status to transferred_pending and log it.
// ---------------------------------------------------------------------------

export interface TransferResult {
  ok: true;
  share_url: string;
  recipient_name: string;
  ticket_id: string;
}

export async function transferTicketAction(input: {
  persona_slug: string;
  ticket_id: string;
  recipient_slug: string;
}): Promise<TransferResult | ActionError> {
  const recipient_slug = input.recipient_slug.toLowerCase();
  if (!isRecipientSlug(recipient_slug)) {
    return { ok: false, error: "Unknown recipient." };
  }
  const sender = await resolvePersona(input.persona_slug, "passenger");
  const recipient = await resolvePersona(recipient_slug, "passenger");
  if (sender.id === recipient.id) {
    return { ok: false, error: "Cannot transfer a ticket to yourself." };
  }

  try {
    const client = await createServerClient();

    const { data: ticketData, error: ticketError } = await client
      .from("tickets")
      .select("*")
      .eq("id", input.ticket_id)
      .single();
    if (ticketError || !ticketData) {
      return { ok: false, error: "Ticket not found." };
    }
    const ticket = ticketData as TicketRow;
    if (ticket.current_holder_user_id !== sender.id) {
      return { ok: false, error: "You no longer hold this ticket." };
    }
    if (ticket.status !== "issued" && ticket.status !== "held") {
      return { ok: false, error: `Ticket is ${ticket.status} and cannot be transferred.` };
    }

    const { error: updateError } = await client
      .from("tickets")
      .update({ status: "transferred_pending" })
      .eq("id", ticket.id);
    if (updateError) return { ok: false, error: updateError.message };

    const { error: insertError } = await client.from("transfers").insert({
      ticket_id: ticket.id,
      from_user_id: sender.id,
      to_user_id: recipient.id,
      to_phone: recipient.phone,
    });
    if (insertError) return { ok: false, error: insertError.message };

    const share_url = `/?as=${recipient_slug}&claim=${ticket.id}`;
    revalidatePath("/");
    return {
      ok: true,
      share_url,
      recipient_name: recipient.name,
      ticket_id: ticket.id,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Transfer failed." };
  }
}

// ---------------------------------------------------------------------------
// bookParcelAction — Phase 4 stretch 1.
//
// Mints a `kind='parcel'` ticket for the demo's same-kombi parcel flow.
// Sender's wallet pays the fare (or cash on-board); conductor accepts on
// `/hwindi` with the same single 3-digit code as a passenger ticket.
//
// Routes: hardcoded to route_heights_rezende — that's the only line on which
// Farai actually drives in the demo, so the parcel is guaranteed to clear
// during the recording. Destinations limited to the four stops on that route.
// ---------------------------------------------------------------------------

const PARCEL_ROUTE_ID = "route_heights_rezende";
const PARCEL_BOARD_STOP = "sp_heights_start_north";
const PARCEL_ALLOWED_ALIGHTS = [
  "sp_uz_gate",
  "sp_second_lomagundi",
  "sp_rezende_rank",
] as const;
type ParcelAlight = (typeof PARCEL_ALLOWED_ALIGHTS)[number];

function isParcelAlight(value: string): value is ParcelAlight {
  return (PARCEL_ALLOWED_ALIGHTS as readonly string[]).includes(value);
}

export interface BookParcelResult {
  ok: true;
  ticket_id: string;
  access_code: string;
  fare_usd: number;
}

export async function bookParcelAction(input: {
  persona_slug: string;
  alight_at_stop_id: string;
  receiver_phone: string;
  description: string;
  payment_method: PaymentMethod;
}): Promise<BookParcelResult | ActionError> {
  const persona = await resolvePersona(input.persona_slug, "passenger");
  if (persona.role !== "passenger") {
    return { ok: false, error: "Only passengers can send parcels." };
  }
  if (!isParcelAlight(input.alight_at_stop_id)) {
    return { ok: false, error: "Pick a destination on the Heights → Rezende route." };
  }
  const trimmedDesc = input.description.trim();
  if (trimmedDesc.length < 3) {
    return { ok: false, error: "Add a short description so the receiver knows what to expect." };
  }
  const phone = input.receiver_phone.trim();
  if (!/^\+\d{6,15}$/.test(phone) && !/^0\d{9,12}$/.test(phone)) {
    return { ok: false, error: "Phone must be in +263… or 077… form." };
  }

  try {
    const client = await createServerClient();

    // Fare from the route's segment table; fall back to default fare if missing.
    const { data: fareData } = await client
      .from("fare_segments")
      .select("fare_usd")
      .eq("route_id", PARCEL_ROUTE_ID)
      .eq("from_stop_id", PARCEL_BOARD_STOP)
      .eq("to_stop_id", input.alight_at_stop_id)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fareUsd = Number(fareData?.fare_usd ?? 1.0);

    if (input.payment_method === "wallet" && persona.credit_balance_usd < fareUsd) {
      return { ok: false, error: "Not enough credit. Top up to send the parcel." };
    }

    const ticket = await insertTicketWithUniqueCode(client, {
      route_id: PARCEL_ROUTE_ID,
      board_at_stop_id: PARCEL_BOARD_STOP,
      alight_at_stop_id: input.alight_at_stop_id,
      fare_usd: fareUsd,
      originating_user_id: persona.id,
      current_holder_user_id: persona.id,
      status: "issued",
      kind: "parcel",
      payment_method: input.payment_method,
      parcel_receiver_phone: phone,
      parcel_description: trimmedDesc,
    });

    if (input.payment_method === "wallet") {
      const newBalance = Number((persona.credit_balance_usd - fareUsd).toFixed(2));
      const { error: balanceError } = await client
        .from("users")
        .update({ credit_balance_usd: newBalance })
        .eq("id", persona.id);
      if (balanceError) {
        return { ok: false, error: balanceError.message };
      }
    }

    revalidatePath("/");
    return {
      ok: true,
      ticket_id: ticket.id,
      access_code: ticket.access_code,
      fare_usd: fareUsd,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Parcel booking failed." };
  }
}

// ---------------------------------------------------------------------------
// claimTicketAction — recipient lands on /?as=rudo&claim=<id>; flips to held.
// ---------------------------------------------------------------------------

export interface ClaimResult {
  ok: true;
  ticket_id: string;
  already_claimed: boolean;
}

export async function claimTicketAction(input: {
  persona_slug: string;
  ticket_id: string;
}): Promise<ClaimResult | ActionError> {
  const claimer = await resolvePersona(input.persona_slug, "passenger");
  try {
    const client = await createServerClient();

    const { data: ticketData, error: ticketError } = await client
      .from("tickets")
      .select("*")
      .eq("id", input.ticket_id)
      .single();
    if (ticketError || !ticketData) {
      return { ok: false, error: "Ticket not found." };
    }
    const ticket = ticketData as TicketRow;

    if (ticket.current_holder_user_id === claimer.id && ticket.status === "held") {
      return { ok: true, ticket_id: ticket.id, already_claimed: true };
    }
    if (ticket.status !== "transferred_pending") {
      return { ok: false, error: `Ticket is ${ticket.status} — nothing to claim.` };
    }

    const { data: transferData } = await client
      .from("transfers")
      .select("id, to_user_id")
      .eq("ticket_id", ticket.id)
      .is("claimed_at", null)
      .order("transferred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transferData && transferData.to_user_id && transferData.to_user_id !== claimer.id) {
      return { ok: false, error: "This transfer was sent to someone else." };
    }

    const { error: ticketUpdateError } = await client
      .from("tickets")
      .update({ status: "held", current_holder_user_id: claimer.id })
      .eq("id", ticket.id);
    if (ticketUpdateError) return { ok: false, error: ticketUpdateError.message };

    if (transferData?.id) {
      await client
        .from("transfers")
        .update({ claimed_at: new Date().toISOString(), to_user_id: claimer.id })
        .eq("id", transferData.id);
    }

    revalidatePath("/");
    return { ok: true, ticket_id: ticket.id, already_claimed: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Claim failed." };
  }
}
