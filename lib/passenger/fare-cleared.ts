"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { VehicleRow } from "@/lib/supabase/types";

export interface FareClearedContextResult {
  ok: true;
  vehicle_id: string;
  conductor_name: string;
  passenger_count: number;
  capacity_seats: number;
}

export interface FareClearedContextError {
  ok: false;
  error: string;
}

/**
 * Resolve the conductor name and current seat-count for a vehicle the
 * passenger surface just heard a redeem broadcast for. Used to populate the
 * "Fare cleared by Farai · ZH 4821 · seat 9 of 15" toast.
 *
 * Falls back to "the conductor" if the vehicle has no conductor assigned —
 * shouldn't happen at demo time but keeps the UI honest if data drifts.
 */
export async function fetchFareClearedContextAction(input: {
  vehicle_id: string;
}): Promise<FareClearedContextResult | FareClearedContextError> {
  try {
    const client = await createServerClient();
    const { data, error } = await client
      .from("vehicles")
      .select("id, capacity_seats, current_passenger_count, current_conductor_id")
      .eq("id", input.vehicle_id)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Vehicle not found." };
    }
    const vehicle = data as Pick<
      VehicleRow,
      "id" | "capacity_seats" | "current_passenger_count" | "current_conductor_id"
    >;

    let conductor_name = "the conductor";
    if (vehicle.current_conductor_id) {
      const { data: userData } = await client
        .from("users")
        .select("name")
        .eq("id", vehicle.current_conductor_id)
        .maybeSingle();
      const name = (userData as { name?: string } | null)?.name;
      if (name) conductor_name = name;
    }

    return {
      ok: true,
      vehicle_id: vehicle.id,
      conductor_name,
      passenger_count: vehicle.current_passenger_count,
      capacity_seats: vehicle.capacity_seats,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load vehicle context.",
    };
  }
}
