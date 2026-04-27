import LandingHero from "@/components/LandingHero";
import PersonaPicker from "@/components/PersonaPicker";
import PassengerShell from "@/components/passenger/PassengerShell";
import { loadPassengerSurface } from "@/lib/passenger/loadPassengerSurface";

const LANDING_HERO_SRC = "/brand/landing-hero.png";

/**
 * Root dispatcher.
 *
 * - `/` (no query params) → brand landing with hero + persona picker.
 * - `/?as=<persona>` or `/?claim=<id>` → passenger surface (skips landing).
 *
 * Phase 3.7 visual rebuild — see CLAUDE.md "Surfaces".
 */
export default async function HomeRoute({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; claim?: string }>;
}) {
  const params = await searchParams;
  const hasPersona = typeof params.as === "string" && params.as.length > 0;
  const hasClaim = typeof params.claim === "string" && params.claim.length > 0;

  if (!hasPersona && !hasClaim) {
    return (
      <main className="flex min-h-dvh flex-col bg-svika-bg">
        <LandingHero imageSrc={LANDING_HERO_SRC} hasImage={true} />
        <PersonaPicker />
        <footer className="mt-auto px-5 pb-6 pt-2">
          <p className="text-[11px] text-svika-mute">
            Built for Harare. Designed to integrate with ZUPCO.
          </p>
        </footer>
      </main>
    );
  }

  const data = await loadPassengerSurface({
    asParam: params.as,
    claimParam: params.claim,
  });

  return (
    <PassengerShell
      persona={data.persona}
      personaSlug={data.personaSlug}
      network={data.network}
      mapboxToken={data.mapboxToken}
      initialTickets={data.initialTickets}
      initialJourney={data.initialJourney}
      pendingClaim={data.pendingClaim}
      liveStats={data.liveStats}
    />
  );
}
