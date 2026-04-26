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
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
};
