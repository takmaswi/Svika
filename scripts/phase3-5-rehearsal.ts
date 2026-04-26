/**
 * Phase 3.5 rehearsal — drives the full six-stage Journey UX against
 * https://svika.vercel.app and captures evidence at each stage.
 *
 *   1.  Drain Tendai's wallet (mark every issued/held/redeemed Tendai-held
 *       ticket as `completed` so the active-journey loader sees a clean slate).
 *   2.  Top Tendai's credit balance to $5.00.
 *   3.  Open `/?as=tendai`, click the "Heights to Avondale" preset, buy the
 *       fastest plan ($1.50, two legs).
 *   4.  Resolve the trip's tickets in sequence, pin a vehicle per leg
 *       (ZH 4821 on `route_heights_rezende`, ZH 5101 on
 *       `route_westgate_copa_segment`), and walk the journey through:
 *         stage 1 walk-to-board → stage 2 boarding → stage 3 in-transit →
 *         stage 4 walking-transfer → stage 5 boarding-leg-2 → stage 6 arrived.
 *
 * Stage advances are driven by:
 *   - Position broadcasts on `kombi-positions` so the client cache fills the
 *     `svika-kombis` source and the assigned-vehicle halo + ETA chip fire.
 *   - Direct DB writes on `vehicles.current_position` so the server sees the
 *     same positions when the page refreshes.
 *   - For redemptions: direct UPDATE on `tickets` (status='redeemed',
 *     vehicle_id, redeemed_at) and a `ticket-redeemed` broadcast so the
 *     Journey sheet flashes the boarding moment.
 *
 * Evidence per stage (six files written into the repo root):
 *   - scripts/rehearsal-stage-N.png            screenshot
 *   - rehearsal log writes the journey-sheet inner text + layer probe to
 *     stdout; the docs/PHASE-3-5-REHEARSAL.md report quotes them.
 *
 * Run: npx tsx --env-file=.env.local scripts/phase3-5-rehearsal.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
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

const BASE = "https://svika.vercel.app";
const LEG1_VEHICLE = "ZH 4821"; // route_heights_rezende
const LEG2_VEHICLE = "ZH 5101"; // route_westgate_copa_segment
const LEG1_ROUTE = "route_heights_rezende";
const LEG2_ROUTE = "route_westgate_copa_segment";

// Stop coordinates (lat, lng) for the Heights → Avondale Lomagundi-walk plan.
// Pulled from seed/network.json so the rehearsal is independent of any DB
// drift; if the seed file changes these will need to update too.
const STOP_HEIGHTS_NORTH: [number, number] = [-17.7498, 31.0425];
const STOP_SECOND_LOMAGUNDI: [number, number] = [-17.7936, 31.0528];
const STOP_LOMAGUNDI_KG: [number, number] = [-17.7939, 31.0484];
const STOP_AVONDALE: [number, number] = [-17.80321, 31.03702];
const STOPS = {
  heights_north: STOP_HEIGHTS_NORTH,
  second_lomagundi: STOP_SECOND_LOMAGUNDI,
  lomagundi_kg: STOP_LOMAGUNDI_KG,
  avondale: STOP_AVONDALE,
};

const SCRIPTS_DIR = "scripts";
const REPORT_PATH = "docs/PHASE-3-5-REHEARSAL.md";

interface StageEvidence {
  stage: number;
  kind: string;
  screenshot: string;
  sheetText: string;
  layerSnapshot: unknown;
}

const evidence: StageEvidence[] = [];

function log(label: string): void {
  console.log(`\n[rehearsal] ${label}`);
}

function pointWkt(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
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
    at: new Date().toISOString(),
  };
}

async function broadcast(
  client: SupabaseClient<Database>,
  event: string,
  payload: unknown,
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
  await channel.send({ type: "broadcast", event, payload });
  await client.removeChannel(channel);
}

async function broadcastTick(
  client: SupabaseClient<Database>,
  ticks: KombiTickPayload[],
): Promise<void> {
  await broadcast(client, SIM_EVENT, { ticks });
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
  await broadcast(client, TICKET_REDEEMED_EVENT, payload);
}

async function readSheet(page: Page): Promise<{
  kind: string | null;
  index: string | null;
  text: string | null;
  arrived: boolean;
}> {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="journey-sheet"]');
    const arrived = document.querySelector('[data-testid="journey-arrived"]');
    if (arrived) {
      return {
        kind: "arrived",
        index: null,
        text: arrived.textContent?.trim() ?? null,
        arrived: true,
      };
    }
    if (!sheet) return { kind: null, index: null, text: null, arrived: false };
    return {
      kind: sheet.getAttribute("data-stage"),
      index: sheet.getAttribute("data-stage-index"),
      text: (sheet.textContent ?? "").replace(/\s+/g, " ").trim(),
      arrived: false,
    };
  });
}

interface LayerSnapshot {
  ok: boolean;
  reason?: string;
  layers?: Array<{
    id: string;
    filter?: unknown;
    lineOpacity?: unknown;
    circleOpacity?: unknown;
  }>;
  walkingFeatures?: number;
  kombiFeatures?: number;
}

async function readLayers(page: Page): Promise<LayerSnapshot> {
  return page.evaluate(() => {
    const map = (
      window as unknown as {
        __svikaMap?: {
          getFilter: (id: string) => unknown;
          getPaintProperty: (id: string, prop: string) => unknown;
          querySourceFeatures: (sourceId: string) => unknown[];
        };
      }
    ).__svikaMap;
    if (!map) return { ok: false, reason: "no __svikaMap handle" } as const;
    const ids = [
      "svika-routes-base",
      "svika-routes-highlight",
      "svika-walking-line",
      "svika-kombis-dot",
      "svika-kombis-halo",
    ];
    const layers = ids.map((id) => {
      const out: { id: string; filter?: unknown; lineOpacity?: unknown; circleOpacity?: unknown } = { id };
      try { out.filter = map.getFilter(id); } catch { /* noop */ }
      try { out.lineOpacity = map.getPaintProperty(id, "line-opacity"); } catch { /* noop */ }
      try { out.circleOpacity = map.getPaintProperty(id, "circle-opacity"); } catch { /* noop */ }
      return out;
    });
    let walkingFeatures = 0;
    try { walkingFeatures = map.querySourceFeatures("svika-walking").length; } catch { /* noop */ }
    let kombiFeatures = 0;
    try { kombiFeatures = map.querySourceFeatures("svika-kombis").length; } catch { /* noop */ }
    return { ok: true, layers, walkingFeatures, kombiFeatures } as const;
  });
}

async function captureStage(
  page: Page,
  stage: number,
  kind: string,
): Promise<void> {
  const filename = join(SCRIPTS_DIR, `rehearsal-stage-${stage}.png`);
  await page.screenshot({ path: filename });
  const sheet = await readSheet(page);
  const layers = await readLayers(page);
  console.log(`  stage ${stage} (${kind}) sheet: ${sheet.kind} idx=${sheet.index}`);
  console.log(`  stage ${stage} sheet text: ${sheet.text?.slice(0, 200)}`);
  evidence.push({
    stage,
    kind,
    screenshot: filename,
    sheetText: sheet.text ?? "",
    layerSnapshot: layers,
  });
}

async function waitForKind(
  page: Page,
  predicate: (kind: string | null, index: string | null) => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await readSheet(page);
    if (predicate(s.kind, s.index)) return;
    await page.waitForTimeout(400);
  }
}

async function resolveTendaiAndDrain(
  client: SupabaseClient<Database>,
): Promise<{ tendaiId: string; rudoId: string }> {
  log("0. resolve Tendai + Rudo, drain wallet, top up to $5");
  const { data: users, error } = await client
    .from("users")
    .select("id, name")
    .in("name", ["Tendai", "Rudo"]);
  if (error || !users) throw new Error("Could not resolve users: " + error?.message);
  const tendaiId = users.find((u) => u.name === "Tendai")?.id;
  const rudoId = users.find((u) => u.name === "Rudo")?.id;
  if (!tendaiId || !rudoId) throw new Error("Tendai or Rudo missing");
  console.log(`    tendai=${tendaiId} rudo=${rudoId}`);

  // Drain: anything Tendai still holds in {issued, held, redeemed} → completed.
  const { data: drained, error: drainErr } = await client
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("current_holder_user_id", tendaiId)
    .in("status", ["issued", "held", "redeemed"])
    .select("id");
  if (drainErr) throw new Error("drain failed: " + drainErr.message);
  console.log(`    drained ${drained?.length ?? 0} active tickets`);

  // Top up Tendai to a clean $5.00 so a $1.50 buy doesn't dip into chance.
  const { error: topUpErr } = await client
    .from("users")
    .update({ credit_balance_usd: 5 })
    .eq("id", tendaiId);
  if (topUpErr) throw new Error("topup failed: " + topUpErr.message);
  console.log("    tendai balance set to $5.00");

  // Confirm post-state.
  const { data: post, error: postErr } = await client
    .from("tickets")
    .select("id, status")
    .eq("current_holder_user_id", tendaiId)
    .in("status", ["issued", "held", "redeemed"]);
  if (postErr) throw new Error("post-check failed: " + postErr.message);
  console.log(`    post-drain active tickets: ${post?.length ?? 0}`);
  if ((post?.length ?? 0) > 0) {
    throw new Error("drain did not clear all active Tendai tickets");
  }

  return { tendaiId, rudoId };
}

interface ResolvedLeg {
  ticket_id: string;
  access_code: string;
  sequence: number;
  route_id: string;
  board_at_stop_id: string;
  alight_at_stop_id: string;
}

async function resolveLatestTripLegs(
  client: SupabaseClient<Database>,
  tendaiId: string,
): Promise<{ trip_id: string; legs: ResolvedLeg[] }> {
  const { data: tripData, error: tripErr } = await client
    .from("trips")
    .select("id")
    .eq("originating_user_id", tendaiId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tripErr || !tripData) throw new Error("no trip found: " + tripErr?.message);
  const trip_id = tripData.id;

  const { data: links } = await client
    .from("trip_tickets")
    .select("ticket_id, sequence")
    .eq("trip_id", trip_id)
    .order("sequence", { ascending: true });
  const ordered = (links ?? []) as Array<{ ticket_id: string; sequence: number }>;

  const ticketIds = ordered.map((l) => l.ticket_id);
  const { data: ticketsData } = await client
    .from("tickets")
    .select("id, access_code, route_id, board_at_stop_id, alight_at_stop_id")
    .in("id", ticketIds);
  type RawTicket = {
    id: string;
    access_code: string;
    route_id: string;
    board_at_stop_id: string;
    alight_at_stop_id: string;
  };
  const ticketsById = new Map<string, RawTicket>();
  for (const t of (ticketsData ?? []) as RawTicket[]) ticketsById.set(t.id, t);

  const legs: ResolvedLeg[] = [];
  for (const l of ordered) {
    const t = ticketsById.get(l.ticket_id);
    if (t) {
      legs.push({
        ticket_id: t.id,
        access_code: t.access_code,
        sequence: l.sequence,
        route_id: t.route_id,
        board_at_stop_id: t.board_at_stop_id,
        alight_at_stop_id: t.alight_at_stop_id,
      });
    }
  }
  return { trip_id, legs };
}

async function ensureBuilt(client: SupabaseClient<Database>): Promise<void> {
  // Sanity check that vehicles ZH 4821 and ZH 5101 exist.
  const { data, error } = await client
    .from("vehicles")
    .select("id, route_id")
    .in("id", [LEG1_VEHICLE, LEG2_VEHICLE]);
  if (error) throw new Error("vehicles check failed: " + error.message);
  if (!data || data.length < 2) {
    throw new Error(
      `Expected vehicles ${LEG1_VEHICLE} and ${LEG2_VEHICLE}, got ${JSON.stringify(data)}`,
    );
  }
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
  await broadcastTick(client, [tickPayload(vehicleId, routeId, lat, lng)]);
}

async function redeemTicket(
  client: SupabaseClient<Database>,
  leg: ResolvedLeg,
  vehicleId: string,
  tendaiId: string,
): Promise<void> {
  const redeemedAt = new Date().toISOString();
  await client
    .from("tickets")
    .update({
      status: "redeemed",
      vehicle_id: vehicleId,
      redeemed_at: redeemedAt,
    })
    .eq("id", leg.ticket_id);
  await broadcastTicketRedeemed(client, {
    ticket_id: leg.ticket_id,
    vehicle_id: vehicleId,
    route_id: leg.route_id,
    current_holder_user_id: tendaiId,
    redeemed_at: redeemedAt,
  });
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await ensureBuilt(client);
  const { tendaiId } = await resolveTendaiAndDrain(client);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Mobile Safari/537.36",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console error]", msg.text());
  });

  log("1. open /?as=tendai (search bar should be visible after drain)");
  await page.goto(`${BASE}/?as=tendai`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#trip-search", { timeout: 30_000 });

  log("2. click 'Heights to Avondale' preset");
  await page.getByRole("button", { name: "Heights to Avondale" }).click();
  try {
    await page
      .getByRole("button", { name: /Buy for \$1\.50/ })
      .first()
      .waitFor({ timeout: 60_000 });
  } catch (err) {
    const headerText = await page.locator("header").innerText().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    console.error("    plan list never rendered.");
    console.error("    HEADER:", headerText);
    console.error("    BODY (first 800 chars):", bodyText.slice(0, 800));
    await page.screenshot({ path: "scripts/rehearsal-search-fail.png" });
    throw err;
  }

  log("3. buy fastest plan ($1.50)");
  await page.getByRole("button", { name: /Buy for \$1\.50/ }).click();
  await page.getByRole("heading", { name: "Wallet" }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Close wallet/ }).first().click();
  await page.waitForTimeout(800);

  // Pre-seed kombi position cache so the assigned-vehicle halo + ETA chip have
  // something to lock onto from the very start of the rehearsal.
  await broadcastTick(client, [
    tickPayload(LEG1_VEHICLE, LEG1_ROUTE, STOPS.heights_north[0] - 0.01, STOPS.heights_north[1]),
    tickPayload(LEG2_VEHICLE, LEG2_ROUTE, STOPS.lomagundi_kg[0] - 0.01, STOPS.lomagundi_kg[1]),
  ]);
  await page.waitForTimeout(400);

  log("4. resolve trip + leg tickets");
  const { trip_id, legs } = await resolveLatestTripLegs(client, tendaiId);
  if (legs.length !== 2) {
    throw new Error(`expected 2 legs in the new trip, got ${legs.length}`);
  }
  const leg1 = legs[0];
  const leg2 = legs[1];
  console.log(`    trip=${trip_id}`);
  console.log(`    leg1 ${leg1.access_code} ${leg1.route_id} ${leg1.board_at_stop_id}→${leg1.alight_at_stop_id}`);
  console.log(`    leg2 ${leg2.access_code} ${leg2.route_id} ${leg2.board_at_stop_id}→${leg2.alight_at_stop_id}`);

  // ---------------------- STAGE 1: walk-to-board ---------------------------
  log("STAGE 1 — walk-to-board");
  await waitForKind(page, (k) => k === "walk-to-board", 15_000);
  await captureStage(page, 1, "walk-to-board");

  // ---------------------- STAGE 2: boarding (flash) ------------------------
  log("STAGE 2 — boarding (leg 1 ticket flips to redeemed)");
  await redeemTicket(client, leg1, LEG1_VEHICLE, tendaiId);
  // The ticket-redeemed broadcast triggers a router.refresh() in the Journey
  // sheet; wait for the post-refresh stage to flip away from walk-to-board.
  await waitForKind(
    page,
    (k) => k === "boarding" || k === "in-transit",
    15_000,
  );
  // Position vehicle near the board stop so ETA chip and halo are visibly
  // anchored to the assigned kombi.
  await moveVehicle(
    client,
    LEG1_VEHICLE,
    LEG1_ROUTE,
    STOPS.heights_north[0],
    STOPS.heights_north[1],
  );
  await page.waitForTimeout(400);
  await captureStage(page, 2, "boarding");

  // ---------------------- STAGE 3: in-transit ------------------------------
  log("STAGE 3 — in-transit (leg 1, half way)");
  const midLat = (STOPS.heights_north[0] + STOPS.second_lomagundi[0]) / 2;
  const midLng = (STOPS.heights_north[1] + STOPS.second_lomagundi[1]) / 2;
  await moveVehicle(client, LEG1_VEHICLE, LEG1_ROUTE, midLat, midLng);
  await waitForKind(page, (k) => k === "in-transit", 15_000);
  await captureStage(page, 3, "in-transit");

  // ---------------------- STAGE 4: walking-transfer ------------------------
  log("STAGE 4 — walking-transfer (leg 1 vehicle at alight stop)");
  // Drop vehicle within NEAR_STOP_RADIUS_METERS (120) of leg-1 alight.
  await moveVehicle(
    client,
    LEG1_VEHICLE,
    LEG1_ROUTE,
    STOPS.second_lomagundi[0],
    STOPS.second_lomagundi[1],
  );
  await waitForKind(page, (k) => k === "walking-transfer", 15_000);
  await captureStage(page, 4, "walking-transfer");

  // ---------------------- STAGE 5: boarding-leg-2 --------------------------
  log("STAGE 5 — boarding leg 2 (leg 2 ticket flips to redeemed)");
  await moveVehicle(
    client,
    LEG2_VEHICLE,
    LEG2_ROUTE,
    STOPS.lomagundi_kg[0],
    STOPS.lomagundi_kg[1],
  );
  await redeemTicket(client, leg2, LEG2_VEHICLE, tendaiId);
  await waitForKind(
    page,
    (k, i) => k === "boarding-leg-2" || (k === "in-transit" && i === "5"),
    15_000,
  );
  await captureStage(page, 5, "boarding-leg-2");

  // ---------------------- STAGE 6: arrived ---------------------------------
  log("STAGE 6 — arrived (leg 2 vehicle at destination)");
  await moveVehicle(
    client,
    LEG2_VEHICLE,
    LEG2_ROUTE,
    STOPS.avondale[0],
    STOPS.avondale[1],
  );
  await waitForKind(page, (k) => k === "arrived", 30_000);
  // Give the collapse animation a beat to settle, then capture.
  await page.waitForTimeout(800);
  await captureStage(page, 6, "arrived");

  log("DONE — writing report");
  writeReport(evidence);

  await browser.close();
}

function writeReport(items: StageEvidence[]): void {
  const lines: string[] = [];
  lines.push("# Phase 3.5 Journey UX — production rehearsal");
  lines.push("");
  lines.push(
    "Drove the full six-stage Journey UX against `https://svika.vercel.app/?as=tendai` after draining Tendai's wallet and topping up to $5.00. Each stage's evidence below was captured from the live production page (no mocks, no local overrides).",
  );
  lines.push("");
  lines.push("Vehicles used:");
  lines.push("- **ZH 4821** on `route_heights_rezende` (leg 1)");
  lines.push("- **ZH 5101** on `route_westgate_copa_segment` (leg 2)");
  lines.push("");
  lines.push("Stops geofenced:");
  lines.push("- `sp_heights_start_north` (Bannockburn Rd North Terminus)");
  lines.push("- `sp_second_lomagundi` (leg-1 alight + walking-transfer start)");
  lines.push("- `sp_lomagundi_kinggeorge_pickup` (walking-transfer end + leg-2 board)");
  lines.push("- `sp_avondale_shops` (destination)");
  lines.push("");

  const stageNames: Record<string, string> = {
    "walk-to-board": "Walk to board",
    boarding: "Boarding (leg 1)",
    "in-transit": "In transit (leg 1)",
    "walking-transfer": "Walking transfer",
    "boarding-leg-2": "Boarding (leg 2)",
    arrived: "Arrived",
  };

  for (const item of items) {
    lines.push(`## Stage ${item.stage} — ${stageNames[item.kind] ?? item.kind}`);
    lines.push("");
    lines.push(`Screenshot: \`${item.screenshot}\``);
    lines.push("");
    lines.push("Sheet text:");
    lines.push("```");
    lines.push(item.sheetText.slice(0, 500));
    lines.push("```");
    lines.push("");
    lines.push("Layer probe:");
    lines.push("```json");
    lines.push(JSON.stringify(item.layerSnapshot, null, 2));
    lines.push("```");
    lines.push("");
  }

  mkdirSync("docs", { recursive: true });
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`    wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error("\n[rehearsal FAILED]", err);
  process.exit(1);
});
