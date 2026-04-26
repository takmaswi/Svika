import ConductorShell from "@/components/conductor/ConductorShell";
import { loadConductorState } from "@/lib/conductor/state";
import { resolvePersona } from "@/lib/personas";

/**
 * Conductor surface — Farai on `ZH 4821` by default.
 * Vehicle picker → small route map → 3-digit PIN keypad → +Cash · Parcel.
 * Phase 3.
 */
export default async function HwindiHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const personaSlug = (params.as ?? "farai").toLowerCase();
  const persona = await resolvePersona(personaSlug, "conductor");
  const state = await loadConductorState(persona.id);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  return (
    <ConductorShell
      persona={persona}
      personaSlug={personaSlug}
      state={state}
      mapboxToken={mapboxToken}
    />
  );
}
