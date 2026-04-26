/**
 * Server-side fleet state loader.
 *
 * For a fleet owner, returns one entry per kombi covering today's:
 *   - stops_made           (kombi_pings where is_at_stop, deduped per stop_id+5min window)
 *   - digital_fares_logged (tickets with status 'redeemed', kind 'passenger')
 *   - cash_walkons_logged  (tickets with status 'completed', kind 'passenger',
 *                           originating_user_id IS NULL — see /hwindi cash flow)
 *   - parcels_delivered    (tickets with kind 'parcel', status 'completed')
 *   - total_logged_revenue_usd
 *   - revenue_gap_estimate_usd  (stops_made minus fares logged, × default fare)
 *   - zimra_liability_estimate_usd  (10% of revenue extrapolated to a month)
 *
 * Writes nothing. The audit-narrative generator (`lib/fleet/audit.ts`) reads
 * these stats and either pulls a cached narrative from `audit_narratives` or
 * calls `aiClient.narrate()` and inserts a fresh row.
 */

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import { createServerClient } from "@/lib/supabase/server";
import type { TicketRow, VehicleRow } from "@/lib/supabase/types";

const seed = network as unknown as SeedNetwork;

const routeById = new Map<string, { name: string; default_fare_usd: number }>();
for (const r of seed.routes) {
  routeById.set(r.id, { name: r.name, default_fare_usd: r.default_fare_usd });
}

export const ZIMRA_RATE = 0.1; // 10% — see CLAUDE.md note on flat extrapolation
export const DAYS_PER_MONTH = 30;

export interface FleetVehicleStats {
  vehicle_id: string;
  route_id: string;
  route_name: string;
  default_fare_usd: number;
  current_passenger_count: number;
  capacity_seats: number;
  stops_made: number;
  digital_fares_logged: number;
  cash_walkons_logged: number;
  parcels_delivered: number;
  total_logged_revenue_usd: number;
  /** Stops with no matching fare × default fare. Floored at zero. */
  revenue_gap_estimate_usd: number;
  zimra_liability_estimate_usd: number;
}

export interface FleetState {
  for_date: string;
  vehicles: FleetVehicleStats[];
  totals: {
    revenue_usd: number;
    revenue_gap_usd: number;
    zimra_liability_usd: number;
    stops_made: number;
    digital_fares_logged: number;
    cash_walkons_logged: number;
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDateOnly(): string {
  // YYYY-MM-DD in UTC. The audit_narratives unique key uses a date column,
  // so we anchor consistently regardless of the server's local timezone.
  return new Date().toISOString().slice(0, 10);
}

interface VehicleAggregate {
  vehicle: VehicleRow;
  stops_made: number;
  tickets: TicketRow[];
}

async function aggregateForOwner(ownerId: string): Promise<VehicleAggregate[]> {
  const client = await createServerClient();
  const since = startOfTodayIso();

  const { data: vehiclesData, error: vehiclesError } = await client
    .from("vehicles")
    .select("*")
    .eq("fleet_owner_id", ownerId)
    .order("id", { ascending: true });
  if (vehiclesError || !vehiclesData) return [];

  const vehicles = vehiclesData as VehicleRow[];
  if (vehicles.length === 0) return [];

  const vehicleIds = vehicles.map((v) => v.id);

  const [pingsRes, ticketsRes] = await Promise.all([
    client
      .from("kombi_pings")
      .select("vehicle_id, nearest_stop_id, is_at_stop, recorded_at")
      .in("vehicle_id", vehicleIds)
      .eq("is_at_stop", true)
      .gte("recorded_at", since),
    client
      .from("tickets")
      .select(
        "id, access_code, fare_usd, status, kind, vehicle_id, originating_user_id, route_id, board_at_stop_id, alight_at_stop_id, current_holder_user_id, parcel_receiver_phone, parcel_description, created_at, redeemed_at, completed_at",
      )
      .in("vehicle_id", vehicleIds)
      .gte("created_at", since),
  ]);

  type PingRow = {
    vehicle_id: string;
    nearest_stop_id: string | null;
    is_at_stop: boolean;
    recorded_at: string;
  };
  const pings = (pingsRes.data ?? []) as PingRow[];
  const tickets = (ticketsRes.data ?? []) as TicketRow[];

  // Stop count: distinct (vehicle_id, nearest_stop_id) buckets within today,
  // collapsing same-stop pings within a 5-minute window so a kombi sitting at
  // a rank does not inflate the count.
  const stopBucketsByVehicle = new Map<string, Set<string>>();
  for (const p of pings) {
    if (!p.nearest_stop_id) continue;
    const bucket = Math.floor(new Date(p.recorded_at).getTime() / (5 * 60 * 1000));
    const key = `${p.nearest_stop_id}::${bucket}`;
    const set = stopBucketsByVehicle.get(p.vehicle_id) ?? new Set<string>();
    set.add(key);
    stopBucketsByVehicle.set(p.vehicle_id, set);
  }

  return vehicles.map((v) => ({
    vehicle: v,
    stops_made: stopBucketsByVehicle.get(v.id)?.size ?? 0,
    tickets: tickets.filter((t) => t.vehicle_id === v.id),
  }));
}

function summarise(agg: VehicleAggregate): FleetVehicleStats {
  const route = routeById.get(agg.vehicle.route_id);
  const defaultFare = route?.default_fare_usd ?? 1;

  let digital = 0;
  let cash = 0;
  let parcels = 0;
  let revenue = 0;

  for (const t of agg.tickets) {
    const fare = Number(t.fare_usd ?? 0);
    if (t.kind === "parcel" && t.status === "completed") {
      parcels += 1;
      revenue += fare;
      continue;
    }
    if (t.kind === "passenger" && t.status === "redeemed") {
      digital += 1;
      revenue += fare;
      continue;
    }
    if (t.kind === "passenger" && t.status === "completed" && t.originating_user_id === null) {
      cash += 1;
      revenue += fare;
      continue;
    }
  }

  // Honest gap accounting: every stop is a chance to load fares. If the
  // stops-to-fares ratio is short, the difference × default_fare is the
  // implied revenue gap. Floor at zero for the demo.
  const totalFaresLogged = digital + cash;
  const gapStops = Math.max(0, agg.stops_made - totalFaresLogged);
  const gap = Number((gapStops * defaultFare).toFixed(2));

  const monthlyRevenue = revenue * DAYS_PER_MONTH;
  const zimraLiability = Number((monthlyRevenue * ZIMRA_RATE).toFixed(2));

  return {
    vehicle_id: agg.vehicle.id,
    route_id: agg.vehicle.route_id,
    route_name: route?.name ?? agg.vehicle.route_id,
    default_fare_usd: defaultFare,
    current_passenger_count: agg.vehicle.current_passenger_count,
    capacity_seats: agg.vehicle.capacity_seats,
    stops_made: agg.stops_made,
    digital_fares_logged: digital,
    cash_walkons_logged: cash,
    parcels_delivered: parcels,
    total_logged_revenue_usd: Number(revenue.toFixed(2)),
    revenue_gap_estimate_usd: gap,
    zimra_liability_estimate_usd: zimraLiability,
  };
}

export async function loadFleetState(ownerId: string): Promise<FleetState> {
  const aggregates = await aggregateForOwner(ownerId);
  const vehicles = aggregates.map(summarise);
  const totals = vehicles.reduce(
    (acc, v) => ({
      revenue_usd: acc.revenue_usd + v.total_logged_revenue_usd,
      revenue_gap_usd: acc.revenue_gap_usd + v.revenue_gap_estimate_usd,
      zimra_liability_usd: acc.zimra_liability_usd + v.zimra_liability_estimate_usd,
      stops_made: acc.stops_made + v.stops_made,
      digital_fares_logged: acc.digital_fares_logged + v.digital_fares_logged,
      cash_walkons_logged: acc.cash_walkons_logged + v.cash_walkons_logged,
    }),
    {
      revenue_usd: 0,
      revenue_gap_usd: 0,
      zimra_liability_usd: 0,
      stops_made: 0,
      digital_fares_logged: 0,
      cash_walkons_logged: 0,
    },
  );

  return {
    for_date: todayDateOnly(),
    vehicles,
    totals: {
      revenue_usd: Number(totals.revenue_usd.toFixed(2)),
      revenue_gap_usd: Number(totals.revenue_gap_usd.toFixed(2)),
      zimra_liability_usd: Number(totals.zimra_liability_usd.toFixed(2)),
      stops_made: totals.stops_made,
      digital_fares_logged: totals.digital_fares_logged,
      cash_walkons_logged: totals.cash_walkons_logged,
    },
  };
}
