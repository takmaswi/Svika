import { resolvePersona } from "@/lib/personas";

import WaClient from "./WaClient";

/**
 * Mocked WhatsApp companion. Three commands routed through real database
 * actions: balance, kombi near me, transfer NNN to +PHONE. Phase 4.
 */
export default async function WaHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const personaSlug = (params.as ?? "takunda").toLowerCase();
  const persona = await resolvePersona(personaSlug, "passenger");

  return (
    <main className="mx-auto h-dvh max-w-md bg-[#ece5dd]">
      <WaClient
        personaSlug={personaSlug}
        personaName={persona.name}
        initialBalanceUsd={Number(persona.credit_balance_usd ?? 0)}
      />
    </main>
  );
}
