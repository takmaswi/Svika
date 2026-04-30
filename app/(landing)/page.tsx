import LandingHero from "@/components/LandingHero";
import PassengerShell from "@/components/passenger/PassengerShell";
import { loadPassengerSurface } from "@/lib/passenger/loadPassengerSurface";

/**
 * Root dispatcher.
 *
 * - `/` (no query params) → V1 brand landing: v2 logo, wordmark, single
 *   "Find kombis near me." CTA, suburb-picker fallback. Geolocation success
 *   redirects to `/?as=takunda&lat=...&lng=...`.
 * - `/?as=<persona>` (with optional lat/lng) or `/?claim=<id>` → passenger
 *   surface, kombi feed filtered to a 5 km bbox when location is supplied.
 */
export default async function HomeRoute({
  searchParams,
}: {
  searchParams: Promise<{
    as?: string;
    claim?: string;
    lat?: string;
    lng?: string;
  }>;
}) {
  const params = await searchParams;
  const hasPersona = typeof params.as === "string" && params.as.length > 0;
  const hasClaim = typeof params.claim === "string" && params.claim.length > 0;

  if (!hasPersona && !hasClaim) {
    return <LandingHero />;
  }

  const lat = params.lat ? Number.parseFloat(params.lat) : Number.NaN;
  const lng = params.lng ? Number.parseFloat(params.lng) : Number.NaN;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  const data = await loadPassengerSurface({
    asParam: params.as,
    claimParam: params.claim,
    location: hasLocation ? { lat, lng } : null,
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
      location={hasLocation ? { lat, lng } : null}
    />
  );
}
