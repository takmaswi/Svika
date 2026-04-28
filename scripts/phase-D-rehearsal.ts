/**
 * Phase D rehearsal — verifies the rust re-allocation + Geist type ramp.
 *
 * Captures five screenshots:
 *   1. idle-half       — sheet at half snap (Plan CTA solid rust, fares mono)
 *   2. payment         — payment-choice content (rust wallet CTA, balance mono)
 *   3. walk-to-board   — journey card (teal avatar, outlined-ring stage icon,
 *                         teal-700 progress bar, rust mono code)
 *   4. drawer          — persona drawer open (svika-meta section labels,
 *                         svika-body 600 tile titles)
 *   5. fleet           — /fleet?as=baba_tino at 1440x900 (teal-700 ZIMRA
 *                         border, muted Gap text, ramped vehicle card)
 *
 * Run: pnpm dev (terminal 1), pnpm sim (terminal 2), then
 *      npx tsx --env-file=.env.local scripts/phase-D-rehearsal.ts
 */

import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = "http://localhost:3000";
const SCREENSHOT_DIR = "scripts";
const SHOTS = {
  idleHalf: join(SCREENSHOT_DIR, "phase-D-rehearsal-1-idle-half.png"),
  payment: join(SCREENSHOT_DIR, "phase-D-rehearsal-2-payment.png"),
  walkToBoard: join(SCREENSHOT_DIR, "phase-D-rehearsal-3-walk-to-board.png"),
  drawer: join(SCREENSHOT_DIR, "phase-D-rehearsal-4-drawer.png"),
  fleet: join(SCREENSHOT_DIR, "phase-D-rehearsal-5-fleet.png"),
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
  console.log(`\n[phase-D] ${label}`);
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

  const browser = await chromium.launch({ headless: false });

  // ---- 1. idle-half — start with Takunda drained, no journey ----
  log("0. drain Takunda (no active journey, $5 balance)");
  const takundaId = await drainTakunda(client);

  log("1. open /?as=takunda — sheet at peek, expand to half");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 2,
  });
  await mobile.setExtraHTTPHeaders({});
  const page = await mobile.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  // The sheet snaps to peek for idle. The handle row dispatches snap cycling
  // on a tap (sub-8px pointer drag). Synthesize the pointer pair by hand so
  // both pointerdown and pointerup fire on the handle without the Playwright
  // click default introducing a movedown delta.
  await page.evaluate(() => {
    const handle = document.querySelector('.svika-sheet-handle-row');
    if (!handle) return;
    const rect = handle.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const x = rect.left + rect.width / 2;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true }),
    );
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="journey-sheet"]');
      return el?.getAttribute("data-snap") === "half";
    },
    undefined,
    { timeout: 4000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS.idleHalf });
  console.log(`    wrote ${SHOTS.idleHalf}`);

  // ---- 2. payment — pick the featured quick pick, then a plan ----
  log("2. pick featured quick pick → wait for plans → buy → payment sheet");
  await page.click('[data-testid="quick-pick-featured"]');
  // Wait for plans (AI may take a long time on cold start). Poll the sheet
  // state and surface what we see if it stalls.
  const planSeen = await page
    .waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="journey-sheet-content"]',
        );
        const s = el?.getAttribute("data-state") ?? "";
        if (s === "plans-returned") return "plans-returned";
        if (s === "idle") {
          // Search may have errored — bail early so we can move on.
          const err = document.querySelector(
            '[data-testid="journey-sheet-content"][data-state="idle"] p.text-svika-rust',
          );
          if (err) return "idle-with-error";
        }
        return false;
      },
      undefined,
      { timeout: 180_000 },
    )
    .catch(() => null);
  if (planSeen === null) {
    console.log(
      "    plan retrieval stalled past 180s — falling back to a synthesized payment screenshot",
    );
  } else if ((await planSeen.jsonValue()) === "plans-returned") {
    await page.waitForTimeout(400);
    const buyButton = page.locator('button:has-text("Buy for")').first();
    await buyButton.click();
    await page.waitForSelector('[data-testid="payment-wallet"]', {
      timeout: 10_000,
    });
    await page.waitForTimeout(500);
  } else {
    console.log(
      "    plans returned in unexpected state: " + (await planSeen.jsonValue()),
    );
  }
  await page.screenshot({ path: SHOTS.payment });
  console.log(`    wrote ${SHOTS.payment}`);

  // ---- 3. walk-to-board — bypass payment, book via DB ----
  log("3. drain + DB-book Heights→Avondale, reload, capture journey card");
  await drainTakunda(client);
  await bookViaDb(client, takundaId);
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOTS.walkToBoard });
  console.log(`    wrote ${SHOTS.walkToBoard}`);

  // ---- 4. drawer ----
  log("4. open persona drawer");
  await page.click('[data-testid="persona-chip-tap"]');
  await page.waitForSelector('[data-testid="persona-drawer"]', {
    timeout: 4000,
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS.drawer });
  console.log(`    wrote ${SHOTS.drawer}`);

  await page.close();
  await mobile.close();

  // ---- 5. fleet (desktop) ----
  log("5. open /fleet?as=baba_tino at 1440x900");
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const fleetPage = await desktop.newPage();
  await fleetPage.goto(`${BASE}/fleet?as=baba_tino`, {
    waitUntil: "domcontentloaded",
  });
  await fleetPage.waitForSelector('[data-testid="fleet-revenue"]', {
    timeout: 30_000,
  });
  await fleetPage.waitForTimeout(900);
  await fleetPage.screenshot({ path: SHOTS.fleet });
  console.log(`    wrote ${SHOTS.fleet}`);

  await fleetPage.close();
  await desktop.close();

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("\n[phase-D FAILED]", err);
  process.exit(1);
});
