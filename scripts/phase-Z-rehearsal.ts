/**
 * Phase Z rehearsal — verifies the simulate-buttons + completable-journey
 * flow on a real (mobile-sized) browser without a sim runner in the loop.
 *
 *   1. kombis-seeded         — fresh page load, 8 kombi markers visible at
 *                              last-known positions.
 *   2. walk-to-board         — after booking Heights→Avondale, journey card
 *                              at FULL snap with the rust simulate button.
 *   3. in-transit            — after one tap of "Simulate boarding", stage
 *                              advanced past the boarding flash.
 *   4. arrived               — after enough taps to reach the final
 *                              drop-off, half-snap arrived summary with the
 *                              fleet impact disclosure visible.
 *   5. drawer-with-more-hint — idle state showing the persona chip's new
 *                              "More ⌄" hint (drawer not opened).
 *
 * Run: pnpm dev (terminal 1), no sim required, then
 *      npx tsx --env-file=.env.local scripts/phase-Z-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  kombisSeeded: join(SCREENSHOT_DIR, "phase-Z-rehearsal-1-kombis-seeded.png"),
  walkToBoard: join(SCREENSHOT_DIR, "phase-Z-rehearsal-2-walk-to-board.png"),
  inTransit: join(SCREENSHOT_DIR, "phase-Z-rehearsal-3-in-transit.png"),
  arrived: join(SCREENSHOT_DIR, "phase-Z-rehearsal-4-arrived.png"),
  moreHint: join(
    SCREENSHOT_DIR,
    "phase-Z-rehearsal-5-drawer-with-more-hint.png",
  ),
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
  console.log(`\n[phase-Z] ${message}`);
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

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // ---- 1. kombis-seeded — drained Takunda, fresh load, no sim ----
  log("1. drain Takunda + fresh page load → kombi markers seeded");
  await drainTakunda(client);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  // Wait for the map and idle sheet content (no journey yet).
  await page.waitForSelector('[data-testid="journey-sheet"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS.kombisSeeded });
  console.log(`    wrote ${SHOTS.kombisSeeded}`);

  // ---- 5. drawer-with-more-hint — same idle state, persona chip visible ----
  log("5. capture persona chip + 'More ⌄' hint on idle surface");
  await page.screenshot({ path: SHOTS.moreHint });
  console.log(`    wrote ${SHOTS.moreHint}`);

  // ---- 2. walk-to-board — DB-book a 2-leg trip → reload ----
  log("2. DB-book Heights→Avondale → walk-to-board card");
  const takundaId = await drainTakunda(client);
  const booking = await bookViaDb(client, takundaId);
  console.log(`    trip=${booking.trip_id}`);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  await page.waitForSelector('[data-testid="journey-simulate-next"]', {
    timeout: 10_000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  // ---- 3. in-transit — tap once, wait past flash window ----
  log("3. tap Simulate boarding → past flash → in-transit");
  await page.click('[data-testid="journey-simulate-next"]');
  // Boarding flash window is ~1.1s; wait through it + revalidation.
  await page.waitForTimeout(2500);
  await page.waitForSelector(
    '[data-stage="in-transit"], [data-stage="boarding"]',
    { timeout: 15_000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS.inTransit });
  console.log(`    wrote ${SHOTS.inTransit}`);

  // ---- 4. arrived — three more taps to walk through the rest of the trip ----
  log("4. tap through to arrived");
  for (let i = 0; i < 3; i += 1) {
    const button = page.locator('[data-testid="journey-simulate-next"]');
    if ((await button.count()) === 0) break;
    await button.click();
    await page.waitForTimeout(2500);
  }
  await page.waitForSelector('[data-testid="journey-arrived"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS.arrived });
  console.log(`    wrote ${SHOTS.arrived}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-Z FAILED]", err);
  process.exit(1);
});
