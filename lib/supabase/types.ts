/**
 * Hand-rolled Database shape covering the tables Phase 1 touches.
 *
 * Intentionally permissive: Insert and Update fall through to Partial<Row> so
 * the seed loader and sim runner can pass plain objects without fighting
 * supabase-js v2's stricter generated typings. PostGIS geography columns are
 * typed as `string` because we send WKT (e.g. "SRID=4326;POINT(lng lat)") and
 * never read geography back into the client during the demo.
 *
 * Row shapes are `type` aliases (not `interface`) so they satisfy supabase-js's
 * `Record<string, unknown>` constraint via structural typing — interfaces lack
 * an implicit index signature and cause the whole schema to resolve to `never`.
 *
 * Regenerate from the live schema once the local Supabase stack is set up:
 *   pnpm db:types
 */

type Geography = string;

type Table<T extends Record<string, unknown>> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type UserRow = {
  id: string;
  name: string;
  phone: string;
  role: "passenger" | "conductor" | "fleet_owner";
  credit_balance_usd: number;
  created_at: string;
};

export type RouteRow = {
  id: string;
  name: string;
  direction_summary: string | null;
  polyline: Geography | null;
  default_fare_usd: number;
  typical_duration_minutes: number;
  endpoint_start_stop_id: string | null;
  endpoint_end_stop_id: string | null;
  notes: string | null;
  created_at: string;
};

export type StopPointRow = {
  id: string;
  name: string;
  location: Geography;
  is_terminal: boolean;
  is_rank: boolean;
  created_at: string;
};

export type RouteStopRow = {
  route_id: string;
  stop_id: string;
  sequence: number;
};

export type FareSegmentRow = {
  id: string;
  route_id: string;
  from_stop_id: string;
  to_stop_id: string;
  fare_usd: number;
  effective_from: string;
};

export type TransferPointRow = {
  id: string;
  type: "rank_to_rank_walk" | "walking_junction";
  from_stop_id: string;
  to_stop_id: string;
  walking_distance_meters: number;
  walking_duration_minutes: number;
  walking_polyline: Geography | null;
  notes: string | null;
};

export type VehicleRow = {
  id: string;
  route_id: string;
  fleet_owner_id: string;
  current_conductor_id: string | null;
  capacity_seats: number;
  current_position: Geography | null;
  current_passenger_count: number;
  direction: "outbound" | "inbound" | null;
  last_position_at: string | null;
};

export type KombiPingRow = {
  id: number;
  vehicle_id: string;
  position: Geography;
  nearest_stop_id: string | null;
  is_at_stop: boolean;
  recorded_at: string;
};

export type TicketStatus =
  | "issued"
  | "transferred_pending"
  | "held"
  | "redeemed"
  | "completed"
  | "expired"
  | "cash_walkin";

export type PaymentMethod = "wallet" | "cash";

export type TicketRow = {
  id: string;
  access_code: string;
  route_id: string;
  board_at_stop_id: string;
  alight_at_stop_id: string;
  fare_usd: number;
  originating_user_id: string | null;
  current_holder_user_id: string | null;
  vehicle_id: string | null;
  status: TicketStatus;
  kind: "passenger" | "parcel";
  payment_method: PaymentMethod;
  parcel_receiver_phone: string | null;
  parcel_description: string | null;
  created_at: string;
  redeemed_at: string | null;
  completed_at: string | null;
};

export type TopUpRow = {
  id: string;
  user_id: string;
  amount_usd: number;
  created_at: string;
};

export type TripRow = {
  id: string;
  originating_user_id: string;
  origin_stop_id: string;
  destination_stop_id: string;
  selected_option_label: string;
  total_fare_usd: number;
  total_duration_minutes: number;
  created_at: string;
};

export type TripTicketRow = {
  trip_id: string;
  ticket_id: string;
  sequence: number;
};

export type TransferRow = {
  id: string;
  ticket_id: string;
  from_user_id: string;
  to_user_id: string | null;
  to_phone: string | null;
  transferred_at: string;
  claimed_at: string | null;
};

export type AuditNarrativeRow = {
  id: string;
  vehicle_id: string;
  for_date: string;
  english_text: string;
  shona_text: string;
  stops_made: number;
  digital_fares_logged: number;
  cash_walkons_logged: number;
  revenue_gap_estimate_usd: number;
  zimra_liability_estimate_usd: number;
  generated_at: string;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: Table<UserRow>;
      routes: Table<RouteRow>;
      stop_points: Table<StopPointRow>;
      route_stops: Table<RouteStopRow>;
      fare_segments: Table<FareSegmentRow>;
      transfer_points: Table<TransferPointRow>;
      vehicles: Table<VehicleRow>;
      kombi_pings: Table<KombiPingRow>;
      tickets: Table<TicketRow>;
      top_ups: Table<TopUpRow>;
      trips: Table<TripRow>;
      trip_tickets: Table<TripTicketRow>;
      transfers: Table<TransferRow>;
      audit_narratives: Table<AuditNarrativeRow>;
    };
    Views: { [key: string]: never };
    Functions: {
      routes_geojson: {
        Args: Record<string, unknown>;
        Returns: Array<{
          id: string;
          name: string;
          direction_summary: string | null;
          default_fare_usd: number;
          typical_duration_minutes: number;
          endpoint_start_stop_id: string | null;
          endpoint_end_stop_id: string | null;
          geojson: { type: string; coordinates: Array<[number, number]> } | null;
        }>;
      };
      stop_points_geojson: {
        Args: Record<string, unknown>;
        Returns: Array<{
          id: string;
          name: string;
          lng: number;
          lat: number;
          is_terminal: boolean;
          is_rank: boolean;
        }>;
      };
      route_stops_ordered: {
        Args: Record<string, unknown>;
        Returns: Array<{
          route_id: string;
          stop_id: string;
          sequence: number;
          stop_name: string;
          lng: number;
          lat: number;
          is_terminal: boolean;
          is_rank: boolean;
        }>;
      };
      nearest_vehicles_to_point: {
        Args: {
          in_lat: number;
          in_lng: number;
          in_limit?: number;
        };
        Returns: Array<{
          vehicle_id: string;
          route_id: string;
          route_name: string;
          distance_meters: number;
          estimated_minutes: number;
          current_passenger_count: number;
          capacity_seats: number;
          last_position_at: string;
        }>;
      };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
};
