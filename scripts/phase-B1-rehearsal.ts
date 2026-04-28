/**
 * Phase B.1 hotfix rehearsal — verifies that the journey card now appears
 * on the sheet when a passenger has an active trip, instead of the sheet
 * sticking on idle (the chicken-and-egg deadlock between sheetState and
 * Journey-mount-driven stage state).
 *
 * Bypasses the AI trip-planner step by booking via DB (same pattern as
 * scripts/phase3-8-screenshots.ts → bookViaDb), so cold-start Ollama can't
 * gate the rehearsal.
 *
 * Captures:
 *   1. walk-to-board — sheet at half snap with journey card content
 *      (driver chip, stage line, access code, drop-off line, progress bar)
 *   2. arrived       — best-effort: ends the trip via the × control to
 *      land on the post-trip surface so the sheet content router exits
 *      the active-journey state cleanly.
 *
 * Run: pnpm dev (terminal 1), pnpm sim (terminal 2), then
 *      npx tsx --env-file=.env.local scripts/phase-B1-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  walkToBoard: join(SCREENSHOT_DIR, "phase-B1-rehearsal-1-walk-to-board.png"),
  arrived: join(SCREENSHOT_DIR, "phase-B1-rehearsal-2-arrived.png"),
};

// Heights → Avondale featured plan (Lomagundi walking transfer).
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
  console.log(`\n[phase-B.1] ${label}`);
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
): Promise<{ trip_id: string; leg1Code: string }> {
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

  return { trip_id, leg1Code: leg1.code };
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

  log("0. drain Takunda then book via DB (no AI involvement)");
  const takundaId = await drainTakunda(client);
  const booking = await bookViaDb(client, takundaId);
  console.log(`    trip=${booking.trip_id} leg1Code=${booking.leg1Code}`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console error]", msg.text());
  });

  log("1. open /?as=takunda — sheet should land directly on walk-to-board");
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  // Phase B.1 regression check: the sheet should NOT show idle.
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  // The shell defaults sheetState to walk-to-board until the Journey
  // component pushes a refined stage up. After Journey mounts and computes
  // a stage, the data-state can refine to in-transit / walking-transfer /
  // boarding-leg-2 — any active-journey state is the regression-clear
  // signal. Tolerate either.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="journey-sheet-content"]');
      const s = el?.getAttribute("data-state") ?? "";
      return [
        "walk-to-board",
        "in-transit",
        "walking-transfer",
        "boarding-leg-2",
      ].includes(s);
    },
    undefined,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="journey-sheet"]');
      return el?.getAttribute("data-snap") === "half";
    },
    undefined,
    { timeout: 4000 },
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  log("2. arrived (best-effort) — end trip via × control");
  const endButton = page.locator('[data-testid="journey-end-ask"]');
  if ((await endButton.count()) > 0) {
    await endButton.click();
    const confirm = page.locator('[data-testid="journey-end-confirm"]');
    if ((await confirm.count()) > 0) {
      await confirm.click();
      await page.waitForTimeout(900);
    }
  }
  await page.screenshot({ path: SHOTS.arrived });
  console.log(`    wrote ${SHOTS.arrived}`);

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-B.1 FAILED]", err);
  process.exit(1);
});
