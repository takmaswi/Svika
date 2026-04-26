/**
 * Snap a coarse [lat, lng] polyline to roads via the Mapbox Directions API.
 *
 * Used at seed time to turn the hand-traced route polylines in seed/network.json
 * into smooth, road-following geometry that Mapbox GL renders cleanly. On any
 * failure (no token, HTTP error, malformed response, too many waypoints, etc.)
 * the original raw polyline is returned silently — the seed loader proceeds
 * either way and the demo never breaks because the directions API is down.
 *
 * Notes
 *  - Mapbox Directions takes [lng, lat] in the URL path. Our seed file is
 *    [lat, lng] (mirroring docs/NETWORK-DATA.md), so we flip on the way in
 *    and flip back on the way out.
 *  - The API caps at 25 coordinate waypoints. Coarse polylines have <=10, so
 *    we stay well under. If a future route exceeds it, we fall back silently.
 *  - We request `geometries=geojson&overview=full` — `full` gives every shape
 *    point along the matched road, which is what densification means.
 */

export type LatLng = readonly [number, number];

const DIRECTIONS_HOST = "https://api.mapbox.com/directions/v5/mapbox/driving";
const MAX_WAYPOINTS = 25;
const REQUEST_TIMEOUT_MS = 10_000;

interface MapboxDirectionsResponse {
  routes?: Array<{
    geometry?: {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
  }>;
}

export interface DensifyResult {
  coordinates: LatLng[];
  source: "mapbox" | "raw";
}

export async function densifyPolyline(
  raw: ReadonlyArray<LatLng>,
  options: { token?: string; signal?: AbortSignal } = {},
): Promise<DensifyResult> {
  const token = options.token ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || raw.length < 2 || raw.length > MAX_WAYPOINTS) {
    return { coordinates: [...raw], source: "raw" };
  }

  const path = raw.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url =
    `${DIRECTIONS_HOST}/${path}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { coordinates: [...raw], source: "raw" };
    const body = (await res.json()) as MapboxDirectionsResponse;
    const coords = body.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return { coordinates: [...raw], source: "raw" };
    }
    const flipped: LatLng[] = coords.map(([lng, lat]) => [lat, lng] as const);
    return { coordinates: flipped, source: "mapbox" };
  } catch {
    return { coordinates: [...raw], source: "raw" };
  } finally {
    clearTimeout(timeout);
  }
}
