"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { type LngLatBoundsLike } from "mapbox-gl";

import "mapbox-gl/dist/mapbox-gl.css";

interface RouteHeaderMapProps {
  routeGeometry: Array<[number, number]>;
  position: [number, number] | null;
  mapboxToken: string;
}

const TEAL = "#0a4b5c";
const RUST = "#d9622a";
const STONE = "#f2ede6";

function bounds(coords: Array<[number, number]>): LngLatBoundsLike | null {
  if (coords.length === 0) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng - 0.003, minLat - 0.003],
    [maxLng + 0.003, maxLat + 0.003],
  ];
}

export default function RouteHeaderMap({ routeGeometry, position, mapboxToken }: RouteHeaderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxToken) return;
    const b = bounds(routeGeometry);
    if (!b) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      bounds: b,
      fitBoundsOptions: { padding: 24, duration: 0 },
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: routeGeometry },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": TEAL,
          "line-width": 4,
        },
      });

      if (position) {
        const el = document.createElement("div");
        el.className = "kombi-marker";
        el.style.background = RUST;
        el.style.borderColor = STONE;
        markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(position).addTo(map);
      }
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [routeGeometry, position, mapboxToken]);

  // Update marker position without rebuilding the map.
  useEffect(() => {
    if (!mapRef.current || !position) return;
    if (markerRef.current) {
      markerRef.current.setLngLat(position);
    }
  }, [position]);

  if (!mapboxToken) {
    return (
      <div className="flex h-32 items-center justify-center bg-svika-stone-dark text-xs text-svika-mute">
        Map preview disabled (no Mapbox token).
      </div>
    );
  }

  return <div ref={containerRef} className="h-32 w-full" data-testid="hwindi-header-map" />;
}
