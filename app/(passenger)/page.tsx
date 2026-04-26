import PassengerMap from "@/components/PassengerMap";
import { loadNetwork } from "@/lib/network/loadNetwork";
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
  const persona = await resolvePersona(params.as, "passenger");
  const network = await loadNetwork();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="z-10 border-b border-svika-teal-100 bg-svika-stone/90 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-svika-teal">Svika</h1>
          <span className="text-xs text-svika-mute">
            {persona.name} · ${persona.credit_balance_usd.toFixed(2)}
          </span>
        </div>
      </header>

      {params.claim ? (
        <div className="border-b border-svika-rust bg-white px-4 py-2 text-sm">
          Incoming ticket transfer: <code>{params.claim}</code>. Claim flow ships in Phase 2.
        </div>
      ) : null}

      <section className="relative flex-1">
        {mapboxToken ? (
          <PassengerMap network={network} mapboxToken={mapboxToken} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-svika-mute">
            NEXT_PUBLIC_MAPBOX_TOKEN missing — set it in .env.local to render the map.
          </div>
        )}
      </section>
    </main>
  );
}
