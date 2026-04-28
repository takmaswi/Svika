/**
 * Phase Z.1 rehearsal — verifies the upgraded marker, road-level zoom legibility,
 * eight distinct vehicles spread along their routes, the Simulate-tap RAF
 * animation along the polyline, the sheet auto-collapsing during the
 * animation, and the walking-transfer / arrived end-states.
 *
 *   1. marker-zoom-16        — single assigned kombi at street level zoom,
 *                              vehicle silhouette + shadow legible.
 *   2. eight-distinct-kombis — fresh idle map, eight markers visible at
 *                              network bounds, none overlapping.
 *   3. mid-animation         — during a Simulate-boarding path animation
 *                              (sheet at peek, kombi mid-route).
 *   4. post-animation        — after t > 1.0, sheet risen back to FULL with
 *                              in-transit content, kombi at board stop.
 *   5. walking-transfer      — leg-2 boarding via Simulate transfer, sheet
 *                              collapsed mid-animation.
 *   6. arrived               — final arrived state with fleet impact card.
 *
 * Run: pnpm dev (terminal 1), no sim required, then
 *      npx tsx --env-file=.env.local scripts/phase-Z1-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  markerZoom16: join(SCREENSHOT_DIR, "phase-Z1-rehearsal-1-marker-zoom-16.png"),
  eightDistinct: join(
    SCREENSHOT_DIR,
    "phase-Z1-rehearsal-2-eight-distinct-kombis.png",
  ),
  midAnimation: join(SCREENSHOT_DIR, "phase-Z1-rehearsal-3-mid-animation.png"),
  postAnimation: join(
    SCREENSHOT_DIR,
    "phase-Z1-rehearsal-4-post-animation.png",
  ),
  walkingTransfer: join(
    SCREENSHOT_DIR,
    "phase-Z1-rehearsal-5-walking-transfer.png",
  ),
  arrived: join(SCREENSHOT_DIR, "phase-Z1-rehearsal-6-arrived.png"),
};

const ORIGIN_STOP = "sp_heights_start_north";
const LEG1_ROUTE = "route_heights_rezende";
const LEG1_BOARD = "sp_heights_start_north";
const LEG1_ALIGHT = "sp_second_lomagundi";
const LEG2_ROUTE = "route_westgate_copa_segment";
const LEG2_BOARD = "sp_lomagundi_kinggeorge_pickup";
const LEG2_ALIGHT = "sp_avondale_shops";
const DEST_STOP = "sp_avondale_shops";
const PLAN_LABEL = "Lomagundi walking transfer (fastest)";
const PLAN_TOTAL_FARE = 1.5;
const PLAN_TOTAL_DURATION = 31;

function log(message: string): void {
  console.log(`\n[phase-Z1] ${message}`);
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

async function drainTakunda(
  client: SupabaseClient<Database>,
): Promise<string> {
  const { data: takunda } = await client
    .from("users")
    .select("id")
    .eq("name", "Takunda")
    .maybeSingle();
  if (!takunda) throw new Error("Takunda user missing");
  await client
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("current_holder_user_id", takunda.id)
    .in("status", ["issued", "held", "redeemed"]);
  await client
    .from("users")
    .update({ credit_balance_usd: 5 })
    .eq("id", takunda.id);
  return takunda.id;
}

async function bookViaDb(
  client: SupabaseClient<Database>,
  takundaId: string,
): Promise<{ trip_id: string }> {
  const { data: tripData, error: tripErr } = await client
    .from("trips")
    .insert({
      originating_user_id: takundaId,
      origin_stop_id: ORIGIN_STOP,
      destination_stop_id: DEST_STOP,
      selected_option_label: PLAN_LABEL,
      total_fare_usd: PLAN_TOTAL_FARE,
      total_duration_minutes: PLAN_TOTAL_DURATION,
    })
    .select("id")
    .single();
  if (tripErr || !tripData) {
    throw new Error("trip insert failed: " + tripErr?.message);
  }
  const trip_id = tripData.id;

  async function insertTicket(
    routeId: string,
    board: string,
    alight: string,
    fare: number,
  ): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const access_code = randomCode();
      const { data, error } = await client
        .from("tickets")
        .insert({
          access_code,
          route_id: routeId,
          board_at_stop_id: board,
          alight_at_stop_id: alight,
          fare_usd: fare,
          originating_user_id: takundaId,
          current_holder_user_id: takundaId,
          status: "issued",
          kind: "passenger",
        })
        .select("id")
        .single();
      if (!error && data) return data.id;
      if (error && error.code !== "23505") {
        throw new Error("ticket insert failed: " + error.message);
      }
    }
    throw new Error("could not allocate access code");
  }

  const leg1Id = await insertTicket(LEG1_ROUTE, LEG1_BOARD, LEG1_ALIGHT, 1);
  await client
    .from("trip_tickets")
    .insert({ trip_id, ticket_id: leg1Id, sequence: 0 });
  const leg2Id = await insertTicket(LEG2_ROUTE, LEG2_BOARD, LEG2_ALIGHT, 0.5);
  await client
    .from("trip_tickets")
    .insert({ trip_id, ticket_id: leg2Id, sequence: 1 });

  await client
    .from("users")
    .update({ credit_balance_usd: 3.5 })
    .eq("id", takundaId);

  return { trip_id };
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Headed mode — synthetic events in headless can drop frames during the
  // RAF interpolation, so the mid-animation screenshot is unreliable.
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // ---- 2. eight-distinct-kombis — drained Takunda, idle network bounds ----
  log("2. drain Takunda + fresh idle map");
  await drainTakunda(client);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-sheet"]', {
    timeout: 30_000,
  });
  // Give the map a moment to fit bounds and seed all 8 kombis.
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOTS.eightDistinct });
  console.log(`    wrote ${SHOTS.eightDistinct}`);

  // ---- 1. marker-zoom-16 — programmatically center on a known kombi
  // position (1/3 along the Heights route, where the spread loader places
  // one of the two Heights vehicles) at zoom 16, so the marker reads as a
  // recognisable vehicle at street level.
  log("1. center on Heights kombi position, zoom to 16");
  await page.evaluate(async () => {
    type W = {
      __svikaMap?: {
        setZoom: (z: number) => void;
        setCenter: (c: [number, number]) => void;
        getSource: (id: string) =>
          | { _data?: { features?: Array<{ geometry?: { coordinates?: [number, number] } }> } }
          | undefined;
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return;
    const src = map.getSource("svika-kombis");
    const feats = src?._data?.features ?? [];
    // Pick a vehicle near the middle of the network so the basemap context
    // (Avondale / King George area) reads cleanly at street level.
    const mid = feats[Math.floor(feats.length / 2)];
    const coords = mid?.geometry?.coordinates ?? [31.0459, -17.79115];
    map.setCenter(coords);
    map.setZoom(16);
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: SHOTS.markerZoom16 });
  console.log(`    wrote ${SHOTS.markerZoom16}`);

  // ---- 3 + 4. mid-animation + post-animation ----
  log("3. DB-book Heights→Avondale → tap Simulate boarding → mid-animation");
  const takundaId = await drainTakunda(client);
  await bookViaDb(client, takundaId);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  await page.waitForSelector('[data-testid="journey-simulate-next"]', {
    timeout: 10_000,
  });
  await page.waitForTimeout(1200);
  // Tap simulate. Wait for the sheet to actually drop to peek (which fires
  // only AFTER the server action returns and onSimulateStart runs) so we
  // capture the animation, not the busy spinner before it starts. Then
  // sample at t ≈ 0.4 of the 6 s animation.
  await page.click('[data-testid="journey-simulate-next"]');
  await page.waitForSelector('[data-testid="journey-sheet"][data-snap="peek"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(2400);
  await page.screenshot({ path: SHOTS.midAnimation });
  console.log(`    wrote ${SHOTS.midAnimation}`);

  log("4. wait past animation end → post-animation screenshot");
  // Wait for the sheet to rise back out of peek (auto-snap to the new
  // stage's natural snap fires when isSimulating flips back to false).
  await page.waitForSelector(
    '[data-testid="journey-sheet"]:not([data-snap="peek"])',
    { timeout: 20_000 },
  );
  await page.waitForSelector(
    '[data-stage="in-transit"], [data-stage="boarding"]',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS.postAnimation });
  console.log(`    wrote ${SHOTS.postAnimation}`);

  // ---- 5. walking-transfer mid-animation ----
  log("5. tap Skip to drop-off → wait → tap Simulate walking transfer (mid)");
  // Tap "Skip to drop-off" to drive in-transit → walking-transfer.
  await page.click('[data-testid="journey-simulate-next"]');
  // Wait through the in-transit animation cleanly — sheet drops then rises.
  await page.waitForSelector(
    '[data-testid="journey-sheet"][data-snap="peek"]',
    { timeout: 15_000 },
  );
  await page.waitForSelector(
    '[data-testid="journey-sheet"]:not([data-snap="peek"])',
    { timeout: 20_000 },
  );
  await page.waitForSelector('[data-stage="walking-transfer"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
  // Tap the walking-transfer simulate, capture mid-flight.
  await page.click('[data-testid="journey-simulate-next"]');
  await page.waitForSelector(
    '[data-testid="journey-sheet"][data-snap="peek"]',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(2400);
  await page.screenshot({ path: SHOTS.walkingTransfer });
  console.log(`    wrote ${SHOTS.walkingTransfer}`);

  // ---- 6. arrived ----
  log("6. tap through to arrived");
  // Wait through the walking-transfer animation we just kicked off.
  await page.waitForSelector(
    '[data-testid="journey-sheet"]:not([data-snap="peek"])',
    { timeout: 20_000 },
  );
  // Then tap to drive boarding-leg-2 → arrived.
  for (let i = 0; i < 3; i += 1) {
    const button = page.locator('[data-testid="journey-simulate-next"]');
    if ((await button.count()) === 0) break;
    if (await button.isDisabled()) {
      await page.waitForTimeout(800);
      continue;
    }
    await button.click();
    // Wait for the sheet drop+rise cycle so we don't double-tap during the
    // animation (the button is disabled while simBusy, but the action's
    // 2 s setup window can race the next click otherwise).
    try {
      await page.waitForSelector(
        '[data-testid="journey-sheet"][data-snap="peek"]',
        { timeout: 10_000 },
      );
      await page.waitForSelector(
        '[data-testid="journey-sheet"]:not([data-snap="peek"])',
        { timeout: 20_000 },
      );
    } catch {
      // Final tap may resolve straight to arrived without a peek hop.
    }
  }
  await page.waitForSelector('[data-testid="journey-arrived"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS.arrived });
  console.log(`    wrote ${SHOTS.arrived}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-Z1 FAILED]", err);
  process.exit(1);
});
