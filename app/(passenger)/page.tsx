import PassengerShell from "@/components/passenger/PassengerShell";
import { loadNetwork } from "@/lib/network/loadNetwork";
import { loadWallet } from "@/lib/passenger/wallet";
import { resolvePersona } from "@/lib/personas";

/**
 * Passenger surface — Tendai (default), Rudo (via ?as=rudo).
 * Phase 1: live kombi map + named stops, Realtime kombi positions.
 * Phase 2: trip planner, ticket purchase, wallet, transfer.
 */
export default async function PassengerHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; claim?: string }>;
}) {
  const params = await searchParams;
  const personaSlug = (params.as ?? "tendai").toLowerCase();
  const persona = await resolvePersona(personaSlug, "passenger");
  const [network, tickets] = await Promise.all([
    loadNetwork(),
    loadWallet(persona.id),
  ]);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  return (
    <PassengerShell
      persona={persona}
      personaSlug={personaSlug}
      network={network}
      mapboxToken={mapboxToken}
      initialTickets={tickets}
      pendingClaim={params.claim ?? null}
    />
  );
}
