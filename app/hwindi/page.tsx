import { resolvePersona } from "@/lib/personas";

/**
 * Conductor surface — Farai on `ZH 4821`.
 * Big buttons: Code · Cash · Parcel. Small route map at the top.
 * Phase 3 work.
 */
export default async function HwindiHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const persona = await resolvePersona(params.as, "conductor");

  return (
    <main className="min-h-dvh bg-svika-stone-dark">
      <header className="bg-svika-teal px-4 py-3 text-svika-stone">
        <h1 className="text-lg font-semibold">Hwindi · {persona.name}</h1>
        <p className="text-xs opacity-80">Conductor screen — Phase 3 build target.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <button
          type="button"
          disabled
          className="touch-target rounded-lg bg-svika-teal px-6 py-8 text-2xl font-semibold text-svika-stone disabled:opacity-50"
        >
          Code
        </button>
        <button
          type="button"
          disabled
          className="touch-target rounded-lg bg-svika-rust px-6 py-8 text-2xl font-semibold text-white disabled:opacity-50"
        >
          + Cash
        </button>
        <button
          type="button"
          disabled
          className="touch-target rounded-lg bg-svika-teal-600 px-6 py-8 text-2xl font-semibold text-svika-stone disabled:opacity-50"
        >
          Parcel
        </button>
      </div>
    </main>
  );
}
