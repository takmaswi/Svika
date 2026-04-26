/**
 * Kombi simulation runner — Phase 1 implementation target.
 *
 * Advances each vehicle along its polyline every two seconds and writes
 * the new position to `vehicles` and `kombi_pings`. The runner is started
 * manually for demo recording; see scripts/sim-runner.ts.
 *
 * Per CLAUDE.md → System Architecture: positions update via Supabase Realtime
 * channels. The map subscribes and updates Mapbox sources imperatively
 * (NOT via React state) to keep the user's phone responsive.
 */

export const SIM_TICK_MS = 2000;

export type SimulationStatus = "idle" | "running" | "stopped";

let status: SimulationStatus = "idle";

export function getStatus(): SimulationStatus {
  return status;
}

export async function startSim(): Promise<void> {
  status = "running";
  // Phase 1: load vehicles, advance positions every SIM_TICK_MS, write to DB.
  throw new Error("simRunner.startSim — implement in Phase 1");
}

export async function stopSim(): Promise<void> {
  status = "stopped";
}
