import FleetShell from "@/components/fleet/FleetShell";
import { getAuditNarrative } from "@/lib/fleet/audit";
import { loadFleetState } from "@/lib/fleet/state";
import { resolvePersona } from "@/lib/personas";

/**
 * Fleet owner surface — Baba Tino.
 * Per-vehicle revenue ledger, Ghost Trip bilingual audit narrative
 * (Gemma via aiClient.narrate, cached in audit_narratives), ZIMRA liability.
 * Phase 3.
 */
export default async function FleetHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const personaSlug = (params.as ?? "baba_tino").toLowerCase();
  const persona = await resolvePersona(personaSlug, "fleet_owner");
  const state = await loadFleetState(persona.id);

  // Generate (or load from cache) one narrative per vehicle in parallel.
  // Cache hits are cheap; live Gemma calls take a few seconds and only happen
  // once per (vehicle, day).
  const narratives = await Promise.all(
    state.vehicles.map((v) => getAuditNarrative(v, state.for_date)),
  );

  return <FleetShell persona={persona} state={state} narratives={narratives} />;
}
