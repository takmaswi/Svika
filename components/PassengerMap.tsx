"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource, type LngLatBoundsLike, type MapMouseEvent } from "mapbox-gl";

import "mapbox-gl/dist/mapbox-gl.css";

import { createClient } from "@/lib/supabase/client";
import { SIM_CHANNEL, SIM_EVENT, type KombiTickPayload } from "@/lib/sim/simRunner";
import type { NetworkPayload, RouteForMap, StopForMap } from "@/lib/network/loadNetwork";

const ROUTES_SOURCE = "svika-routes";
const ROUTES_LAYER_BASE = "svika-routes-base";
const ROUTES_LAYER_HIGHLIGHT = "svika-routes-highlight";

const STOPS_SOURCE = "svika-stops";
const STOPS_LAYER_HALO = "svika-stops-halo";
const STOPS_LAYER_DOT = "svika-stops-dot";
const STOPS_LAYER_LABEL = "svika-stops-label";

const KOMBIS_SOURCE = "svika-kombis";
const KOMBIS_LAYER = "svika-kombis-dot";

const TEAL = "#0a4b5c";
const RUST = "#d9622a";
const STONE = "#f2ede6";

interface PassengerMapProps {
  network: NetworkPayload;
  mapboxToken: string;
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

function stopsGeoJSON(stops: StopForMap[]): GeoJSON.FeatureCollection {
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
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  };
}

function kombisGeoJSON(positions: Map<string, KombiTickPayload>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from(positions.values()).map((p) => ({
      type: "Feature",
      id: p.vehicle_id,
      properties: {
        vehicle_id: p.vehicle_id,
        route_id: p.route_id,
        direction: p.direction,
      },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

export default function PassengerMap({ network, mapboxToken }: PassengerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const positionsRef = useRef<Map<string, KombiTickPayload>>(new Map());
  const [selected, setSelected] = useState<SelectedRouteInfo | null>(null);

  // Build the map exactly once. Subsequent network changes would require a
  // full restyle; for the demo the network is frozen after Phase 1.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds: harareBounds(network),
      fitBoundsOptions: { padding: 40, duration: 0 },
      attributionControl: false,
    });
    mapRef.current = map;
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
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "line-color": RUST,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 16, 10],
          "line-opacity": 0.9,
        },
      });

      map.addSource(STOPS_SOURCE, { type: "geojson", data: stopsGeoJSON(network.stops) });
      map.addLayer({
        id: STOPS_LAYER_HALO,
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          "circle-radius": ["case", ["get", "is_rank"], 10, ["get", "is_terminal"], 8, 6],
          "circle-color": STONE,
          "circle-stroke-color": TEAL,
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });
      map.addLayer({
        id: STOPS_LAYER_DOT,
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          "circle-radius": ["case", ["get", "is_rank"], 4, 3],
          "circle-color": TEAL,
        },
      });
      map.addLayer({
        id: STOPS_LAYER_LABEL,
        type: "symbol",
        source: STOPS_SOURCE,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": TEAL,
          "text-halo-color": STONE,
          "text-halo-width": 1.5,
        },
      });

      map.addSource(KOMBIS_SOURCE, {
        type: "geojson",
        data: kombisGeoJSON(positionsRef.current),
      });
      map.addLayer({
        id: KOMBIS_LAYER,
        type: "circle",
        source: KOMBIS_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 8, 16, 11],
          "circle-color": RUST,
          "circle-stroke-color": STONE,
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });

      // Click a route line to highlight it and reveal its named stops.
      map.on("click", ROUTES_LAYER_BASE, handleRouteClick);
      map.on("mouseenter", ROUTES_LAYER_BASE, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ROUTES_LAYER_BASE, () => {
        map.getCanvas().style.cursor = "";
      });
      // Click empty space clears the selection.
      map.on("click", (e: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [ROUTES_LAYER_BASE, STOPS_LAYER_HALO, STOPS_LAYER_DOT, KOMBIS_LAYER],
        });
        if (hits.length === 0) {
          setSelected(null);
          map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["==", ["get", "id"], "__none__"]);
        }
      });
    });

    function handleRouteClick(e: mapboxgl.MapLayerMouseEvent) {
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id as string | undefined;
      if (!id) return;
      const route = network.routes.find((r) => r.id === id);
      if (!route) return;
      const stops = network.routeStops
        .filter((rs) => rs.route_id === id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((rs) => network.stops.find((s) => s.id === rs.stop_id))
        .filter((s): s is StopForMap => Boolean(s));
      setSelected({ route, stops });
      map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["==", ["get", "id"], id]);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [network, mapboxToken]);

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
      if (src) src.setData(kombisGeoJSON(positionsRef.current));
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {selected ? (
        <aside className="pointer-events-auto absolute right-3 top-3 max-w-xs rounded-lg border border-svika-teal-100 bg-svika-stone/95 p-3 text-sm shadow-md backdrop-blur">
          <header className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-svika-teal">{selected.route.name}</h2>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                const map = mapRef.current;
                if (map) map.setFilter(ROUTES_LAYER_HIGHLIGHT, ["==", ["get", "id"], "__none__"]);
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
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-svika-stone/90 px-2 py-1 text-xs text-svika-mute shadow-sm backdrop-blur">
          Tap a route line to see its stops
        </div>
      )}
    </div>
  );
}
