"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapMouseEvent,
} from "mapbox-gl";

import "mapbox-gl/dist/mapbox-gl.css";

import { createClient } from "@/lib/supabase/client";
import { SIM_CHANNEL, SIM_EVENT, type KombiTickPayload } from "@/lib/sim/simRunner";
import type { NetworkPayload, RouteForMap, StopForMap } from "@/lib/network/loadNetwork";
import type { ActiveJourney, JourneyStage } from "@/lib/passenger/journey-types";

const ROUTES_SOURCE = "svika-routes";
const ROUTES_LAYER_BASE = "svika-routes-base";
const ROUTES_LAYER_HIGHLIGHT_HALO = "svika-routes-highlight-halo";
const ROUTES_LAYER_HIGHLIGHT = "svika-routes-highlight";

const STOPS_SOURCE = "svika-stops";
const STOPS_LAYER_HALO = "svika-stops-halo";
const STOPS_LAYER_DOT = "svika-stops-dot";
const STOPS_LAYER_LABEL = "svika-stops-label";

const KOMBIS_SOURCE = "svika-kombis";
const KOMBIS_LAYER = "svika-kombis-dot";
const KOMBIS_LAYER_HALO = "svika-kombis-halo";
const KOMBIS_LAYER_SHADOW = "svika-kombis-shadow";

const WALKING_SOURCE = "svika-walking";
const WALKING_LAYER = "svika-walking-line";

const TEAL = "#0a4b5c";
const TEAL_700 = "#144f5e";
const RUST = "#d9622a";
const STONE = "#f2ede6";

const KOMBI_ICON_ID = "kombi-icon";
const KOMBI_ICON_W = 96;
const KOMBI_ICON_H = 144;

const KOMBI_SHADOW_ID = "kombi-shadow-icon";
const KOMBI_SHADOW_W = 60;
const KOMBI_SHADOW_H = 24;

/**
 * Inline rasterisation of the Hiace SVG so Mapbox can pick it up via
 * `addImage`. The on-disk file at `public/brand/kombi.svg` is the source
 * of truth for the artwork; this constant mirrors the same shapes
 * (cream body, teal stripe + side stripe, rust front bumper, tinted
 * front and rear windows, four wheels) — kept inline because Mapbox +
 * headless chromium has shown intermittent failure modes when canvas-
 * rasterising a fetched SVG file, and the data URI path has been
 * stable across the project's earlier rehearsals.
 */
const KOMBI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${KOMBI_ICON_W}" height="${KOMBI_ICON_H}" viewBox="0 0 96 144">
  <defs>
    <linearGradient id="bodyHi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="0.16" stop-color="#FFFFFF" stop-opacity="0.18"/>
      <stop offset="0.32" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bodyLo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.62" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <ellipse cx="14" cy="38" rx="7" ry="11" fill="#2a2a2a"/>
  <ellipse cx="82" cy="38" rx="7" ry="11" fill="#2a2a2a"/>
  <ellipse cx="14" cy="106" rx="7" ry="11" fill="#2a2a2a"/>
  <ellipse cx="82" cy="106" rx="7" ry="11" fill="#2a2a2a"/>
  <rect x="14" y="10" width="68" height="124" rx="20" ry="22"
        fill="#F0EDE3" stroke="#0d0d0d" stroke-width="1.4"/>
  <rect x="15" y="11" width="66" height="124" rx="19" ry="21" fill="url(#bodyHi)"/>
  <rect x="15" y="11" width="66" height="124" rx="19" ry="21" fill="url(#bodyLo)"/>
  <rect x="22" y="12" width="52" height="6" rx="2.5" fill="#D9622A"/>
  <rect x="22" y="22" width="52" height="22" rx="4" fill="#0F4C5C" fill-opacity="0.82"
        stroke="#0a3a48" stroke-width="0.8"/>
  <rect x="24" y="24" width="48" height="6" rx="2" fill="#FFFFFF" fill-opacity="0.18"/>
  <rect x="14" y="69" width="68" height="6" fill="#0F4C5C"/>
  <rect x="22" y="98" width="52" height="18" rx="4" fill="#0F4C5C" fill-opacity="0.82"
        stroke="#0a3a48" stroke-width="0.8"/>
  <rect x="22" y="124" width="52" height="4" rx="1.5" fill="#9b3c0d" fill-opacity="0.55"/>
  <line x1="14" y1="84" x2="82" y2="84" stroke="#0d0d0d" stroke-opacity="0.18" stroke-width="0.7"/>
  <line x1="48" y1="44" x2="48" y2="69" stroke="#0d0d0d" stroke-opacity="0.18" stroke-width="0.7"/>
</svg>
`.trim();

const KOMBI_SHADOW_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${KOMBI_SHADOW_W}" height="${KOMBI_SHADOW_H}" viewBox="0 0 60 24">
  <defs>
    <radialGradient id="shadowGrad" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.32"/>
      <stop offset="0.55" stop-color="#000000" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="30" cy="12" rx="28" ry="10" fill="url(#shadowGrad)"/>
</svg>
`.trim();

async function registerSvgImage(
  map: mapboxgl.Map,
  id: string,
  svg: string,
  width: number,
  height: number,
): Promise<void> {
  if (map.hasImage(id)) return;
  await new Promise<void>((resolve) => {
    const img = new Image(width, height);
    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height);
        if (!map.hasImage(id)) {
          map.addImage(id, data, { pixelRatio: 2 });
        }
      } catch {
        // best-effort; symbol layer falls back to no-icon if missing
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Rasterises the kombi SVG and the soft shadow ellipse and hands them
 * to Mapbox. Both run in parallel; either failure leaves the layer
 * with a missing icon, which Mapbox draws as nothing — the marker just
 * disappears, never breaks the rest of the map.
 */
async function registerKombiIcons(map: mapboxgl.Map): Promise<void> {
  await Promise.all([
    registerSvgImage(map, KOMBI_ICON_ID, KOMBI_SVG, KOMBI_ICON_W, KOMBI_ICON_H),
    registerSvgImage(
      map,
      KOMBI_SHADOW_ID,
      KOMBI_SHADOW_SVG,
      KOMBI_SHADOW_W,
      KOMBI_SHADOW_H,
    ),
  ]);
}

interface PassengerMapProps {
  network: NetworkPayload;
  mapboxToken: string;
  /** Active journey for the current persona, if any. Drives leg highlighting. */
  journey: ActiveJourney | null;
  /** Latest stage from the Journey sheet. Identifies the assigned kombi. */
  stage: JourneyStage | null;
  /**
   * Last-known kombi positions read from the database at page load. Seeds the
   * GeoJSON source so all 8 kombis are visible immediately whether or not a
   * sim is broadcasting; live broadcasts continue to override.
   */
  initialKombis?: KombiTickPayload[];
}

interface SelectedRouteInfo {
  route: RouteForMap;
  stops: StopForMap[];
}

function harareBounds(network: NetworkPayload): LngLatBoundsLike {
  let minLng = 180;
  let maxLng = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const r of network.routes) {
    for (const [lng, lat] of r.geometry.coordinates) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [
    [minLng - 0.005, minLat - 0.005],
    [maxLng + 0.005, maxLat + 0.005],
  ];
}

function routesGeoJSON(routes: RouteForMap[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: {
        id: r.id,
        name: r.name,
        default_fare_usd: r.default_fare_usd,
      },
      geometry: r.geometry,
    })),
  };
}

function activeStopIdsForJourney(journey: ActiveJourney | null): Set<string> {
  if (!journey) return new Set();
  const out = new Set<string>();
  for (const leg of journey.legs) {
    if (leg.kind === "kombi") {
      out.add(leg.board_stop.id);
      out.add(leg.alight_stop.id);
    }
  }
  out.add(journey.origin.id);
  out.add(journey.destination.id);
  return out;
}

function stopsGeoJSON(
  stops: StopForMap[],
  activeStopIds: Set<string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stops.map((s) => ({
      type: "Feature",
      id: s.id,
      properties: {
        id: s.id,
        name: s.name,
        is_rank: s.is_rank,
        is_terminal: s.is_terminal,
        is_major: s.is_rank || s.is_terminal,
        is_active: activeStopIds.has(s.id),
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  };
}

function kombisGeoJSON(
  positions: Map<string, KombiTickPayload>,
  assignedVehicleId: string | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from(positions.values()).map((p) => ({
      type: "Feature",
      id: p.vehicle_id,
      properties: {
        vehicle_id: p.vehicle_id,
        route_id: p.route_id,
        direction: p.direction,
        bearing: typeof p.bearing === "number" ? p.bearing : 0,
        is_assigned: assignedVehicleId === p.vehicle_id,
      },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

/**
 * Per-vehicle interpolation buffer. Each broadcast tick (every 2 s) shifts
 * the previous "next" sample into "prev" and stores the new sample in
 * "next"; the RAF loop eases between them so on-screen motion runs at the
 * display refresh rate instead of jumping in 2 s steps.
 */
interface InterpEntry {
  prev: [number, number];
  next: [number, number];
  prevBearing: number;
  nextBearing: number;
  broadcastAt: number;
}

const TICK_PERIOD_MS = 1500;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Shortest-arc bearing interpolation (handles 359 → 1 wrap). */
function lerpBearing(prev: number, next: number, t: number): number {
  let delta = next - prev;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  let out = prev + delta * t;
  if (out < 0) out += 360;
  else if (out >= 360) out -= 360;
  return out;
}

function walkingGeoJSON(journey: ActiveJourney | null): GeoJSON.FeatureCollection {
  if (!journey) return { type: "FeatureCollection", features: [] };
  const features: GeoJSON.Feature[] = [];
  for (const leg of journey.legs) {
    if (leg.kind !== "walk") continue;
    if (leg.walking_polyline.length < 2) continue;
    features.push({
      type: "Feature",
      properties: { transfer_id: leg.transfer_id },
      geometry: {
        type: "LineString",
        coordinates: leg.walking_polyline,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export default function PassengerMap({
  network,
  mapboxToken,
  journey,
  stage,
  initialKombis,
}: PassengerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const positionsRef = useRef<Map<string, KombiTickPayload>>(new Map());
  const initialKombisRef = useRef<KombiTickPayload[]>(initialKombis ?? []);
  /** Lerp buffer fed by Realtime broadcasts, drained by the RAF loop. */
  const interpRef = useRef<Map<string, InterpEntry>>(new Map());
  const assignedVehicleIdRef = useRef<string | null>(null);
  const journeyRef = useRef<ActiveJourney | null>(journey);
  const stageRef = useRef<JourneyStage | null>(stage);
  const networkRef = useRef<NetworkPayload>(network);
  const tokenRef = useRef<string>(mapboxToken);
  const haloPhaseRef = useRef<number>(0);
  const [selected, setSelected] = useState<SelectedRouteInfo | null>(null);

  // Keep mutable refs synced. The build effect runs once and reads these so
  // a router.refresh() that returns a new (but content-identical) `network`
  // object reference doesn't tear down the map mid-flight.
  useEffect(() => {
    journeyRef.current = journey;
  }, [journey]);
  useEffect(() => {
    networkRef.current = network;
  }, [network]);
  useEffect(() => {
    tokenRef.current = mapboxToken;
  }, [mapboxToken]);
  useEffect(() => {
    stageRef.current = stage;
    assignedVehicleIdRef.current = stage?.assigned_vehicle_id ?? null;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    repaintAssignedHighlight(map, stage?.assigned_vehicle_id ?? null);
    repaintActiveLeg(map, journeyRef.current, stage);
  }, [stage]);

  // Refresh the walking source and stop emphasis whenever journey/stage
  // change. The kombi source itself is owned by the RAF interpolation loop —
  // overwriting it here would replace the eased output with the un-lerped
  // positions, producing a one-frame jump on every stage transition.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const walkingSrc = map.getSource(WALKING_SOURCE) as GeoJSONSource | undefined;
    if (walkingSrc) walkingSrc.setData(walkingGeoJSON(journey));
    const stopsSrc = map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;
    if (stopsSrc) {
      stopsSrc.setData(
        stopsGeoJSON(networkRef.current.stops, activeStopIdsForJourney(journey)),
      );
    }
    repaintActiveLeg(map, journey, stage);
  }, [journey, stage]);

  // Zoom-to-active-trip — fires once per trip lifecycle, not on every kombi
  // tick. Bounds wrap [boarding stop, all leg endpoints, walking transfer
  // points, current vehicle positions, destination] with 60px padding and an
  // 800ms eased animation. On arrival (or trip end), gracefully eases back
  // to the full Harare network bounds.
  const lastFittedTripIdRef = useRef<string | null>(null);
  const lastArrivedFitRef = useRef<string | null>(null);
  useEffect(() => {
    const map: mapboxgl.Map | null = mapRef.current;
    if (!map) return;
    // Re-binding under a non-null type so the inner closures don't lose the
    // narrowing from the early-return null check above.
    const m: mapboxgl.Map = map;

    const tripId = journey?.trip_id ?? null;
    const arrivedTripId = stage?.kind === "arrived" && tripId ? tripId : null;
    const tripChanged = tripId !== lastFittedTripIdRef.current;
    const justArrived =
      arrivedTripId !== null && arrivedTripId !== lastArrivedFitRef.current;

    function applyTripBounds(): void {
      if (!journey) return;
      const points: Array<[number, number]> = [];
      const push = (lng: number, lat: number) => points.push([lng, lat]);
      push(journey.origin.lng, journey.origin.lat);
      push(journey.destination.lng, journey.destination.lat);
      for (const leg of journey.legs) {
        if (leg.kind === "kombi") {
          push(leg.board_stop.lng, leg.board_stop.lat);
          push(leg.alight_stop.lng, leg.alight_stop.lat);
        } else {
          push(leg.from_stop.lng, leg.from_stop.lat);
          push(leg.to_stop.lng, leg.to_stop.lat);
          for (const [lng, lat] of leg.walking_polyline) push(lng, lat);
        }
      }
      // Include any vehicle currently broadcasting on a leg's route — that's
      // the kombi the rider is heading to or already on.
      const legRouteIds = new Set(
        journey.legs.flatMap((l) => (l.kind === "kombi" ? [l.route_id] : [])),
      );
      for (const v of positionsRef.current.values()) {
        if (legRouteIds.has(v.route_id)) push(v.lng, v.lat);
      }
      if (points.length === 0) return;
      let minLng = points[0][0];
      let maxLng = points[0][0];
      let minLat = points[0][1];
      let maxLat = points[0][1];
      for (const [lng, lat] of points) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      m.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        // maxZoom 15.5 (up from 14.5) so an active trip actually frames the
        // corridor on a phone instead of showing most of Harare. Mobile-
        // aware padding: top 60 leaves room for the header chip, bottom
        // 280 keeps the trip area clear of the JourneySheet at full snap,
        // sides 40 keep the corridor centred.
        {
          padding: { top: 60, right: 40, bottom: 280, left: 40 },
          maxZoom: 15.5,
          duration: 800,
          essential: true,
        },
      );
    }

    /**
     * Walking-transfer override: when the passenger is between two stops on
     * foot, pull the camera tight to just the walk corridor at street level
     * so the dashed walking line and both stops are clearly visible.
     */
    function applyWalkingTransferBounds(): boolean {
      if (!journey) return false;
      const walkLeg = journey.legs.find((l) => l.kind === "walk");
      if (!walkLeg || walkLeg.kind !== "walk") return false;
      const minLng = Math.min(walkLeg.from_stop.lng, walkLeg.to_stop.lng);
      const maxLng = Math.max(walkLeg.from_stop.lng, walkLeg.to_stop.lng);
      const minLat = Math.min(walkLeg.from_stop.lat, walkLeg.to_stop.lat);
      const maxLat = Math.max(walkLeg.from_stop.lat, walkLeg.to_stop.lat);
      m.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: { top: 80, right: 60, bottom: 320, left: 60 },
          maxZoom: 17,
          duration: 600,
          essential: true,
        },
      );
      return true;
    }

    function applyArrivedBounds(): void {
      const [sw, ne] = harareBounds(networkRef.current) as [
        [number, number],
        [number, number],
      ];
      m.fitBounds([sw, ne], {
        padding: 40,
        maxZoom: 12,
        duration: 600,
        essential: true,
      });
    }

    function applyEmptyStateBounds(): void {
      const [sw, ne] = harareBounds(networkRef.current) as [
        [number, number],
        [number, number],
      ];
      // maxZoom 12.5 keeps Harare's structure visible (all four routes
      // legible) without the prior overview-of-a-continent feel. Duration 0
      // because this fires on initial idle landing, not a transition.
      m.fitBounds([sw, ne], {
        padding: 60,
        maxZoom: 12.5,
        duration: 0,
        essential: true,
      });
    }

    function run(): void {
      // Walking-transfer takes priority — when the passenger steps off the
      // first kombi for the 6-min walk to the next stop, slam the camera
      // tight on the walk corridor regardless of trip-change state.
      if (stage?.kind === "walking-transfer" && journey) {
        if (applyWalkingTransferBounds()) return;
      }
      if (justArrived) {
        lastArrivedFitRef.current = arrivedTripId;
        applyArrivedBounds();
        return;
      }
      if (!tripChanged) return;
      lastFittedTripIdRef.current = tripId;
      if (tripId && journey) {
        applyTripBounds();
      } else {
        lastArrivedFitRef.current = null;
        applyEmptyStateBounds();
      }
    }

    if (m.isStyleLoaded()) {
      run();
      return;
    }
    const onLoad = () => run();
    m.once("load", onLoad);
    return () => {
      m.off("load", onLoad);
    };
  }, [journey, stage?.kind]);

  // Build the map exactly once. Subsequent network changes would require a
  // full restyle; for the demo the network is frozen after Phase 1. Reading
  // network/token from refs (synced above) means a server-side
  // `router.refresh()` that returns a content-identical but newly-allocated
  // `network` prop doesn't trigger an effect re-run that would tear the map
  // down mid-load — that was the Phase 3.5 stage-2/5 blank-map regression.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const network = networkRef.current;
    const mapboxToken = tokenRef.current;

    // Seed last-known positions before the source is created so all kombis
    // render immediately on first paint, even when no broadcast is arriving.
    for (const k of initialKombisRef.current) {
      if (!positionsRef.current.has(k.vehicle_id)) {
        positionsRef.current.set(k.vehicle_id, k);
      }
    }

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds: harareBounds(network),
      fitBoundsOptions: { padding: 80, duration: 0 },
      attributionControl: false,
    });
    mapRef.current = map;
    // Expose for audit / smoke probes only. Read-only handle; no behaviour
    // depends on this attachment.
    (window as unknown as { __svikaMap?: mapboxgl.Map }).__svikaMap = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      map.addSource(ROUTES_SOURCE, { type: "geojson", data: routesGeoJSON(network.routes) });
      map.addLayer({
        id: ROUTES_LAYER_BASE,
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": TEAL,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4, 16, 6],
          "line-opacity": 0.55,
        },
      });
      // White halo underneath the active leg so basemap labels and street
      // names stay legible when the rust line crosses dense type. Slightly
      // wider than the rust line (case effect).
      map.addLayer({
        id: ROUTES_LAYER_HIGHLIGHT_HALO,
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        filter: ["in", ["get", "id"], ["literal", []]],
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 14, 11, 16, 14],
          "line-opacity": 0.78,
        },
      });
      map.addLayer({
        id: ROUTES_LAYER_HIGHLIGHT,
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        filter: ["in", ["get", "id"], ["literal", []]],
        paint: {
          // Phase D: active route polyline switches to teal-700 with the
          // existing white halo. Rust on the map is now confined to the
          // moving kombi marker and the walking-transfer dashed line.
          "line-color": TEAL_700,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 16, 10],
          "line-opacity": 0.85,
        },
      });

      map.addSource(WALKING_SOURCE, { type: "geojson", data: walkingGeoJSON(journeyRef.current) });
      map.addLayer({
        id: WALKING_LAYER,
        type: "line",
        source: WALKING_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": RUST,
          "line-width": 3,
          "line-opacity": 0.85,
          "line-dasharray": [1.5, 1.5],
        },
      });

      map.addSource(STOPS_SOURCE, {
        type: "geojson",
        data: stopsGeoJSON(network.stops, activeStopIdsForJourney(journeyRef.current)),
      });
      map.addLayer({
        id: STOPS_LAYER_HALO,
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          // Active boarding/alighting stops in the current trip get a larger
          // halo so the eye locks onto where the passenger is heading.
          "circle-radius": [
            "case",
            ["get", "is_active"],
            ["case", ["get", "is_rank"], 13, ["get", "is_terminal"], 11, 9],
            ["case", ["get", "is_rank"], 10, ["get", "is_terminal"], 8, 6],
          ],
          "circle-color": STONE,
          // Phase D: active stops adopt the route polyline's teal-700 to
          // keep map rust reserved for the moving kombi marker.
          "circle-stroke-color": ["case", ["get", "is_active"], TEAL_700, TEAL],
          "circle-stroke-width": ["case", ["get", "is_active"], 2.5, 2],
          "circle-opacity": 0.95,
        },
      });
      map.addLayer({
        id: STOPS_LAYER_DOT,
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          "circle-radius": [
            "case",
            ["get", "is_active"],
            ["case", ["get", "is_rank"], 5, 4],
            ["case", ["get", "is_rank"], 4, 3],
          ],
          "circle-color": ["case", ["get", "is_active"], TEAL_700, TEAL],
        },
      });
      map.addLayer({
        id: STOPS_LAYER_LABEL,
        type: "symbol",
        source: STOPS_SOURCE,
        // Major stops (terminals + ranks) appear from zoom 11; mid-route
        // stops only at zoom ≥ 13 to keep the basemap legible.
        minzoom: 11,
        filter: [
          "any",
          ["get", "is_major"],
          [">=", ["zoom"], 13],
        ],
        layout: {
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11, 10,
            14, 11.5,
            16, 13,
          ],
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
          "text-padding": 4,
        },
        paint: {
          "text-color": ["case", ["get", "is_active"], TEAL_700, TEAL],
          "text-halo-color": STONE,
          "text-halo-width": 1.5,
          "text-halo-blur": 0.5,
        },
      });

      map.addSource(KOMBIS_SOURCE, {
        type: "geojson",
        data: kombisGeoJSON(positionsRef.current, assignedVehicleIdRef.current),
      });
      map.addLayer({
        id: KOMBIS_LAYER_HALO,
        type: "circle",
        source: KOMBIS_SOURCE,
        filter: ["==", ["get", "is_assigned"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 14, 14, 22, 16, 28],
          "circle-color": RUST,
          "circle-opacity": 0.25,
          "circle-blur": 0.4,
        },
      });
      // Kombi minibus icon, rotated to direction-of-travel via the bearing
      // on each tick payload. Active (assigned) kombi renders larger and
      // fully opaque; pass-through kombis render slightly smaller and at
      // 0.6 alpha so the eye tracks the trip-relevant vehicle first.
      // The shadow ellipse renders BELOW the body as a separate symbol
      // layer so it lays flat on the road regardless of icon rotation.
      void registerKombiIcons(map).then(() => {
        if (!map.getLayer(KOMBIS_LAYER_SHADOW)) {
          map.addLayer({
            id: KOMBIS_LAYER_SHADOW,
            type: "symbol",
            source: KOMBIS_SOURCE,
            layout: {
              "icon-image": KOMBI_SHADOW_ID,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
              "icon-pitch-alignment": "map",
              "icon-rotation-alignment": "map",
              "icon-offset": [0, 22],
              // Zoom-interpolated so the shadow scales with the body. At the
              // network-overview zoom (~11) the shadow shrinks to a small
              // soft dot; at street level (~16-17) it widens to sit under
              // the full-size icon.
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 0.18,
                12, 0.28,
                14, 0.45,
                15.5, 0.65,
                17, 0.95,
              ],
            },
            paint: {
              "icon-opacity": 0.85,
            },
          });
        }
        if (!map.getLayer(KOMBIS_LAYER)) {
          map.addLayer({
            id: KOMBIS_LAYER,
            type: "symbol",
            source: KOMBIS_SOURCE,
            layout: {
              "icon-image": KOMBI_ICON_ID,
              "icon-rotate": ["get", "bearing"],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
              // Zoom-interpolated icon-size with a 1.3× multiplier when the
              // vehicle is the one assigned to the active trip. Before Z.2
              // the icons rendered at a flat 1.2-1.5 across all zooms,
              // which on a 3× DPR phone meant ~432-540 device pixels —
              // the kombis covered ~200m of road and looked like trucks
              // parked on buildings. The interpolated values keep them
              // readable as vehicles at street-level zoom and as small
              // dots at the network-overview zoom.
              //
              // Mapbox rejects ["zoom"] inside a non-top-level expression
              // (e.g. ["*", ["interpolate", ["zoom"], ...], multiplier]),
              // so the assigned-multiplier is folded into each stop via
              // a per-feature `case`: assigned values are simply 1.3× the
              // base value at the same stop.
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, ["case", ["get", "is_assigned"], 0.234, 0.18],
                12, ["case", ["get", "is_assigned"], 0.364, 0.28],
                14, ["case", ["get", "is_assigned"], 0.585, 0.45],
                15.5, ["case", ["get", "is_assigned"], 0.845, 0.65],
                17, ["case", ["get", "is_assigned"], 1.235, 0.95],
              ],
            },
            paint: {
              "icon-opacity": [
                "case",
                ["==", ["get", "is_assigned"], true],
                1.0,
                0.6,
              ],
            },
          });
        }
      });

      // Click a route line to highlight it and reveal its named stops.
      map.on("click", ROUTES_LAYER_BASE, handleRouteClick);
      map.on("mouseenter", ROUTES_LAYER_BASE, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ROUTES_LAYER_BASE, () => {
        map.getCanvas().style.cursor = "";
      });
      // Click empty space clears the selection (only when no journey is active).
      map.on("click", (e: MapMouseEvent) => {
        if (journeyRef.current) return;
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [ROUTES_LAYER_BASE, STOPS_LAYER_HALO, STOPS_LAYER_DOT, KOMBIS_LAYER],
        });
        if (hits.length === 0) {
          setSelected(null);
          map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["in", ["get", "id"], ["literal", []]]);
          if (map.getLayer(ROUTES_LAYER_HIGHLIGHT_HALO)) {
            map.setFilter(ROUTES_LAYER_HIGHLIGHT_HALO, [
              "in",
              ["get", "id"],
              ["literal", []],
            ]);
          }
        }
      });

      // Now the layers exist — apply current journey/stage paint via refs so
      // the build effect can have stable deps (re-running it would tear the
      // map down mid-load and leave the canvas blank).
      repaintActiveLeg(map, journeyRef.current, stageRef.current);
      repaintAssignedHighlight(map, assignedVehicleIdRef.current);
    });

    function handleRouteClick(e: mapboxgl.MapLayerMouseEvent) {
      // Suppress route inspection when there's an active journey — the active
      // leg is already telling the right story.
      if (journeyRef.current) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id as string | undefined;
      if (!id) return;
      const net = networkRef.current;
      const route = net.routes.find((r) => r.id === id);
      if (!route) return;
      const stops = net.routeStops
        .filter((rs) => rs.route_id === id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((rs) => net.stops.find((s) => s.id === rs.stop_id))
        .filter((s): s is StopForMap => Boolean(s));
      setSelected({ route, stops });
      map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["in", ["get", "id"], ["literal", [id]]]);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      const w = window as unknown as { __svikaMap?: mapboxgl.Map | null };
      if (w.__svikaMap === map) w.__svikaMap = null;
    };
    // Build the map exactly once per component mount. `network`, `mapboxToken`,
    // `stage`, and `journey` are all read via refs so server-driven prop
    // refreshes don't tear the map down mid-load.
  }, []);

  // Pulsing halo on the assigned vehicle. ~2.2s breathing cycle, lightweight
  // CPU cost (one paint property update per ~80ms).
  useEffect(() => {
    let raf: number | null = null;
    let last = performance.now();
    function frame(t: number) {
      if (t - last < 80) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = t;
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!map.getLayer(KOMBIS_LAYER_HALO)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      haloPhaseRef.current = (haloPhaseRef.current + 0.04) % (Math.PI * 2);
      const breathe = 0.5 + 0.5 * Math.sin(haloPhaseRef.current);
      // 0.18 → 0.45 alpha, 18px → 28px radius (mid-zoom)
      try {
        map.setPaintProperty(
          KOMBIS_LAYER_HALO,
          "circle-opacity",
          0.2 + 0.25 * breathe,
        );
        map.setPaintProperty(KOMBIS_LAYER_HALO, "circle-radius", [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          12 + 4 * breathe,
          14,
          18 + 6 * breathe,
          16,
          22 + 8 * breathe,
        ]);
      } catch {
        // map closed mid-frame
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  // Subscribe to the sim runner's broadcast channel. The handler does NOT
  // write the GeoJSON source itself — it only pushes the new sample into the
  // per-vehicle interpolation buffer. The RAF loop below drains the buffer
  // every animation frame, easing each kombi between its previous and next
  // sample so the eye sees ~60 fps motion instead of a 2 s teleport.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(SIM_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on("broadcast", { event: SIM_EVENT }, (msg) => {
      const ticks = (msg.payload as { ticks?: KombiTickPayload[] } | undefined)?.ticks;
      if (!Array.isArray(ticks)) return;
      const at = performance.now();
      for (const t of ticks) {
        const existing = interpRef.current.get(t.vehicle_id);
        const prev = existing?.next ?? [t.lng, t.lat];
        const prevBearing =
          existing?.nextBearing ?? (typeof t.bearing === "number" ? t.bearing : 0);
        interpRef.current.set(t.vehicle_id, {
          prev,
          next: [t.lng, t.lat],
          prevBearing,
          nextBearing: typeof t.bearing === "number" ? t.bearing : prevBearing,
          broadcastAt: at,
        });
        positionsRef.current.set(t.vehicle_id, t);
      }
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Phase Z.1 — passenger-driven simulate-path animation. Listens for the
  // `svika:simulate-path` custom event dispatched by Journey, then RAF-
  // animates the simulated vehicle along the supplied polyline waypoints
  // for `duration_ms`. The simulated vehicle's feature in the kombis source
  // is rewritten every frame; all other vehicles keep their last position.
  // No bearing dependency on broadcasts — bearing is derived per segment
  // from the segment vector so the icon rotates smoothly along curves.
  useEffect(() => {
    let raf: number | null = null;

    function bearingDeg(
      from: [number, number],
      to: [number, number],
    ): number {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const toDeg = (rad: number) => (rad * 180) / Math.PI;
      const [lng1, lat1] = from;
      const [lng2, lat2] = to;
      const phi1 = toRad(lat1);
      const phi2 = toRad(lat2);
      const dLambda = toRad(lng2 - lng1);
      const y = Math.sin(dLambda) * Math.cos(phi2);
      const x =
        Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function rebuildSource(): void {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource(KOMBIS_SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      try {
        src.setData(
          kombisGeoJSON(positionsRef.current, assignedVehicleIdRef.current),
        );
      } catch {
        // map closed mid-frame
      }
    }

    function handleSimulatePath(ev: Event): void {
      const detail = (ev as CustomEvent).detail as
        | {
            vehicle_id: string;
            route_id: string;
            path: Array<[number, number]>;
            duration_ms: number;
            final_lat: number;
            final_lng: number;
          }
        | undefined;
      if (!detail || !Array.isArray(detail.path) || detail.path.length < 2) {
        return;
      }
      const { vehicle_id, route_id, path, duration_ms } = detail;
      const finalLat = detail.final_lat;
      const finalLng = detail.final_lng;
      // Suppress the per-tick lerp for this vehicle so the two RAF loops
      // don't fight: the simulate-path RAF owns this vehicle until done.
      interpRef.current.delete(vehicle_id);

      const start = performance.now();
      const segments = path.length - 1;

      if (raf !== null) cancelAnimationFrame(raf);
      function step(): void {
        const now = performance.now();
        const t = Math.max(0, Math.min(1, (now - start) / duration_ms));
        const segFloat = t * segments;
        const idx = Math.min(segments - 1, Math.floor(segFloat));
        const frac = segFloat - idx;
        const a = path[idx];
        const b = path[idx + 1];
        const lng = a[0] + (b[0] - a[0]) * frac;
        const lat = a[1] + (b[1] - a[1]) * frac;
        const bearing = bearingDeg(a, b);
        const existing = positionsRef.current.get(vehicle_id);
        positionsRef.current.set(vehicle_id, {
          vehicle_id,
          route_id,
          lat,
          lng,
          bearing,
          direction: existing?.direction ?? "outbound",
          at: existing?.at ?? new Date().toISOString(),
        });
        rebuildSource();
        if (t < 1) {
          raf = requestAnimationFrame(step);
        } else {
          // Snap to final waypoint to make sure rounding doesn't leave the
          // marker a metre short of the target stop.
          const finalA = path[path.length - 2];
          const finalB = path[path.length - 1];
          positionsRef.current.set(vehicle_id, {
            vehicle_id,
            route_id,
            lat: finalLat,
            lng: finalLng,
            bearing: bearingDeg(finalA, finalB),
            direction: existing?.direction ?? "outbound",
            at: new Date().toISOString(),
          });
          rebuildSource();
          raf = null;
        }
      }
      raf = requestAnimationFrame(step);
    }

    window.addEventListener("svika:simulate-path", handleSimulatePath);
    return () => {
      window.removeEventListener("svika:simulate-path", handleSimulatePath);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  // RAF interpolation loop. Reads the lerp buffer + the source-of-truth
  // routeId/direction from `positionsRef`, builds an eased GeoJSON, and
  // hands it to the kombis source. Two important guards:
  //   1. Skip the frame entirely when the buffer is empty — the kombis
  //      source already holds the last good state, no churn needed.
  //   2. Skip after a kombi has finished its 1.5 s ease (t === 1) and we
  //      have already written the snap-to-target frame; otherwise we'd be
  //      pushing the same FeatureCollection 60×/s, marking the source as
  //      "loading" continuously and blocking the basemap composite from
  //      ever reporting `map.loaded()`.
  // The result: setData fires only while there is real motion to paint.
  useEffect(() => {
    let raf = 0;
    let pending = false;
    let lastSettledAt = 0;
    function frame(): void {
      raf = requestAnimationFrame(frame);
      if (pending) return;
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource(KOMBIS_SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      if (interpRef.current.size === 0) return;
      const now = performance.now();
      const lerped = new Map<string, KombiTickPayload>();
      let stillEasing = false;
      for (const [id, entry] of interpRef.current.entries()) {
        const t = Math.max(0, Math.min(1, (now - entry.broadcastAt) / TICK_PERIOD_MS));
        if (t < 1) stillEasing = true;
        const eased = easeInOut(t);
        const lng = entry.prev[0] + (entry.next[0] - entry.prev[0]) * eased;
        const lat = entry.prev[1] + (entry.next[1] - entry.prev[1]) * eased;
        const bearing = lerpBearing(entry.prevBearing, entry.nextBearing, eased);
        const orig = positionsRef.current.get(id);
        if (!orig) continue;
        lerped.set(id, { ...orig, lat, lng, bearing });
      }
      // Once everything has settled, write one final "snap" frame and then
      // stop touching the source until the next broadcast arrives.
      if (!stillEasing && lastSettledAt >= now - 50) return;
      if (!stillEasing) lastSettledAt = now;
      else lastSettledAt = 0;
      pending = true;
      try {
        src.setData(kombisGeoJSON(lerped, assignedVehicleIdRef.current));
      } catch {
        // map closed mid-frame
      }
      pending = false;
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />

      {journey && stage && stage.assigned_vehicle_id ? (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-svika-teal-100 bg-white/95 px-3 py-1 text-xs font-medium text-svika-teal shadow-sm"
          data-testid="journey-eta-chip"
        >
          {stage.assigned_vehicle_id}
          {stage.eta_seconds !== null
            ? " · ETA " + (stage.eta_seconds <= 0 ? "now" : Math.max(1, Math.round(stage.eta_seconds / 60)) + " min")
            : null}
        </div>
      ) : null}

      {selected && !journey ? (
        <aside className="pointer-events-auto absolute right-3 top-3 max-w-xs rounded-lg border border-svika-teal-100 bg-svika-stone/95 p-3 text-sm shadow-md backdrop-blur">
          <header className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-svika-teal">{selected.route.name}</h2>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                const map = mapRef.current;
                if (map) {
                  map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["in", ["get", "id"], ["literal", []]]);
                  if (map.getLayer(ROUTES_LAYER_HIGHLIGHT_HALO)) {
                    map.setFilter(ROUTES_LAYER_HIGHLIGHT_HALO, [
                      "in",
                      ["get", "id"],
                      ["literal", []],
                    ]);
                  }
                }
              }}
              className="text-svika-mute hover:text-svika-teal"
              aria-label="Close route details"
            >
              ×
            </button>
          </header>
          <p className="mb-2 text-xs text-svika-mute">
            ${selected.route.default_fare_usd.toFixed(2)} end to end ·{" "}
            {selected.route.typical_duration_minutes} min
          </p>
          <ol className="space-y-1 text-xs">
            {selected.stops.map((s, idx) => (
              <li key={s.id} className="flex items-baseline gap-2">
                <span className="w-4 text-right text-svika-mute">{idx + 1}.</span>
                <span className={s.is_rank ? "font-medium text-svika-teal" : "text-svika-ink"}>
                  {s.name}
                  {s.is_rank ? " · rank" : null}
                  {s.is_terminal && !s.is_rank ? " · terminal" : null}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      ) : null}

    </div>
  );
}

function repaintAssignedHighlight(map: mapboxgl.Map, assignedVehicleId: string | null): void {
  if (!map.isStyleLoaded()) return;
  const src = map.getSource(KOMBIS_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  // We need to read the current data without mutating it. Easiest path is to
  // ask the caller to call setData; here we just toggle the halo filter.
  if (map.getLayer(KOMBIS_LAYER_HALO)) {
    map.setFilter(KOMBIS_LAYER_HALO, [
      "==",
      ["get", "vehicle_id"],
      assignedVehicleId ?? "__none__",
    ]);
  }
}

/**
 * When a journey is active:
 *   - Fade all base routes to 0.22 opacity.
 *   - Highlight the active kombi leg's route in rust.
 * When no journey:
 *   - Restore normal opacity. Highlight is empty until the user clicks a route.
 */
function repaintActiveLeg(
  map: mapboxgl.Map,
  journey: ActiveJourney | null,
  stage: JourneyStage | null,
): void {
  if (!map.isStyleLoaded()) return;
  if (!map.getLayer(ROUTES_LAYER_BASE) || !map.getLayer(ROUTES_LAYER_HIGHLIGHT)) return;

  if (!journey || !stage || stage.active_kombi_leg_index === null) {
    map.setPaintProperty(ROUTES_LAYER_BASE, "line-opacity", 0.55);
    map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["in", ["get", "id"], ["literal", []]]);
    if (map.getLayer(ROUTES_LAYER_HIGHLIGHT_HALO)) {
      map.setFilter(ROUTES_LAYER_HIGHLIGHT_HALO, [
        "in",
        ["get", "id"],
        ["literal", []],
      ]);
    }
    return;
  }

  const activeLeg = journey.legs[stage.active_kombi_leg_index];
  const activeRouteId = activeLeg && activeLeg.kind === "kombi" ? activeLeg.route_id : null;
  map.setPaintProperty(ROUTES_LAYER_BASE, "line-opacity", 0.22);
  const ids = activeRouteId ? [activeRouteId] : [];
  map.setFilter(ROUTES_LAYER_HIGHLIGHT, [
    "in",
    ["get", "id"],
    ["literal", ids],
  ]);
  if (map.getLayer(ROUTES_LAYER_HIGHLIGHT_HALO)) {
    map.setFilter(ROUTES_LAYER_HIGHLIGHT_HALO, [
      "in",
      ["get", "id"],
      ["literal", ids],
    ]);
  }
}
