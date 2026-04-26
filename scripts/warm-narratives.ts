/**
 * Warm the audit_narratives cache by calling Ollama Gemma 4 E2B for every
 * fleet-owned kombi today, then upserting the bilingual narrative into
 * `audit_narratives`. This is the demo's "Plan B" path: latency-tolerant,
 * runs once per (vehicle, day) on a machine that has Ollama running, so the
 * dashboard on Vercel never has to call a model inline.
 *
 * Run:
 *   ollama serve     # in another shell, must be running
 *   pnpm narrate:warm
 *
 * Env (read from .env.local via tsx --env-file in package.json):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OLLAMA_BASE_URL          (default http://localhost:11434)
 *   OLLAMA_MODEL             (default gemma4:e2b-it-q4_K_M)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Ollama } from "ollama";

import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";
import type { Database } from "@/lib/supabase/types";
import type { TicketRow, VehicleRow } from "@/lib/supabase/types";
import {
  ZIMRA_RATE,
  DAYS_PER_MONTH,
  type FleetVehicleStats,
} from "@/lib/fleet/state";
import { NARRATE_SYSTEM, narrateUserMessage } from "@/lib/ai/prompts";
import type { AuditStats } from "@/lib/ai/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e2b-it-q4_K_M";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
}

const seed = network as unknown as SeedNetwork;
const routeById = new Map<string, { name: string; default_fare_usd: number }>();
for (const r of seed.routes) {
  routeById.set(r.id, { name: r.name, default_fare_usd: r.default_fare_usd });
}

const supabase: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const ollama = new Ollama({ host: OLLAMA_BASE_URL });

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

interface VehicleAggregate {
  vehicle: VehicleRow;
  stops_made: number;
  tickets: TicketRow[];
}

async function aggregateAllVehicles(): Promise<VehicleAggregate[]> {
  const since = startOfTodayIso();

  const { data: vehiclesData, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("*")
    .order("id", { ascending: true });
  if (vehiclesError || !vehiclesData) return [];
  const vehicles = vehiclesData as VehicleRow[];
  if (vehicles.length === 0) return [];

  const vehicleIds = vehicles.map((v) => v.id);
  const [pingsRes, ticketsRes] = await Promise.all([
    supabase
      .from("kombi_pings")
      .select("vehicle_id, nearest_stop_id, is_at_stop, recorded_at")
      .in("vehicle_id", vehicleIds)
      .eq("is_at_stop", true)
      .gte("recorded_at", since),
    supabase
      .from("tickets")
      .select(
        "id, access_code, fare_usd, status, kind, vehicle_id, originating_user_id, route_id, board_at_stop_id, alight_at_stop_id, current_holder_user_id, parcel_receiver_phone, parcel_description, created_at, redeemed_at, completed_at",
      )
      .in("vehicle_id", vehicleIds)
      .gte("created_at", since),
  ]);

  type PingRow = {
    vehicle_id: string;
    nearest_stop_id: string | null;
    is_at_stop: boolean;
    recorded_at: string;
  };
  const pings = (pingsRes.data ?? []) as PingRow[];
  const tickets = (ticketsRes.data ?? []) as TicketRow[];

  const stopBuckets = new Map<string, Set<string>>();
  for (const p of pings) {
    if (!p.nearest_stop_id) continue;
    const bucket = Math.floor(new Date(p.recorded_at).getTime() / (5 * 60 * 1000));
    const key = `${p.nearest_stop_id}::${bucket}`;
    const set = stopBuckets.get(p.vehicle_id) ?? new Set<string>();
    set.add(key);
    stopBuckets.set(p.vehicle_id, set);
  }

  return vehicles.map((v) => ({
    vehicle: v,
    stops_made: stopBuckets.get(v.id)?.size ?? 0,
    tickets: tickets.filter((t) => t.vehicle_id === v.id),
  }));
}

function summarise(agg: VehicleAggregate): FleetVehicleStats {
  const route = routeById.get(agg.vehicle.route_id);
  const defaultFare = route?.default_fare_usd ?? 1;

  let digital = 0;
  let cash = 0;
  let parcels = 0;
  let revenue = 0;

  for (const t of agg.tickets) {
    const fare = Number(t.fare_usd ?? 0);
    if (t.kind === "parcel" && t.status === "completed") {
      parcels += 1;
      revenue += fare;
      continue;
    }
    if (t.kind === "passenger" && t.status === "redeemed") {
      digital += 1;
      revenue += fare;
      continue;
    }
    if (t.kind === "passenger" && t.status === "completed" && t.originating_user_id === null) {
      cash += 1;
      revenue += fare;
      continue;
    }
  }

  const totalFaresLogged = digital + cash;
  const gapStops = Math.max(0, agg.stops_made - totalFaresLogged);
  const gap = Number((gapStops * defaultFare).toFixed(2));
  const monthlyRevenue = revenue * DAYS_PER_MONTH;
  const zimraLiability = Number((monthlyRevenue * ZIMRA_RATE).toFixed(2));

  return {
    vehicle_id: agg.vehicle.id,
    route_id: agg.vehicle.route_id,
    route_name: route?.name ?? agg.vehicle.route_id,
    default_fare_usd: defaultFare,
    current_passenger_count: agg.vehicle.current_passenger_count,
    capacity_seats: agg.vehicle.capacity_seats,
    stops_made: agg.stops_made,
    digital_fares_logged: digital,
    cash_walkons_logged: cash,
    parcels_delivered: parcels,
    total_logged_revenue_usd: Number(revenue.toFixed(2)),
    revenue_gap_estimate_usd: gap,
    zimra_liability_estimate_usd: zimraLiability,
  };
}

async function generateNarrative(stats: AuditStats): Promise<{ english_text: string; shona_text: string }> {
  const res = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: NARRATE_SYSTEM },
      { role: "user", content: narrateUserMessage(stats) },
    ],
    format: "json",
    options: { temperature: 0.2, num_predict: 512 },
  });
  const parsed = JSON.parse(stripJsonFences(res.message.content)) as {
    english_text?: unknown;
    shona_text?: unknown;
  };
  const english = typeof parsed.english_text === "string" ? parsed.english_text : "";
  const shona = typeof parsed.shona_text === "string" ? parsed.shona_text : "";
  if (english.length < 20 || shona.length < 20) {
    throw new Error(
      `Gemma output too short: english=${english.length} shona=${shona.length}`,
    );
  }
  return { english_text: english, shona_text: shona };
}

async function main() {
  const forDate = todayDateOnly();
  console.log(`[warm] writing audit_narratives for ${forDate} via ${OLLAMA_MODEL} on ${OLLAMA_BASE_URL}`);

  const aggregates = await aggregateAllVehicles();
  if (aggregates.length === 0) {
    console.log("[warm] no vehicles found — run pnpm db:seed first");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const agg of aggregates) {
    const stats = summarise(agg);
    const auditStats: AuditStats = {
      vehicle_id: stats.vehicle_id,
      for_date: forDate,
      stops_made: stats.stops_made,
      digital_fares_logged: stats.digital_fares_logged,
      cash_walkons_logged: stats.cash_walkons_logged,
      parcels_delivered: stats.parcels_delivered,
      total_logged_revenue_usd: stats.total_logged_revenue_usd,
      estimated_revenue_gap_usd: stats.revenue_gap_estimate_usd,
      zimra_liability_estimate_usd: stats.zimra_liability_estimate_usd,
    };

    const started = Date.now();
    try {
      const narrative = await generateNarrative(auditStats);
      const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
      const { error } = await supabase
        .from("audit_narratives")
        .upsert(
          {
            vehicle_id: stats.vehicle_id,
            for_date: forDate,
            english_text: narrative.english_text,
            shona_text: narrative.shona_text,
            stops_made: stats.stops_made,
            digital_fares_logged: stats.digital_fares_logged,
            cash_walkons_logged: stats.cash_walkons_logged,
            revenue_gap_estimate_usd: stats.revenue_gap_estimate_usd,
            zimra_liability_estimate_usd: stats.zimra_liability_estimate_usd,
          },
          { onConflict: "vehicle_id,for_date" },
        );
      if (error) {
        fail += 1;
        console.error(`[warm] ${stats.vehicle_id} upsert failed:`, error.message);
        continue;
      }
      ok += 1;
      console.log(
        `[warm] ${stats.vehicle_id} ok in ${elapsedSec}s — en=${narrative.english_text.length}c sn=${narrative.shona_text.length}c`,
      );
    } catch (err) {
      fail += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[warm] ${stats.vehicle_id} narrate failed: ${message}`);
    }
  }

  console.log(`[warm] done — ok=${ok} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[warm] fatal:", err);
  process.exit(1);
});
