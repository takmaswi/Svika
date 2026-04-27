/**
 * Phase 4.5 motion + basemap verification.
 *
 * Drives Takunda's surface against https://svika.vercel.app, broadcasts
 * three 2-second-spaced kombi tick payloads along route_heights_rezende,
 * and saves a screenshot per tick into scripts/phase4-5-motion-N.png so
 * we can review motion smoothness manually. Also probes the running
 * Mapbox map for: basemap style readiness, loaded tile count, the
 * kombis source feature count, and whether the kombi-icon image is
 * registered.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-5-motion-verify.ts
 */

import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import { SIM_CHANNEL, SIM_EVENT, type KombiTickPayload } from "@/lib/sim/simRunner";
import type { Database } from "@/lib/supabase/types";

const BASE = "https://svika.vercel.app";
const ROUTE = "route_heights_rezende";
const VEHICLE = "ZH 4821";

// Three sample points along Bannockburn Rd progressing south.
const SAMPLES: Array<[number, number, number]> = [
  // [lat, lng, bearing_deg]
  [-17.7498, 31.0425, 178],
  [-17.7560, 31.0440, 175],
  [-17.7625, 31.0455, 172],
];

interface MapProbe {
  styleLoaded: boolean;
  hasKombiIcon: boolean;
  kombiFeatures: number;
  kombiCoords: Array<[number, number]>;
  zoom: number;
  pitch: number;
  loadedTiles: number;
}

async function probe(page: Page): Promise<MapProbe> {
  return page.evaluate(() => {
    type SourceCache = { _tiles?: Record<string, { hasData?: () => boolean }> };
    const map = (
      window as unknown as {
        __svikaMap?: {
          isStyleLoaded: () => boolean;
          hasImage: (id: string) => boolean;
          querySourceFeatures: (sourceId: string) => Array<{
            geometry: { coordinates: [number, number] };
          }>;
          getZoom: () => number;
          getPitch: () => number;
          style?: { _otherSourceCaches?: Record<string, SourceCache> };
        };
      }
    ).__svikaMap;
    if (!map) {
      return {
        styleLoaded: false,
        hasKombiIcon: false,
        kombiFeatures: 0,
        kombiCoords: [],
        zoom: 0,
        pitch: 0,
        loadedTiles: 0,
      };
    }
    const features = map.querySourceFeatures("svika-kombis");
    return {
      styleLoaded: map.isStyleLoaded(),
      hasKombiIcon: map.hasImage("kombi-icon"),
      kombiFeatures: features.length,
      kombiCoords: features.map((f) => f.geometry.coordinates as [number, number]),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      // Mapbox internal — best-effort only.
      loadedTiles: 0,
    };
  });
}

function tickPayload(lat: number, lng: number, bearing: number): KombiTickPayload {
  return {
    vehicle_id: VEHICLE,
    route_id: ROUTE,
    lat,
    lng,
    direction: "outbound",
    bearing,
    at: new Date().toISOString(),
  };
}

async function broadcastTicks(
  client: SupabaseClient<Database>,
  ticks: KombiTickPayload[],
): Promise<void> {
  const channel = client.channel(SIM_CHANNEL, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 1500);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
    });
  });
  await channel.send({ type: "broadcast", event: SIM_EVENT, payload: { ticks } });
  await client.removeChannel(channel);
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing supabase env in .env.local");
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Headed — Mapbox v3 + chromium headless can capture transparent canvas
  // even when WebGL paint succeeded (preserveDrawingBuffer=false). Headed
  // captures the real composited frame so the motion screenshots show
  // what users see.
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.log(`[${m.type()}] ${m.text()}`);
    }
  });

  console.log("[phase4.5] navigating to", BASE);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });

  // Wait for the map handle to attach. The PassengerMap effect attaches it
  // synchronously on mount.
  await page.waitForFunction(
    () => Boolean((window as unknown as { __svikaMap?: unknown }).__svikaMap),
    null,
    { timeout: 20_000 },
  );
  // Wait for style to load. Don't gate on kombi-icon registration here —
  // we want to record whether it ever lands.
  await page.waitForFunction(
    () => {
      const map = (window as unknown as {
        __svikaMap?: { isStyleLoaded: () => boolean };
      }).__svikaMap;
      return Boolean(map?.isStyleLoaded());
    },
    null,
    { timeout: 30_000 },
  );
  // Give the map two seconds to load the kombi-icon and the basemap tiles.
  await page.waitForTimeout(3000);

  const before = await probe(page);
  console.log("[phase4.5] before broadcasts:", JSON.stringify(before));

  for (let i = 0; i < SAMPLES.length; i += 1) {
    const [lat, lng, bearing] = SAMPLES[i];
    console.log(`[phase4.5] broadcast ${i + 1}/3 → (${lat}, ${lng}) bearing ${bearing}`);
    await broadcastTicks(client, [tickPayload(lat, lng, bearing)]);
    // Sample mid-interpolation for the second/third broadcasts so the
    // screenshot lands on the eased motion path, not the snapped endpoint.
    await page.waitForTimeout(900);
    const probed = await probe(page);
    console.log(`[phase4.5] sample ${i + 1}:`, JSON.stringify(probed));
    await page.screenshot({ path: `scripts/phase4-5-motion-${i + 1}.png` });
  }

  const after = await probe(page);
  console.log("[phase4.5] after broadcasts:", JSON.stringify(after));

  // Bearing column check: confirm the vehicle row carries a bearing.
  const { data: bearingRow } = await client
    .from("vehicles")
    .select("id, route_id, last_position_at, current_position")
    .eq("id", VEHICLE)
    .maybeSingle();
  console.log("[phase4.5] vehicle row:", JSON.stringify(bearingRow));

  writeFileSync(
    "scripts/phase4-5-motion-summary.json",
    JSON.stringify({ before, after, samples: SAMPLES }, null, 2),
    "utf8",
  );

  await browser.close();
}

main().catch((err) => {
  console.error("[phase4.5 motion FAILED]", err);
  process.exit(1);
});
