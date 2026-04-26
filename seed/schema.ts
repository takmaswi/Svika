/**
 * Type contract for seed/network.json.
 *
 * The JSON file is the user's source of truth (verified against Google Maps
 * and Waze). This module just gives the loader and the trip planner a typed
 * shape to read from.
 */

export interface SeedStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  is_terminal: boolean;
  is_rank: boolean;
}

export interface SeedFareSegment {
  from_stop_id: string;
  to_stop_id: string;
  fare_usd: number;
}

export interface SeedRoute {
  id: string;
  name: string;
  endpoint_start: { name: string; lat: number; lng: number };
  endpoint_end: { name: string; lat: number; lng: number };
  direction_summary: string;
  /** Coarse hand-traced [lat, lng] polyline. Densified at seed time. */
  polyline: Array<[number, number]>;
  stop_points: SeedStop[];
  fare_segments: SeedFareSegment[];
  default_fare_usd: number;
  typical_duration_minutes: number;
  notes?: string;
}

export interface SeedTransferPoint {
  id: string;
  type: "rank_to_rank_walk" | "walking_junction";
  from_stop_id: string;
  to_stop_id: string;
  walking_distance_meters: number;
  walking_duration_minutes: number;
  walking_polyline: Array<[number, number]>;
  notes?: string;
}

export interface SeedTripPlanLeg {
  type: "kombi" | "walk";
  route_id?: string;
  transfer_id?: string;
  board_at_stop_id?: string;
  alight_at_stop_id?: string;
  fare_usd?: number;
  duration_minutes: number;
}

export interface SeedTripPlan {
  origin_stop_id: string;
  destination_stop_id: string;
  options: Array<{
    label: string;
    legs: SeedTripPlanLeg[];
    total_fare_usd: number;
    total_duration_minutes: number;
    total_walking_minutes: number;
    notes?: string;
  }>;
}

export interface SeedNetwork {
  routes: SeedRoute[];
  transfer_points: SeedTransferPoint[];
  trip_plans: SeedTripPlan[];
}
