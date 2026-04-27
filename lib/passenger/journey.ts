/**
 * Active-journey loader for the passenger surface.
 *
 * Returns the persona's most recent trip whose kombi-leg tickets are still in
 * flight (issued / held / redeemed) and never `transferred_pending`. Walks the
 * seed `trip_plans` array to reconstruct walk legs that the database does not
 * persist, joining each kombi leg back to its `tickets` row by sequence.
 *
 * No schema change. The trip plan is identified by (origin, destination,
 * label) — the same triple Phase 2 writes into `trips.selected_option_label`.
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork, SeedTripPlanLeg } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";
import type { TicketRow, TripRow, TripTicketRow } from "@/lib/supabase/types";
import type {
  ActiveJourney,
  JourneyKombiLeg,
  JourneyLeg,
  JourneyStop,
  JourneyWalkLeg,
} from "./journey-types";

const seed = network as unknown as SeedNetwork;

const stopById = new Map<string, JourneyStop>();
for (const route of seed.routes) {
  for (const s of route.stop_points) {
    if (!stopById.has(s.id)) {
      stopById.set(s.id, { id: s.id, name: s.name, lat: s.lat, lng: s.lng });
    }
  }
}

const routeNameById = new Map<string, string>();
for (const r of seed.routes) routeNameById.set(r.id, r.name);

const transferById = new Map<string, (typeof seed)["transfer_points"][number]>();
for (const t of seed.transfer_points) transferById.set(t.id, t);

function findPlanLegs(
  origin: string,
  destination: string,
  label: string,
): SeedTripPlanLeg[] | null {
  const trip = seed.trip_plans.find(
    (p) => p.origin_stop_id === origin && p.destination_stop_id === destination,
  );
  if (!trip) return null;
  const option = trip.options.find((o) => o.label === label);
  return option?.legs ?? null;
}

function kombiTicketsBySequence(
  trip_id: string,
  legs: TripTicketRow[],
  tickets: Map<string, TicketRow>,
): TicketRow[] {
  const ordered = [...legs]
    .filter((l) => l.trip_id === trip_id)
    .sort((a, b) => a.sequence - b.sequence);
  const out: TicketRow[] = [];
  for (const link of ordered) {
    const ticket = tickets.get(link.ticket_id);
    if (ticket) out.push(ticket);
  }
  return out;
}

/**
 * The persona's "active" journey: most recent trip where every kombi-leg
 * ticket they own is still issued / held / redeemed. If a leg has been
 * transferred away (or completed/expired), the trip is considered done from
 * this passenger's point of view.
 */
export async function loadActiveJourney(
  personaId: string,
): Promise<ActiveJourney | null> {
  try {
    const client = await createServerClient();

    const { data: tripsData, error: tripsError } = await client
      .from("trips")
      .select("*")
      .eq("originating_user_id", personaId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (tripsError || !tripsData || tripsData.length === 0) return null;
    const trips = tripsData as TripRow[];

    const tripIds = trips.map((t) => t.id);

    const { data: linksData } = await client
      .from("trip_tickets")
      .select("*")
      .in("trip_id", tripIds);
    const links = (linksData ?? []) as TripTicketRow[];

    const ticketIds = links.map((l) => l.ticket_id);
    if (ticketIds.length === 0) return null;

    const { data: ticketsData } = await client
      .from("tickets")
      .select("*")
      .in("id", ticketIds);
    const tickets = new Map<string, TicketRow>();
    for (const t of (ticketsData ?? []) as TicketRow[]) tickets.set(t.id, t);

    // Pick the most-recent trip whose kombi legs are still in flight for this
    // persona. "In flight" = every leg ticket still in {issued, held, redeemed}
    // AND still held by this user. If any leg was transferred away the trip
    // is no longer "active" for them.
    for (const trip of trips) {
      const tripTickets = kombiTicketsBySequence(trip.id, links, tickets);
      if (tripTickets.length === 0) continue;
      const stillHeld = tripTickets.every(
        (t) =>
          (t.status === "issued" || t.status === "held" || t.status === "redeemed") &&
          t.current_holder_user_id === personaId,
      );
      if (!stillHeld) continue;

      const planLegs = findPlanLegs(
        trip.origin_stop_id,
        trip.destination_stop_id,
        trip.selected_option_label,
      );
      if (!planLegs || planLegs.length === 0) continue;

      const legs: JourneyLeg[] = [];
      let kombiIdx = 0;
      let totalWalking = 0;
      for (const leg of planLegs) {
        if (leg.type === "kombi") {
          const ticket = tripTickets[kombiIdx];
          if (
            !ticket ||
            !leg.route_id ||
            !leg.board_at_stop_id ||
            !leg.alight_at_stop_id
          ) {
            kombiIdx += 1;
            continue;
          }
          const board = stopById.get(leg.board_at_stop_id);
          const alight = stopById.get(leg.alight_at_stop_id);
          if (!board || !alight) {
            kombiIdx += 1;
            continue;
          }
          const kombi: JourneyKombiLeg = {
            kind: "kombi",
            ticket_sequence: kombiIdx,
            ticket_id: ticket.id,
            access_code: ticket.access_code,
            status: ticket.status,
            ticket_kind: ticket.kind,
            parcel:
              ticket.kind === "parcel"
                ? {
                    receiver_phone: ticket.parcel_receiver_phone ?? "",
                    description: ticket.parcel_description ?? null,
                  }
                : null,
            vehicle_id: ticket.vehicle_id,
            redeemed_at: ticket.redeemed_at,
            route_id: leg.route_id,
            route_name: routeNameById.get(leg.route_id) ?? leg.route_id,
            board_stop: board,
            alight_stop: alight,
            fare_usd: Number(ticket.fare_usd),
            duration_minutes: leg.duration_minutes,
          };
          legs.push(kombi);
          kombiIdx += 1;
        } else if (leg.type === "walk" && leg.transfer_id) {
          const transfer = transferById.get(leg.transfer_id);
          const from = transfer ? stopById.get(transfer.from_stop_id) : null;
          const to = transfer ? stopById.get(transfer.to_stop_id) : null;
          if (!transfer || !from || !to) continue;
          const walk: JourneyWalkLeg = {
            kind: "walk",
            transfer_id: transfer.id,
            duration_minutes: leg.duration_minutes,
            from_stop: from,
            to_stop: to,
            walking_polyline: transfer.walking_polyline.map(
              ([lat, lng]) => [lng, lat] as [number, number],
            ),
          };
          legs.push(walk);
          totalWalking += leg.duration_minutes;
        }
      }

      if (legs.filter((l) => l.kind === "kombi").length === 0) continue;

      const origin = stopById.get(trip.origin_stop_id);
      const destination = stopById.get(trip.destination_stop_id);
      if (!origin || !destination) continue;

      return {
        kind: "passenger",
        trip_id: trip.id,
        trip_label: trip.selected_option_label,
        origin,
        destination,
        total_fare_usd: Number(trip.total_fare_usd),
        total_duration_minutes: trip.total_duration_minutes,
        total_walking_minutes: totalWalking,
        legs,
        created_at: trip.created_at,
      };
    }

    // ---- Parcel fallback ---------------------------------------------------
    // Phase 4.5 — when the persona has no active passenger trip but is
    // tracking an in-flight parcel they sent, surface it as a synthesised
    // single-leg journey so the Uber-style card can swap into its parcel
    // layout. Wallet still shows the same parcel; this just adds the live
    // tracker overlay. Skips parcels routed for stops we cannot resolve.
    return loadActiveParcelJourney(personaId);
  } catch {
    return null;
  }
}

async function loadActiveParcelJourney(
  personaId: string,
): Promise<ActiveJourney | null> {
  const client = await createServerClient();
  const { data, error } = await client
    .from("tickets")
    .select("*")
    .eq("originating_user_id", personaId)
    .eq("kind", "parcel")
    .in("status", ["issued", "held", "redeemed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const ticket = data as TicketRow;
  const board = stopById.get(ticket.board_at_stop_id);
  const alight = stopById.get(ticket.alight_at_stop_id);
  if (!board || !alight) return null;

  const leg: JourneyKombiLeg = {
    kind: "kombi",
    ticket_sequence: 0,
    ticket_id: ticket.id,
    access_code: ticket.access_code,
    status: ticket.status,
    ticket_kind: "parcel",
    parcel: {
      receiver_phone: ticket.parcel_receiver_phone ?? "",
      description: ticket.parcel_description ?? null,
    },
    vehicle_id: ticket.vehicle_id,
    redeemed_at: ticket.redeemed_at,
    route_id: ticket.route_id,
    route_name: routeNameById.get(ticket.route_id) ?? ticket.route_id,
    board_stop: board,
    alight_stop: alight,
    fare_usd: Number(ticket.fare_usd),
    // Parcels do not carry a duration estimate on the ticket; reuse the route's
    // typical duration as a coarse upper bound for the progress bar share.
    duration_minutes: 20,
  };

  return {
    kind: "parcel",
    // Synthesised id — Journey/PassengerShell route end-trip locally for
    // parcels (see parcel branch comment in PassengerShell.handleEndTrip).
    trip_id: "parcel:" + ticket.id,
    trip_label: "Parcel via " + (routeNameById.get(ticket.route_id) ?? ticket.route_id),
    origin: board,
    destination: alight,
    total_fare_usd: Number(ticket.fare_usd),
    total_duration_minutes: 20,
    total_walking_minutes: 0,
    legs: [leg],
    created_at: ticket.created_at,
  };
}
