/**
 * Phase E rehearsal — verifies the journey-card refinements:
 *   1. walk-to-board   — driver chip with the new "Vehicle assigned when
 *                         your code clears" line (no "—" placeholder),
 *                         outlined-ring stage icon, teal-700 progress bar,
 *                         rust mono code in the footer.
 *   2. in-transit      — chip's vehicle line shows the real plate, the
 *                         "Arriving in N min" readout uses --color-accent.
 *   3. map-active-route — full mobile screenshot showing the active route
 *                         polyline in teal-700 with white halo; rust on the
 *                         map confined to the moving kombi marker and the
 *                         walking-transfer dashed line.
 *
 * Run: pnpm dev (terminal 1), pnpm sim (terminal 2), then
 *      npx tsx --env-file=.env.local scripts/phase-E-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  walkToBoard: join(SCREENSHOT_DIR, "phase-E-rehearsal-1-walk-to-board.png"),
  inTransit: join(SCREENSHOT_DIR, "phase-E-rehearsal-2-in-transit.png"),
  mapActive: join(SCREENSHOT_DIR, "phase-E-rehearsal-3-map-active-route.png"),
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

function log(label: string): void {
  console.log(`\n[phase-E] ${label}`);
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
): Promise<{ trip_id: string; leg1Id: string; leg1Code: string }> {
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
  ): Promise<{ id: string; code: string }> {
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
        .select("id, access_code")
        .single();
      if (!error && data) return { id: data.id, code: data.access_code };
      if (error && error.code !== "23505") {
        throw new Error("ticket insert failed: " + error.message);
      }
    }
    throw new Error("could not allocate access code");
  }

  const leg1 = await insertTicket(LEG1_ROUTE, LEG1_BOARD, LEG1_ALIGHT, 1);
  await client
    .from("trip_tickets")
    .insert({ trip_id, ticket_id: leg1.id, sequence: 0 });
  const leg2 = await insertTicket(LEG2_ROUTE, LEG2_BOARD, LEG2_ALIGHT, 0.5);
  await client
    .from("trip_tickets")
    .insert({ trip_id, ticket_id: leg2.id, sequence: 1 });

  await client
    .from("users")
    .update({ credit_balance_usd: 3.5 })
    .eq("id", takundaId);

  return { trip_id, leg1Id: leg1.id, leg1Code: leg1.code };
}

async function pinFirstAvailableVehicle(
  client: SupabaseClient<Database>,
  ticketId: string,
): Promise<string | null> {
  // Pick a kombi running on the leg1 route so the journey card resolves a
  // plate without waiting for a hwindi PIN-clear. Mirror the redemption
  // sequence end-state: status=redeemed + vehicle_id set + redeemed_at.
  const { data: vehicle } = await client
    .from("vehicles")
    .select("id")
    .eq("route_id", LEG1_ROUTE)
    .limit(1)
    .maybeSingle();
  if (!vehicle) return null;
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: vehicle.id,
      redeemed_at: new Date().toISOString(),
      payment_method: "wallet",
    })
    .eq("id", ticketId);
  return vehicle.id;
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

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // ---- 1. walk-to-board (no plate yet, "vehicle assigned when …" line) ----
  log("1. drain + DB-book (no PIN cleared) → walk-to-board card");
  const takundaId = await drainTakunda(client);
  const booking = await bookViaDb(client, takundaId);
  console.log(`    trip=${booking.trip_id} leg1Code=${booking.leg1Code}`);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  // ---- 2. in-transit (plate now pinned, accent ETA readout) ----
  log("2. pin a vehicle to leg1 (simulated PIN clear) → in-transit card");
  const vehicleId = await pinFirstAvailableVehicle(client, booking.leg1Id);
  if (!vehicleId) {
    console.log("    no vehicles on leg1 route — keeping walk-to-board state");
  } else {
    console.log(`    pinned vehicle ${vehicleId}`);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOTS.inTransit });
  console.log(`    wrote ${SHOTS.inTransit}`);

  // ---- 3. map-active-route (same surface, full mobile shot) ----
  log("3. capture full-screen view showing active polyline");
  await page.screenshot({ path: SHOTS.mapActive, fullPage: false });
  console.log(`    wrote ${SHOTS.mapActive}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-E FAILED]", err);
  process.exit(1);
});
