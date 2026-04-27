/**
 * Shared types for the Phase 3.5 Journey UX.
 *
 * Lives in its own module so the server-side loader and the client-side stage
 * derivation can both import without bleeding server-only code into the
 * passenger bundle.
 */

import type { TicketStatus } from "@/lib/supabase/types";

export interface JourneyStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Receiver-side metadata for a parcel ticket. Set when the underlying ticket
 * row has `kind = 'parcel'`; carried alongside the kombi leg so the Phase 4.5
 * Uber-style journey card can swap into its parcel layout without a separate
 * loader pass.
 */
export interface ParcelMetadata {
  receiver_phone: string;
  description: string | null;
}

export interface JourneyKombiLeg {
  kind: "kombi";
  /** 0-based index into trip_tickets.sequence — the leg order across kombi legs. */
  ticket_sequence: number;
  ticket_id: string;
  access_code: string;
  status: TicketStatus;
  /** Underlying ticket's `kind` column. Drives the parcel-parity Journey branch. */
  ticket_kind: "passenger" | "parcel";
  /** Set only when `ticket_kind === "parcel"`; otherwise null. */
  parcel: ParcelMetadata | null;
  /** vehicle_id is set when the conductor clears the PIN. */
  vehicle_id: string | null;
  redeemed_at: string | null;
  route_id: string;
  route_name: string;
  board_stop: JourneyStop;
  alight_stop: JourneyStop;
  fare_usd: number;
  duration_minutes: number;
}

export interface JourneyWalkLeg {
  kind: "walk";
  transfer_id: string;
  duration_minutes: number;
  from_stop: JourneyStop;
  to_stop: JourneyStop;
  /** GeoJSON-friendly [lng, lat] points. Seed file stores [lat, lng]; we flip at load. */
  walking_polyline: Array<[number, number]>;
}

export type JourneyLeg = JourneyKombiLeg | JourneyWalkLeg;

export interface ActiveJourney {
  /**
   * `passenger` is the standard trip-planner journey (single or multi-leg).
   * `parcel` is a synthesised single-leg journey produced by the loader when
   * the persona has an in-flight parcel ticket and no active passenger trip;
   * the Journey card swaps to the parcel-parity layout in that case.
   */
  kind: "passenger" | "parcel";
  trip_id: string;
  trip_label: string;
  origin: JourneyStop;
  destination: JourneyStop;
  total_fare_usd: number;
  total_duration_minutes: number;
  total_walking_minutes: number;
  legs: JourneyLeg[];
  created_at: string;
}

/**
 * Derived stage state. `index`/`total` describe "Stage N of M" for the UI;
 * single-leg trips skip stages 4 + 5 and show "Stage N of 4".
 */
export type JourneyStageKind =
  | "walk-to-board"
  | "boarding"
  | "in-transit"
  | "walking-transfer"
  | "boarding-leg-2"
  | "arrived";

export interface JourneyStage {
  kind: JourneyStageKind;
  /** 1-based stage index for display. */
  index: number;
  /** Total number of stages this trip will visit (4 for one-leg, 6 for two-leg). */
  total: number;
  title: string;
  detail: string;
  /** 0..1 progress along the entire trip (used to animate the bar). */
  progress: number;
  /** Index into journey.legs of the active kombi leg, or null when arrived. */
  active_kombi_leg_index: number | null;
  /** Vehicle the passenger is on or waiting for, or null when arrived/walking. */
  assigned_vehicle_id: string | null;
  /** ETA in seconds to next meaningful stop (board / alight), or null when unknown. */
  eta_seconds: number | null;
  /** True for at most ~1.1s after a boarding event so the UI can flash. */
  flashing: boolean;
}
