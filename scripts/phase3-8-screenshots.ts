/**
 * Phase 3.8 — capture six rehearsal screenshots that prove the single-user
 * narrative pivot is live.
 *
 *   1. Brand landing with single "Continue as Takunda" CTA.
 *   2. Passenger empty-state with "Where to, Takunda?" headline.
 *   3. Journey sheet at stage 1 (walk-to-board).
 *   4. Fare-cleared toast (booted from a TICKET_REDEEMED_EVENT broadcast).
 *   5. Journey arrived collapse sheet with the fleet-impact line collapsed.
 *   6. Same arrived sheet with the fleet-impact mini-card expanded.
 *
 * Drives prod (BASE = https://svika.vercel.app) by default. Set BASE in env
 * to point at localhost during dev. Reuses the same DB-driven booking pattern
 * as the Phase 3.5 rehearsal.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase3-8-screenshots.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import {
  SIM_CHANNEL,
  SIM_EVENT,
  TICKET_REDEEMED_EVENT,
  type KombiTickPayload,
} from "@/lib/sim/simRunner";
import type { Database } from "@/lib/supabase/types";

const BASE = process.env.BASE ?? "https://svika.vercel.app";
const OUT_DIR = join("scripts", "phase3-8-screenshots");

const LEG1_VEHICLE = "ZH 4821";
const LEG1_ROUTE = "route_heights_rezende";
const LEG2_VEHICLE = "ZH 5101";
const LEG2_ROUTE = "route_westgate_copa_segment";

// Stops referenced by the Lomagundi walking-transfer plan.
const ORIGIN_STOP = "sp_heights_start_north";
const LEG1_BOARD = "sp_heights_start_north";
const LEG1_ALIGHT = "sp_second_lomagundi";
const LEG2_BOARD = "sp_lomagundi_kinggeorge_pickup";
const LEG2_ALIGHT = "sp_avondale_shops";
const DEST_STOP = "sp_avondale_shops";
const PLAN_LABEL = "Lomagundi walking transfer (fastest)";
const PLAN_TOTAL_FARE = 1.5;
const PLAN_TOTAL_DURATION = 31;

const STOP_HEIGHTS_NORTH: [number, number] = [-17.7498, 31.0425];
const STOP_SECOND_LOMAGUNDI: [number, number] = [-17.7936, 31.0528];
const STOP_LOMAGUNDI_KG: [number, number] = [-17.7939, 31.0484];
const STOP_AVONDALE: [number, number] = [-17.80321, 31.03702];

function pointWkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

function tickPayload(
  vehicle_id: string,
  route_id: string,
  lat: number,
  lng: number,
): KombiTickPayload {
  return {
    vehicle_id,
    route_id,
    lat,
    lng,
    direction: "outbound",
    bearing: 180,
    progressMeters: 0,
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

async function broadcastTicketRedeemed(
  client: SupabaseClient<Database>,
  payload: {
    ticket_id: string;
    vehicle_id: string;
    route_id: string;
    current_holder_user_id: string | null;
    redeemed_at: string;
  },
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
  await channel.send({
    type: "broadcast",
    event: TICKET_REDEEMED_EVENT,
    payload,
  });
  await client.removeChannel(channel);
}

async function moveVehicle(
  client: SupabaseClient<Database>,
  vehicleId: string,
  routeId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await client
    .from("vehicles")
    .update({
      current_position: pointWkt(lat, lng),
      direction: "outbound",
      last_position_at: new Date().toISOString(),
    })
    .eq("id", vehicleId);
  await broadcastTicks(client, [tickPayload(vehicleId, routeId, lat, lng)]);
}

async function bumpPassengerCount(
  client: SupabaseClient<Database>,
  vehicleId: string,
): Promise<void> {
  const { data } = await client
    .from("vehicles")
    .select("current_passenger_count, capacity_seats")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!data) return;
  const next = Math.min(data.capacity_seats, data.current_passenger_count + 1);
  await client
    .from("vehicles")
    .update({ current_passenger_count: next })
    .eq("id", vehicleId);
}

async function ensureFaraiOnLeg1(client: SupabaseClient<Database>): Promise<void> {
  const { data: farai } = await client
    .from("users")
    .select("id")
    .eq("name", "Farai")
    .maybeSingle();
  if (!farai) throw new Error("Farai user missing");
  await client
    .from("vehicles")
    .update({ current_conductor_id: farai.id })
    .eq("id", LEG1_VEHICLE);
}

async function drainTakunda(client: SupabaseClient<Database>): Promise<string> {
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

interface BookingResult {
  trip_id: string;
  leg1: { id: string; code: string };
  leg2: { id: string; code: string };
}

async function bookViaDb(
  client: SupabaseClient<Database>,
  takundaId: string,
): Promise<BookingResult> {
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
  if (tripErr || !tripData) throw new Error("trip insert failed: " + tripErr?.message);
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
  await client.from("trip_tickets").insert({ trip_id, ticket_id: leg1.id, sequence: 0 });
  const leg2 = await insertTicket(LEG2_ROUTE, LEG2_BOARD, LEG2_ALIGHT, 0.5);
  await client.from("trip_tickets").insert({ trip_id, ticket_id: leg2.id, sequence: 1 });

  await client
    .from("users")
    .update({ credit_balance_usd: 3.5 })
    .eq("id", takundaId);

  return { trip_id, leg1, leg2 };
}

async function shoot(page: Page, name: string): Promise<void> {
  const path = join(OUT_DIR, name);
  await page.screenshot({ path });
  console.log(`  wrote ${path}`);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing supabase env vars");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  mkdirSync(OUT_DIR, { recursive: true });

  await ensureFaraiOnLeg1(client);
  const takundaId = await drainTakunda(client);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err.message));

  console.log("[shot] 1 — landing (Continue as Takunda)");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Continue as Takunda", { timeout: 15_000 });
  await page.waitForTimeout(900);
  await shoot(page, "01-landing-continue-takunda.png");

  console.log("[shot] 2 — empty state (Where to, Takunda?)");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]');
  await page.waitForTimeout(1100);
  await shoot(page, "02-empty-state-where-to-takunda.png");

  console.log("[shot] 3 — book trip via DB, walk-to-board sheet");
  const booking = await bookViaDb(client, takundaId);
  console.log(`    trip=${booking.trip_id} leg1=${booking.leg1.code} leg2=${booking.leg2.code}`);
  // Position vehicle so the assigned-vehicle halo locks on.
  await moveVehicle(
    client,
    LEG1_VEHICLE,
    LEG1_ROUTE,
    STOP_HEIGHTS_NORTH[0] - 0.005,
    STOP_HEIGHTS_NORTH[1],
  );
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-sheet"]', { timeout: 30_000 });
  await page.waitForTimeout(900);
  await shoot(page, "03-journey-walk-to-board.png");

  console.log("[shot] 4 — fare-cleared toast (broadcast → toast)");
  // Mark leg 1 redeemed in the DB so refresh-driven server state agrees.
  const redeemedAt = new Date().toISOString();
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: LEG1_VEHICLE,
      redeemed_at: redeemedAt,
    })
    .eq("id", booking.leg1.id);
  await bumpPassengerCount(client, LEG1_VEHICLE);
  await broadcastTicketRedeemed(client, {
    ticket_id: booking.leg1.id,
    vehicle_id: LEG1_VEHICLE,
    route_id: LEG1_ROUTE,
    current_holder_user_id: takundaId,
    redeemed_at: redeemedAt,
  });
  // Toast is fetched async; give it 1.5s to appear, then capture before the
  // 4s auto-dismiss timer fires.
  await page
    .waitForSelector('[data-testid="fare-cleared-toast"]', { timeout: 8_000 })
    .catch(() => null);
  await shoot(page, "04-fare-cleared-toast.png");

  console.log("[shot] 5 — drive trip to arrival, capture collapsed arrived sheet");
  // Move leg-1 vehicle to the alight stop so the journey advances to the
  // walking-transfer; then redeem leg 2 and park leg-2 vehicle at the
  // destination so deriveJourneyStage settles into 'arrived'.
  await moveVehicle(
    client,
    LEG1_VEHICLE,
    LEG1_ROUTE,
    STOP_SECOND_LOMAGUNDI[0],
    STOP_SECOND_LOMAGUNDI[1],
  );
  await page.waitForTimeout(800);
  // Park leg-2 at the King George pickup so the boarding flash fires before
  // we redeem leg 2.
  await moveVehicle(
    client,
    LEG2_VEHICLE,
    LEG2_ROUTE,
    STOP_LOMAGUNDI_KG[0],
    STOP_LOMAGUNDI_KG[1],
  );
  const redeemed2At = new Date().toISOString();
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: LEG2_VEHICLE,
      redeemed_at: redeemed2At,
    })
    .eq("id", booking.leg2.id);
  await broadcastTicketRedeemed(client, {
    ticket_id: booking.leg2.id,
    vehicle_id: LEG2_VEHICLE,
    route_id: LEG2_ROUTE,
    current_holder_user_id: takundaId,
    redeemed_at: redeemed2At,
  });
  await page.waitForTimeout(800);
  // Drive leg 2 vehicle to the destination so deriveJourneyStage advances to
  // 'arrived'. Two ticks help the client cache settle on the final position.
  for (let i = 0; i < 2; i += 1) {
    await moveVehicle(
      client,
      LEG2_VEHICLE,
      LEG2_ROUTE,
      STOP_AVONDALE[0],
      STOP_AVONDALE[1],
    );
    await page.waitForTimeout(600);
  }
  await page.waitForSelector('[data-testid="journey-arrived"]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await shoot(page, "05-arrived-collapsed-fleet-impact.png");

  console.log("[shot] 6 — fleet-impact mini-card expanded");
  // Click the disclosure to expand the inline mini-card.
  await page.click('[data-testid="fleet-impact"] button');
  await page.waitForTimeout(1500);
  await shoot(page, "06-arrived-fleet-impact-expanded.png");

  await browser.close();
  console.log("[done] 6 screenshots in scripts/phase3-8-screenshots/");
}

main().catch((err) => {
  console.error("\n[shots FAILED]", err);
  process.exit(1);
});
