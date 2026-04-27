import { loadActiveJourney } from "@/lib/passenger/journey";
import { loadLiveStats } from "@/lib/passenger/liveStats";
import { loadNetwork } from "@/lib/network/loadNetwork";
import { loadWallet } from "@/lib/passenger/wallet";
import { resolvePersona, type Persona } from "@/lib/personas";
import type { ActiveJourney } from "@/lib/passenger/journey-types";
import type { LiveStats } from "@/lib/passenger/liveStats";
import type { NetworkPayload } from "@/lib/network/loadNetwork";
import type { WalletTicket } from "@/lib/passenger/wallet";

export interface PassengerSurfaceData {
  persona: Persona;
  personaSlug: string;
  network: NetworkPayload;
  mapboxToken: string;
  initialTickets: WalletTicket[];
  initialJourney: ActiveJourney | null;
  liveStats: LiveStats;
  pendingClaim: string | null;
}

/**
 * Server-side composition for the passenger surface. Shared between the
 * landing dispatcher and any future deep-linked entry points so the data
 * graph stays in one place.
 */
export async function loadPassengerSurface(args: {
  asParam?: string;
  claimParam?: string;
}): Promise<PassengerSurfaceData> {
  const personaSlug = (args.asParam ?? "takunda").toLowerCase();
  const persona = await resolvePersona(personaSlug, "passenger");
  const [network, tickets, journey, liveStats] = await Promise.all([
    loadNetwork(),
    loadWallet(persona.id),
    loadActiveJourney(persona.id),
    loadLiveStats(),
  ]);
  return {
    persona,
    personaSlug,
    network,
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
    initialTickets: tickets,
    initialJourney: journey,
    liveStats,
    pendingClaim: args.claimParam ?? null,
  };
}
