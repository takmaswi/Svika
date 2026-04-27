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
const ROUTES_LAYER_HIGHLIGHT = "svika-routes-highlight";

const STOPS_SOURCE = "svika-stops";
const STOPS_LAYER_HALO = "svika-stops-halo";
const STOPS_LAYER_DOT = "svika-stops-dot";
const STOPS_LAYER_LABEL = "svika-stops-label";

const KOMBIS_SOURCE = "svika-kombis";
const KOMBIS_LAYER = "svika-kombis-dot";
const KOMBIS_LAYER_HALO = "svika-kombis-halo";

const WALKING_SOURCE = "svika-walking";
const WALKING_LAYER = "svika-walking-line";

const TEAL = "#0a4b5c";
const RUST = "#d9622a";
const STONE = "#f2ede6";

const KOMBI_ICON_ID = "svika-kombi";
const KOMBI_ICON_PX = 64;

/**
 * Top-down minibus SVG. Front of the bus points up the canvas (north / 0°)
 * so Mapbox `icon-rotate` directly accepts a compass bearing. The body fills
 * with rust; windshield + side windows are teal so the silhouette reads at
 * Citymapper-bus / Uber-car distances.
 */
const KOMBI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${KOMBI_ICON_PX}" height="${KOMBI_ICON_PX}" viewBox="0 0 64 64">
  <defs>
    <filter id="kombiShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#kombiShadow)">
    <rect x="18" y="6" width="28" height="52" rx="9" ry="9" fill="${RUST}" stroke="${STONE}" stroke-width="2.4"/>
    <rect x="22" y="9" width="20" height="11" rx="3" fill="#0e3845"/>
    <rect x="22" y="22" width="9" height="9" rx="2" fill="#0e3845"/>
    <rect x="33" y="22" width="9" height="9" rx="2" fill="#0e3845"/>
    <rect x="22" y="33" width="9" height="9" rx="2" fill="#0e3845"/>
    <rect x="33" y="33" width="9" height="9" rx="2" fill="#0e3845"/>
    <rect x="22" y="48" width="20" height="8" rx="2" fill="#a14820"/>
    <rect x="28" y="11" width="8" height="3" rx="1" fill="#f9d97a" opacity="0.9"/>
  </g>
</svg>
`.trim();

async function registerKombiIcon(map: mapboxgl.Map): Promise<void> {
  if (map.hasImage(KOMBI_ICON_ID)) return;
  await new Promise<void>((resolve) => {
    const img = new Image(KOMBI_ICON_PX, KOMBI_ICON_PX);
    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(KOMBI_SVG);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = KOMBI_ICON_PX;
        canvas.height = KOMBI_ICON_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        ctx.drawImage(img, 0, 0, KOMBI_ICON_PX, KOMBI_ICON_PX);
        const data = ctx.getImageData(0, 0, KOMBI_ICON_PX, KOMBI_ICON_PX);
        if (!map.hasImage(KOMBI_ICON_ID)) {
          map.addImage(KOMBI_ICON_ID, data, { pixelRatio: 2 });
        }
      } catch {
        // best-effort; symbol layer falls back to no-icon if the image is missing
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

interface PassengerMapProps {
  network: NetworkPayload;
  mapboxToken: string;
  /** Active journey for the current persona, if any. Drives leg highlighting. */
  journey: ActiveJourney | null;
  /** Latest stage from the Journey sheet. Identifies the assigned kombi. */
  stage: JourneyStage | null;
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
}: PassengerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const positionsRef = useRef<Map<string, KombiTickPayload>>(new Map());
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

  // Refresh the kombi source paint, walking source, and stop emphasis
  // whenever journey/stage change. Imperative — no map rebuild.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const walkingSrc = map.getSource(WALKING_SOURCE) as GeoJSONSource | undefined;
    if (walkingSrc) walkingSrc.setData(walkingGeoJSON(journey));
    const kombiSrc = map.getSource(KOMBIS_SOURCE) as GeoJSONSource | undefined;
    if (kombiSrc) kombiSrc.setData(kombisGeoJSON(positionsRef.current, assignedVehicleIdRef.current));
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
        { padding: 60, duration: 800, essential: true },
      );
    }

    function applyNetworkBounds(): void {
      const [sw, ne] = harareBounds(networkRef.current) as [
        [number, number],
        [number, number],
      ];
      m.fitBounds([sw, ne], { padding: 40, duration: 800, essential: true });
    }

    function run(): void {
      if (justArrived) {
        lastArrivedFitRef.current = arrivedTripId;
        applyNetworkBounds();
        return;
      }
      if (!tripChanged) return;
      lastFittedTripIdRef.current = tripId;
      if (tripId && journey) {
        applyTripBounds();
      } else {
        lastArrivedFitRef.current = null;
        applyNetworkBounds();
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

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds: harareBounds(network),
      fitBoundsOptions: { padding: 40, duration: 0 },
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
      map.addLayer({
        id: ROUTES_LAYER_HIGHLIGHT,
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        filter: ["in", ["get", "id"], ["literal", []]],
        paint: {
          "line-color": RUST,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 16, 10],
          "line-opacity": 0.95,
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
          "circle-stroke-color": ["case", ["get", "is_active"], RUST, TEAL],
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
          "circle-color": ["case", ["get", "is_active"], RUST, TEAL],
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
          "text-color": ["case", ["get", "is_active"], RUST, TEAL],
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
      // Kombi minibus icon, rotated to direction-of-travel via the bearing on
      // each tick payload. Active (assigned) kombi renders larger and at full
      // opacity; pass-through kombis render smaller and dimmer so the eye
      // tracks the trip-relevant vehicle first.
      void registerKombiIcon(map).then(() => {
        if (!map.getLayer(KOMBIS_LAYER)) {
          map.addLayer({
            id: KOMBIS_LAYER,
            type: "symbol",
            source: KOMBIS_SOURCE,
            layout: {
              "icon-image": KOMBI_ICON_ID,
              "icon-rotate": ["coalesce", ["get", "bearing"], 0],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                ["case", ["==", ["get", "is_assigned"], true], 0.55, 0.32],
                14,
                ["case", ["==", ["get", "is_assigned"], true], 0.95, 0.55],
                16,
                ["case", ["==", ["get", "is_assigned"], true], 1.25, 0.75],
              ],
            },
            paint: {
              "icon-opacity": [
                "case",
                ["==", ["get", "is_assigned"], true],
                1,
                0.55,
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

  // Subscribe to the sim runner's broadcast channel. Imperatively patch the
  // GeoJSON source on every tick — never use React state for kombi positions.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(SIM_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on("broadcast", { event: SIM_EVENT }, (msg) => {
      const ticks = (msg.payload as { ticks?: KombiTickPayload[] } | undefined)?.ticks;
      if (!Array.isArray(ticks)) return;
      for (const t of ticks) positionsRef.current.set(t.vehicle_id, t);
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource(KOMBIS_SOURCE) as GeoJSONSource | undefined;
      if (src) src.setData(kombisGeoJSON(positionsRef.current, assignedVehicleIdRef.current));
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
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
                if (map) map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["in", ["get", "id"], ["literal", []]]);
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
    return;
  }

  const activeLeg = journey.legs[stage.active_kombi_leg_index];
  const activeRouteId = activeLeg && activeLeg.kind === "kombi" ? activeLeg.route_id : null;
  map.setPaintProperty(ROUTES_LAYER_BASE, "line-opacity", 0.22);
  map.setFilter(ROUTES_LAYER_HIGHLIGHT, [
    "in",
    ["get", "id"],
    ["literal", activeRouteId ? [activeRouteId] : []],
  ]);
}
