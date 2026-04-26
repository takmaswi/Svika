/**
 * Pure derivations for the Journey UX. No I/O, no React.
 *
 * Inputs are an active journey (from `loadActiveJourney`) and a snapshot of
 * vehicle positions from the `kombi-positions` Realtime broadcast. Outputs the
 * current stage, progress along the trip, ETA, and which kombi leg is "active".
 *
 * The data model has only ticket statuses and vehicle positions to work with —
 * there is no explicit "trip complete" flag. We treat the trip as arrived once
 * the final kombi-leg ticket is `redeemed` AND its assigned vehicle is within
 * `ARRIVED_RADIUS_METERS` of the alight stop. The walking-transfer stage uses
 * the same proximity test against the previous leg's alight stop.
 */

import type {
  ActiveJourney,
  JourneyKombiLeg,
  JourneyStage,
  JourneyStop,
} from "./journey-types";

export interface VehicleSnapshot {
  vehicle_id: string;
  route_id: string;
  lat: number;
  lng: number;
}

export const ARRIVED_RADIUS_METERS = 80;
export const NEAR_STOP_RADIUS_METERS = 120;
const FLASH_WINDOW_MS = 1100;
const EARTH_RADIUS_M = 6_371_000;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function distanceToStop(snap: VehicleSnapshot, stop: JourneyStop): number {
  return haversine(snap.lat, snap.lng, stop.lat, stop.lng);
}

function kombiLegs(journey: ActiveJourney): JourneyKombiLeg[] {
  return journey.legs.filter((l): l is JourneyKombiLeg => l.kind === "kombi");
}

function totalStageCount(journey: ActiveJourney): number {
  // Single-leg trips run 1 walk-to-board, 2 boarding, 3 in-transit, 4 arrived.
  // Two-leg trips run the full six described in the Phase 3.5 brief.
  return kombiLegs(journey).length === 1 ? 4 : 6;
}

/**
 * Pick the vehicle the passenger is or will be riding for a given kombi leg.
 *
 *   - If the leg's ticket already has a `vehicle_id` (conductor cleared the
 *     PIN), use it.
 *   - Otherwise pick the nearest vehicle on the leg's route to the board stop.
 *
 * Computed every render rather than written to the DB so the demo stays
 * schema-free.
 */
export function pickAssignedVehicle(
  leg: JourneyKombiLeg,
  vehicles: ReadonlyArray<VehicleSnapshot>,
): string | null {
  if (leg.vehicle_id) return leg.vehicle_id;
  let bestId: string | null = null;
  let bestMeters = Number.POSITIVE_INFINITY;
  for (const v of vehicles) {
    if (v.route_id !== leg.route_id) continue;
    const d = haversine(v.lat, v.lng, leg.board_stop.lat, leg.board_stop.lng);
    if (d < bestMeters) {
      bestMeters = d;
      bestId = v.vehicle_id;
    }
  }
  return bestId;
}

interface StageInputs {
  journey: ActiveJourney;
  vehiclesById: Map<string, VehicleSnapshot>;
  vehicles: ReadonlyArray<VehicleSnapshot>;
  /** Wall-clock ms used to expire a "just redeemed" boarding flash. */
  nowMs: number;
}

function progressForLeg(
  legIndex: number,
  totalKombiLegs: number,
  fraction: number,
): number {
  const share = 1 / totalKombiLegs;
  return Math.min(1, legIndex * share + share * Math.max(0, Math.min(1, fraction)));
}

function averageSpeedMps(leg: JourneyKombiLeg): number {
  const meters = haversine(
    leg.board_stop.lat,
    leg.board_stop.lng,
    leg.alight_stop.lat,
    leg.alight_stop.lng,
  );
  const seconds = Math.max(60, leg.duration_minutes * 60);
  return meters > 0 ? meters / seconds : 5;
}

function indexInLegs(journey: ActiveJourney, target: JourneyKombiLeg): number {
  for (let i = 0; i < journey.legs.length; i += 1) {
    const l = journey.legs[i];
    if (l.kind === "kombi" && l.ticket_id === target.ticket_id) return i;
  }
  return -1;
}

function arrivedStage(journey: ActiveJourney, total: number): JourneyStage {
  return {
    kind: "arrived",
    index: total,
    total,
    title: "Arrived · " + journey.destination.name,
    detail:
      "$" +
      journey.total_fare_usd.toFixed(2) +
      " · " +
      journey.total_duration_minutes +
      " min",
    progress: 1,
    active_kombi_leg_index: null,
    assigned_vehicle_id: null,
    eta_seconds: 0,
    flashing: false,
  };
}

/**
 * Derive the current stage. Pure function — re-run on every kombi tick and
 * any time `journey` changes.
 */
export function deriveJourneyStage(input: StageInputs): JourneyStage {
  const { journey, vehiclesById, vehicles, nowMs } = input;
  const kombi = kombiLegs(journey);
  const total = totalStageCount(journey);

  for (let i = 0; i < kombi.length; i += 1) {
    const leg = kombi[i];
    const isFirstLeg = i === 0;
    const isLast = i === kombi.length - 1;
    const assigned = pickAssignedVehicle(leg, vehicles);
    const vehicle = assigned ? vehiclesById.get(assigned) : undefined;
    const legActiveIdx = indexInLegs(journey, leg);

    if (leg.status === "issued" || leg.status === "held") {
      if (isFirstLeg) {
        const eta = vehicle
          ? Math.round(distanceToStop(vehicle, leg.board_stop) / averageSpeedMps(leg))
          : null;
        return {
          kind: "walk-to-board",
          index: 1,
          total,
          title: "Walk to board · " + leg.board_stop.name,
          detail: leg.route_name + " · code " + leg.access_code,
          progress: progressForLeg(i, kombi.length, 0.05),
          active_kombi_leg_index: legActiveIdx,
          assigned_vehicle_id: assigned,
          eta_seconds: eta,
          flashing: false,
        };
      }
      // Second leg still issued/held — we are between legs, walking.
      return {
        kind: "walking-transfer",
        index: 4,
        total,
        title: "Walking transfer · " + leg.board_stop.name,
        detail: "Catch " + leg.route_name + " · code " + leg.access_code,
        progress: progressForLeg(i, kombi.length, 0.05),
        active_kombi_leg_index: legActiveIdx,
        assigned_vehicle_id: assigned,
        eta_seconds: null,
        flashing: false,
      };
    }

    if (leg.status === "redeemed") {
      const redeemedAtMs = leg.redeemed_at ? Date.parse(leg.redeemed_at) : null;
      const flashing =
        redeemedAtMs !== null && nowMs - redeemedAtMs < FLASH_WINDOW_MS;
      const next = i + 1 < kombi.length ? kombi[i + 1] : null;
      // If a later leg has already been boarded, the rider is past this leg's
      // ride; advance the loop so we don't return "in-transit on leg 1" once
      // leg 2 is also redeemed. The boarding flash branch above still wins
      // for this leg's own ~1.1s flash window.
      if (!flashing && next && next.status === "redeemed") {
        continue;
      }

      const distToAlight = vehicle ? distanceToStop(vehicle, leg.alight_stop) : null;
      const distFromBoard = vehicle ? distanceToStop(vehicle, leg.board_stop) : null;
      const totalLegMeters =
        distToAlight !== null && distFromBoard !== null
          ? distFromBoard + distToAlight
          : null;
      const fraction =
        totalLegMeters && totalLegMeters > 0 && distFromBoard !== null
          ? Math.max(0, Math.min(1, distFromBoard / totalLegMeters))
          : 0.5;

      // Boarding flash takes precedence.
      if (flashing) {
        return {
          kind: isFirstLeg ? "boarding" : "boarding-leg-2",
          index: isFirstLeg ? 2 : 5,
          total,
          title: isFirstLeg
            ? "Boarding · code " + leg.access_code
            : "Boarding leg 2 · code " + leg.access_code,
          detail: leg.route_name + " · " + leg.alight_stop.name,
          progress: progressForLeg(i, kombi.length, 0.1),
          active_kombi_leg_index: legActiveIdx,
          assigned_vehicle_id: assigned,
          eta_seconds:
            vehicle != null
              ? Math.round(
                  distanceToStop(vehicle, leg.alight_stop) / averageSpeedMps(leg),
                )
              : null,
          flashing: true,
        };
      }

      if (isLast && distToAlight !== null && distToAlight <= ARRIVED_RADIUS_METERS) {
        return arrivedStage(journey, total);
      }

      // Walking-transfer fallthrough — vehicle is at the leg-1 alight stop and
      // a later kombi leg has not boarded yet. (Status check is implicit: the
      // outer loop has already returned for any earlier issued/held leg, but
      // we may have advanced past leg 1 in-transit and the next leg is still
      // issued / held — handled by the issued/held branch above on the next
      // iteration. Keep this case tight to avoid double-counting.)
      if (!isLast && distToAlight !== null && distToAlight <= NEAR_STOP_RADIUS_METERS) {
        const next = kombi[i + 1];
        if (next.status !== "redeemed") {
          return {
            kind: "walking-transfer",
            index: 4,
            total,
            title: "Walking transfer · " + next.board_stop.name,
            detail: "Catch " + next.route_name + " · code " + next.access_code,
            progress: progressForLeg(i, kombi.length, 1),
            active_kombi_leg_index: indexInLegs(journey, next),
            assigned_vehicle_id: pickAssignedVehicle(next, vehicles),
            eta_seconds: null,
            flashing: false,
          };
        }
      }

      const stageIndex = isFirstLeg ? 3 : 5;
      const etaSec =
        vehicle != null
          ? Math.round(
              distanceToStop(vehicle, leg.alight_stop) / averageSpeedMps(leg),
            )
          : null;
      return {
        kind: "in-transit",
        index: stageIndex,
        total,
        title: "On board · heading to " + leg.alight_stop.name,
        detail: leg.route_name + " · code " + leg.access_code,
        progress: progressForLeg(i, kombi.length, fraction),
        active_kombi_leg_index: legActiveIdx,
        assigned_vehicle_id: assigned,
        eta_seconds: etaSec,
        flashing: false,
      };
    }
  }

  return arrivedStage(journey, total);
}
