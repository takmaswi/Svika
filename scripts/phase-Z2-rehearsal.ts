/**
 * Phase Z.2 rehearsal — verifies that kombi markers right-size with zoom and
 * that fitBounds tightens onto the active trip / walking-transfer corridor.
 *
 *   1. empty-state-zoom        — fresh idle map, 8 markers visible, default
 *                                zoom shows Harare's structure (not a
 *                                continent), markers small as a Mapbox dot.
 *   2. walk-to-board-zoom      — active Heights→Avondale journey at
 *                                walk-to-board, map tight on the corridor.
 *   3. walking-transfer-zoom   — mid-walking-transfer, map shows only the
 *                                Lomagundi corner with both stops + dash.
 *   4. marker-zoom-16          — manual zoom 16 on a kombi: clearly a Hiace,
 *                                NOT bigger than a city block.
 *   5. arrived-zoom            — arrived state, full trip path visible with
 *                                comfortable padding.
 *
 * Run: pnpm dev (terminal 1), pnpm sim:start (terminal 2), then
 *      npx tsx --env-file=.env.local scripts/phase-Z2-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  emptyState: join(SCREENSHOT_DIR, "phase-Z2-rehearsal-1-empty-state-zoom.png"),
  walkToBoard: join(
    SCREENSHOT_DIR,
    "phase-Z2-rehearsal-2-walk-to-board-zoom.png",
  ),
  walkingTransfer: join(
    SCREENSHOT_DIR,
    "phase-Z2-rehearsal-3-walking-transfer-zoom.png",
  ),
  markerZoom16: join(SCREENSHOT_DIR, "phase-Z2-rehearsal-4-marker-zoom-16.png"),
  arrived: join(SCREENSHOT_DIR, "phase-Z2-rehearsal-5-arrived-zoom.png"),
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

// Frozen seed coordinates — copied from seed/network.json. The stop_points
// `location` column is a PostGIS geography that PostgREST returns as a
// dialect-specific binary blob; hard-coding here keeps the rehearsal
// independent of how the column happens to be serialised.
const LEG1_ALIGHT_COORDS = { lat: -17.7936, lng: 31.0528 };
const LEG2_ALIGHT_COORDS = { lat: -17.80321, lng: 31.03702 };

function log(message: string): void {
  console.log(`\n[phase-Z2] ${message}`);
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
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[browser ${t}]`, msg.text());
    }
  });

  // ---- 1. empty-state-zoom — fresh idle map, all 8 markers visible ----
  log("1. drain Takunda + empty-state idle map");
  await drainTakunda(client);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-sheet"]', {
    timeout: 30_000,
  });
  // Allow the map to fit-bounds and seed all 8 kombis. Empty-state fitBounds
  // uses duration:0 so we don't need to wait for an animation, only for the
  // initial source rebuild and tile load.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOTS.emptyState });
  console.log(`    wrote ${SHOTS.emptyState}`);

  // ---- 4. marker-zoom-16 — manual zoom 16 on a known kombi position ----
  log("4. center on a Heights kombi position, zoom to 16");
  await page.evaluate(async () => {
    type W = {
      __svikaMap?: {
        setZoom: (z: number) => void;
        setCenter: (c: [number, number]) => void;
        getSource: (id: string) =>
          | {
              _data?: {
                features?: Array<{
                  geometry?: { coordinates?: [number, number] };
                }>;
              };
            }
          | undefined;
      };
    };
    const map = (window as unknown as W).__svikaMap;
    if (!map) return;
    const src = map.getSource("svika-kombis");
    const feats = src?._data?.features ?? [];
    const mid = feats[Math.floor(feats.length / 2)];
    const coords = mid?.geometry?.coordinates ?? [31.0459, -17.79115];
    map.setCenter(coords);
    map.setZoom(16);
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: SHOTS.markerZoom16 });
  console.log(`    wrote ${SHOTS.markerZoom16}`);

  // ---- 2. walk-to-board-zoom — active journey at walk-to-board ----
  log("2. DB-book Heights→Avondale → reload to walk-to-board");
  const takundaId = await drainTakunda(client);
  await bookViaDb(client, takundaId);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  // Wait through the 800ms applyTripBounds animation + a buffer.
  await page.waitForTimeout(2200);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  // ---- 3. walking-transfer-zoom — bypass simulate-path race ----
  // The demo backend's pg_cron kombi heartbeat ticks every ~6 s and
  // overwrites vehicle positions, which races against the simulate-path
  // animation: the walking-transfer stage only fires while the leg-1
  // vehicle is within 120 m of its alight stop, and the cron broadcast
  // pushes it past that window almost immediately.
  //
  // For a deterministic screenshot, set up the walking-transfer DB state
  // directly: leg 1 redeemed, leg 1 vehicle parked at the leg 1 alight
  // stop, leg 2 still issued. Reload, screenshot before the next cron
  // tick. deriveJourneyStage drops cleanly into walking-transfer.
  log("3. set up walking-transfer state via DB → screenshot");
  async function readStage(): Promise<string> {
    return await page
      .locator("[data-stage]")
      .first()
      .getAttribute("data-stage")
      .then((v) => v ?? "?")
      .catch(() => "?");
  }

  // Get the trip + tickets we just booked.
  const { data: tripRow } = await client
    .from("trips")
    .select("id")
    .eq("originating_user_id", takundaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const tripId = tripRow!.id;
  const { data: legRows } = await client
    .from("trip_tickets")
    .select("ticket_id, sequence")
    .eq("trip_id", tripId)
    .order("sequence", { ascending: true });
  const leg1TicketId = legRows![0].ticket_id;
  const leg2TicketId = legRows![1].ticket_id;

  // Pick a vehicle on leg 1's route as the assigned kombi for leg 1.
  const { data: leg1Ticket } = await client
    .from("tickets")
    .select("route_id")
    .eq("id", leg1TicketId)
    .single();
  const { data: leg1Vehicle } = await client
    .from("vehicles")
    .select("id")
    .eq("route_id", leg1Ticket!.route_id)
    .limit(1)
    .single();

  // Park leg 1 vehicle at leg 1 alight stop (Second St at Lomagundi).
  // Compose a PostGIS-friendly WKB hex via SRID 4326 for the geography
  // column. Easier path: write the EWKT string directly through PostgREST.
  await client
    .from("vehicles")
    .update({
      current_position: `SRID=4326;POINT(${LEG1_ALIGHT_COORDS.lng} ${LEG1_ALIGHT_COORDS.lat})`,
      last_position_at: new Date().toISOString(),
    })
    .eq("id", leg1Vehicle!.id);
  // Mark leg 1 redeemed.
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: leg1Vehicle!.id,
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", leg1TicketId);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });

  // The Journey component derives walking-transfer from in-memory vehicles
  // populated by SIM_CHANNEL broadcasts. With sim runners stopped to
  // prevent position-override races, the map starts empty and stage falls
  // back to in-transit (eta=null). Publish a single broadcast directly
  // with the leg-1 vehicle parked at the alight stop so the Journey
  // subscription populates and deriveJourneyStage sees the walk window.
  const broadcastLatLng = LEG1_ALIGHT_COORDS;

  // Push the broadcast through a Playwright-side Supabase channel so the
  // browser-side Journey subscriber receives it. We send for ~2 seconds at
  // 200 ms cadence so React commits the new vehicles state before the
  // walking-transfer waitForSelector fires.
  const broadcastUntil = Date.now() + 4000;
  const broadcastChannel = client.channel("kombi-positions", {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve) => {
    broadcastChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  while (Date.now() < broadcastUntil) {
    await broadcastChannel.send({
      type: "broadcast",
      event: "tick",
      payload: {
        ticks: [
          {
            vehicle_id: leg1Vehicle!.id,
            route_id: leg1Ticket!.route_id,
            lat: broadcastLatLng.lat,
            lng: broadcastLatLng.lng,
            direction: "outbound",
            bearing: 0,
            at: new Date().toISOString(),
          },
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  await page.waitForSelector('[data-stage="walking-transfer"]', {
    timeout: 15_000,
  });
  // applyWalkingTransferBounds runs 600 ms — give the camera a beat to land.
  await page.waitForTimeout(900);
  const stage3 = await readStage();
  console.log(`    stage at screenshot: ${stage3}`);
  await page.screenshot({ path: SHOTS.walkingTransfer });
  console.log(`    wrote ${SHOTS.walkingTransfer}`);

  await broadcastChannel.unsubscribe();

  // ---- 5. arrived-zoom — bypass simulate-path race conditions ----
  // The simulate-path / pg_cron interplay makes tap-3 + tap-4 unreliable in
  // automation: by the time the test taps, pg_cron may have re-broadcast
  // the leg-1 vehicle past the alight stop, so the server-side stage is
  // back to in-transit and the action repeats moveVehicle instead of
  // redeeming leg 2.
  //
  // To get a stable arrived screenshot we redeem leg 2 directly on the DB
  // (mimicking the conductor having cleared the second PIN) and place the
  // assigned vehicle at the final alight stop. The page refreshes on the
  // realtime ticket-redeemed broadcast, deriveJourneyStage sees the
  // last-leg vehicle within 80 m of its alight stop, and arrived fires.
  log("5. redeem leg 2 + park vehicle at final alight → arrived");
  // leg2TicketId is already in scope from the walking-transfer setup above.
  const { data: leg2Ticket } = await client
    .from("tickets")
    .select("route_id")
    .eq("id", leg2TicketId)
    .single();
  const { data: leg2Vehicle } = await client
    .from("vehicles")
    .select("id")
    .eq("route_id", leg2Ticket!.route_id)
    .limit(1)
    .single();
  if (!leg2Vehicle) throw new Error("no vehicle on leg 2 route");
  await client
    .from("vehicles")
    .update({
      current_position: `SRID=4326;POINT(${LEG2_ALIGHT_COORDS.lng} ${LEG2_ALIGHT_COORDS.lat})`,
      last_position_at: new Date().toISOString(),
    })
    .eq("id", leg2Vehicle.id);
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: leg2Vehicle.id,
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", leg2TicketId);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });

  // Same trick for arrived: broadcast the leg-2 vehicle's position at the
  // final alight stop so the Journey subscriber populates and stage flips
  // to arrived (vehicle within ARRIVED_RADIUS_METERS of the alight stop).
  const broadcastLeg2 = LEG2_ALIGHT_COORDS;
  const arrivedChannel = client.channel("kombi-positions", {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve) => {
    arrivedChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  // Broadcast continuously until either arrived lands or we time out.
  // The Journey component sets vehicles state from each broadcast tick;
  // we keep ticking so any re-render keeps the leg-2 vehicle parked at
  // its alight stop.
  const arrivedDeadline = Date.now() + 20_000;
  let arrivedSeen = false;
  while (Date.now() < arrivedDeadline && !arrivedSeen) {
    await arrivedChannel.send({
      type: "broadcast",
      event: "tick",
      payload: {
        ticks: [
          {
            vehicle_id: leg2Vehicle.id,
            route_id: leg2Ticket!.route_id,
            lat: broadcastLeg2.lat,
            lng: broadcastLeg2.lng,
            direction: "outbound",
            bearing: 0,
            at: new Date().toISOString(),
          },
        ],
      },
    });
    arrivedSeen =
      (await page.locator('[data-testid="journey-arrived"]').count()) > 0;
    if (!arrivedSeen) await new Promise((r) => setTimeout(r, 250));
  }
  if (!arrivedSeen) {
    const headline = await page
      .locator('[data-testid="journey-content"] .svika-headline')
      .first()
      .textContent()
      .catch(() => "?");
    console.log(
      `    arrived not reached; stage=${await readStage()} headline=${headline}`,
    );
    console.log(
      `    leg2Vehicle.id=${leg2Vehicle.id} broadcast=${broadcastLeg2.lat},${broadcastLeg2.lng}`,
    );
    const mapVehicle = await page.evaluate((vid: string) => {
      type W = {
        __svikaMap?: {
          getSource: (id: string) => {
            _data?: {
              features?: Array<{
                properties?: { vehicle_id?: string };
                geometry?: { coordinates?: [number, number] };
              }>;
            };
          };
        };
      };
      const map = (window as unknown as W).__svikaMap;
      const src = map?.getSource("svika-kombis");
      const feats = src?._data?.features ?? [];
      const f = feats.find((x) => x.properties?.vehicle_id === vid);
      return f?.geometry?.coordinates ?? null;
    }, leg2Vehicle.id);
    console.log(`    map source coords for ${leg2Vehicle.id}: ${JSON.stringify(mapVehicle)}`);
  }
  await page.waitForSelector('[data-testid="journey-arrived"]', {
    timeout: 5_000,
  });
  await arrivedChannel.unsubscribe();
  // applyArrivedBounds runs 600ms — wait through it + tile fade.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS.arrived });
  console.log(`    wrote ${SHOTS.arrived}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-Z2 FAILED]", err);
  process.exit(1);
});
