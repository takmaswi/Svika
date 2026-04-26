/**
 * Trip planner — Phase 2 implementation target.
 *
 * Reads pre-computed plans from seed/network.json (the `trip_plans` array).
 * Returns one or more plan options for a given origin-destination pair.
 * Returns "no plan available" for any pair not in the seed data.
 *
 * A real graph-based planner is roadmap (docs/ROADMAP.md → Phase Nine).
 * For the hackathon, this function is the seed `trip_plans` array.
 */

import network from "@/seed/network.json" with { type: "json" };

export interface TripPlanLeg {
  type: "kombi" | "walk";
  route_id?: string;
  transfer_id?: string;
  board_at_stop_id?: string;
  alight_at_stop_id?: string;
  duration_minutes: number;
  fare_usd?: number;
}

export interface TripPlan {
  label: string;
  total_duration_minutes: number;
  total_fare_usd: number;
  total_walking_minutes: number;
  legs: TripPlanLeg[];
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

interface SeedTripPlan {
  origin_stop_id: string;
  destination_stop_id: string;
  options: TripPlan[];
}

export function planTrip(originStopId: string, destinationStopId: string): TripPlan[] {
  const plans = (network as unknown as { trip_plans?: SeedTripPlan[] }).trip_plans ?? [];
  const match = plans.find(
    (p) => p.origin_stop_id === originStopId && p.destination_stop_id === destinationStopId,
  );
  return match?.options ?? [];
}
