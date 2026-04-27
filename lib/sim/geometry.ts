/**
 * Pure geometry helpers for the simulation runner and seed loader.
 *
 * Coordinates throughout this module are [lat, lng] tuples, mirroring the
 * convention in seed/network.json. PostGIS WKT, by contrast, expects
 * "POINT(lng lat)" / "LINESTRING(lng lat, ...)" — conversion happens at the
 * database boundary in the loader and runner, not here.
 *
 * The advancement model is intentionally crude: each kombi walks along the
 * route polyline at a constant speed derived from typical_duration_minutes.
 * That is enough for the demo — passengers just need to see kombis sliding
 * along their routes; we are not modelling traffic or dwell.
 */

export type LatLng = readonly [number, number];

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function polylineLengthMeters(polyline: ReadonlyArray<LatLng>): number {
  let total = 0;
  for (let i = 1; i < polyline.length; i++) {
    total += haversineMeters(polyline[i - 1], polyline[i]);
  }
  return total;
}

/**
 * Return the point at `meters` distance along the polyline. Clamps to the
 * polyline endpoints if `meters` is out of range.
 */
export function pointAtDistance(
  polyline: ReadonlyArray<LatLng>,
  meters: number,
): LatLng {
  if (polyline.length === 0) throw new Error("pointAtDistance: empty polyline");
  if (polyline.length === 1) return polyline[0];
  if (meters <= 0) return polyline[0];

  let remaining = meters;
  for (let i = 1; i < polyline.length; i++) {
    const segMeters = haversineMeters(polyline[i - 1], polyline[i]);
    if (remaining <= segMeters) {
      const t = segMeters === 0 ? 0 : remaining / segMeters;
      const [lat1, lng1] = polyline[i - 1];
      const [lat2, lng2] = polyline[i];
      return [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t];
    }
    remaining -= segMeters;
  }
  return polyline[polyline.length - 1];
}

/**
 * Advance a kombi along its route by one tick. The kombi runs end-to-end in
 * `typical_duration_minutes` and then reverses direction (outbound → inbound)
 * so it shuttles back and forth indefinitely. `progressMeters` is measured
 * from the polyline start regardless of direction.
 */
export interface VehicleSimState {
  progressMeters: number;
  direction: "outbound" | "inbound";
}

export interface AdvanceResult {
  position: LatLng;
  state: VehicleSimState;
}

export function advanceVehicle(
  polyline: ReadonlyArray<LatLng>,
  totalLengthMeters: number,
  typicalDurationMinutes: number,
  state: VehicleSimState,
  tickMs: number,
): AdvanceResult {
  const speedMps = totalLengthMeters / Math.max(typicalDurationMinutes * 60, 1);
  const stepMeters = speedMps * (tickMs / 1000);
  const dir = state.direction === "outbound" ? 1 : -1;
  let next = state.progressMeters + dir * stepMeters;
  let nextDirection = state.direction;

  if (next >= totalLengthMeters) {
    next = totalLengthMeters - (next - totalLengthMeters);
    nextDirection = "inbound";
  } else if (next <= 0) {
    next = -next;
    nextDirection = "outbound";
  }

  next = Math.max(0, Math.min(totalLengthMeters, next));
  const position = pointAtDistance(polyline, next);
  return {
    position,
    state: { progressMeters: next, direction: nextDirection },
  };
}

/**
 * Compass bearing (degrees clockwise from north) from `from` to `to`.
 * Used by the simulation to drive icon-rotate on the passenger map so the
 * minibus SVG faces direction-of-travel.
 */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Sample a point ~`lookAheadMeters` ahead along the polyline relative to the
 * current progress and direction. The bearing from the current position to
 * this look-ahead point gives a stable direction-of-travel even on the first
 * tick (no prev-position required).
 */
export function lookAheadPoint(
  polyline: ReadonlyArray<LatLng>,
  totalLengthMeters: number,
  progressMeters: number,
  direction: "outbound" | "inbound",
  lookAheadMeters = 30,
): LatLng {
  const target =
    direction === "outbound"
      ? Math.min(totalLengthMeters, progressMeters + lookAheadMeters)
      : Math.max(0, progressMeters - lookAheadMeters);
  return pointAtDistance(polyline, target);
}

/** PostGIS WKT for a Point — the loader and runner both call this. */
export function pointWkt(point: LatLng): string {
  const [lat, lng] = point;
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/** PostGIS WKT for a LineString. */
export function lineStringWkt(polyline: ReadonlyArray<LatLng>): string {
  const body = polyline.map(([lat, lng]) => `${lng} ${lat}`).join(",");
  return `SRID=4326;LINESTRING(${body})`;
}
