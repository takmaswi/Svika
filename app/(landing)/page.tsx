import Link from "next/link";

import LandingHero from "@/components/LandingHero";
import PassengerShell from "@/components/passenger/PassengerShell";
import { loadPassengerSurface } from "@/lib/passenger/loadPassengerSurface";

const LANDING_HERO_SRC = "/brand/landing-hero.png";

/**
 * Root dispatcher.
 *
 * - `/` (no query params) → brand landing with hero + single "Continue as
 *   Takunda" CTA. The other personas exist only as direct-link URLs (Phase 3.8
 *   single-user narrative pivot — see CLAUDE.md "Locked decisions").
 * - `/?as=<persona>` or `/?claim=<id>` → passenger surface (skips landing).
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
      <main
        className="flex min-h-dvh flex-col"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <LandingHero imageSrc={LANDING_HERO_SRC} hasImage={true} />
        <section className="px-5 pb-6 pt-2" aria-label="Continue as Takunda">
          <Link
            href="/?as=takunda"
            prefetch={false}
            className="svika-animate-fade-up svika-headline flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-white shadow-sm transition-transform active:scale-[0.99]"
            style={{
              minHeight: "56px",
              animationDelay: "200ms",
              backgroundColor: "var(--color-action)",
              boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
            }}
            data-testid="landing-continue-takunda"
          >
            Continue as Takunda
            <span aria-hidden style={{ fontSize: "18px" }}>→</span>
          </Link>
          <p
            className="svika-meta mt-3"
            style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
          >
            Want to see the system from another seat? Visit{" "}
            <Link href="/hwindi" className="underline" prefetch={false}>
              /hwindi
            </Link>{" "}
            for the conductor screen or{" "}
            <Link href="/fleet" className="underline" prefetch={false}>
              /fleet
            </Link>{" "}
            for the dashboard.
          </p>
        </section>
        <footer className="mt-auto px-5 pb-6 pt-2">
          <p
            className="svika-meta"
            style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
          >
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
      initialKombis={data.initialKombis}
      pendingClaim={data.pendingClaim}
      liveStats={data.liveStats}
    />
  );
}
