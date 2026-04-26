import { resolvePersona } from "@/lib/personas";

/**
 * Passenger surface — Tendai (default), Rudo (via ?as=rudo).
 * Phase 1: live kombi map + named stops.
 * Phase 2: trip planner, ticket purchase, wallet, transfer.
 */
export default async function PassengerHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; claim?: string }>;
}) {
  const params = await searchParams;
  const persona = await resolvePersona(params.as, "passenger");

  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-svika-teal-100 bg-svika-stone/90 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-svika-teal">Svika</h1>
          <span className="text-xs text-svika-mute">
            {persona.name} · ${persona.credit_balance_usd.toFixed(2)}
          </span>
        </div>
      </header>

      <section className="px-4 py-6">
        <p className="text-sm text-svika-mute">
          Passenger surface — placeholder. Phase 1 will render the live kombi map here.
        </p>
        {params.claim ? (
          <div className="mt-4 rounded-md border border-svika-rust bg-white p-3 text-sm">
            Incoming ticket transfer: <code>{params.claim}</code>. Claim flow ships in Phase 2.
          </div>
        ) : null}
      </section>
    </main>
  );
}
