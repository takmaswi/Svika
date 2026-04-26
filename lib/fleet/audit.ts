/**
 * Bilingual audit narrative — Gemma's job.
 *
 * Render-time policy: cache-first. The fleet dashboard NEVER calls Ollama or
 * Gemini inline. It reads `audit_narratives` for (vehicle_id, today) and falls
 * back to a deterministic plain-language summary when there is no cached row.
 *
 * Why: per CLAUDE.md, Gemma 4 E2B runs on local Ollama and is latency-tolerant
 * (Phase 0 spike measured ~55s/inference on CPU). Calling it inline from a
 * Next.js server component would hang the dashboard for minutes when 8 kombis
 * are missing today's narrative — and Vercel cannot reach localhost Ollama at
 * all, so a "live" call there would always fail and fall through.
 *
 * Pre-warm path: `scripts/warm-narratives.ts` (run via `pnpm narrate:warm`)
 * generates real Gemma narratives once per day on a machine with Ollama and
 * upserts them into `audit_narratives`. The dashboard then renders the real
 * thing on the next load.
 *
 * Live narrate() / cache write helpers exposed for the warm script:
 *   - `narrateAndCache(stats, forDate)`
 */

import { narrate, narrateProvider } from "@/lib/ai/aiClient";
import type { AuditStats } from "@/lib/ai/types";
import { createServerClient } from "@/lib/supabase/server";
import type { AuditNarrativeRow } from "@/lib/supabase/types";

import type { FleetVehicleStats } from "./state";

export interface AuditNarrativeView {
  vehicle_id: string;
  for_date: string;
  english_text: string;
  shona_text: string;
  generated_by: "ollama" | "gemini" | "fallback" | "cached";
  generated_at: string;
}

function fallbackNarrative(stats: FleetVehicleStats, forDate: string): AuditNarrativeView {
  const gapClause =
    stats.revenue_gap_estimate_usd > 0
      ? `Today's revenue gap estimate is $${stats.revenue_gap_estimate_usd.toFixed(2)} — ` +
        `${stats.stops_made} stops were logged but only ${stats.digital_fares_logged} digital fares ` +
        `and ${stats.cash_walkons_logged} cash walk-ons made it into the ledger.`
      : `${stats.stops_made} stops, ${stats.digital_fares_logged} digital fares, ` +
        `${stats.cash_walkons_logged} cash walk-ons. No gap detected today.`;
  const english =
    `${stats.vehicle_id} on ${stats.route_name}. ${gapClause} ` +
    `Total logged revenue $${stats.total_logged_revenue_usd.toFixed(2)}. ` +
    `ZIMRA liability estimate (10% of monthly revenue): $${stats.zimra_liability_estimate_usd.toFixed(2)}.`;
  const shona =
    `${stats.vehicle_id} pa${stats.route_name}. Mari yakanyorwa nhasi $${stats.total_logged_revenue_usd.toFixed(2)}. ` +
    `Pakamira pa${stats.stops_made} pamhinduro, mari isina kunyorwa inosvika $${stats.revenue_gap_estimate_usd.toFixed(2)}. ` +
    `Mutero weZIMRA wakatarisirwa pamwedzi: $${stats.zimra_liability_estimate_usd.toFixed(2)}.`;
  return {
    vehicle_id: stats.vehicle_id,
    for_date: forDate,
    english_text: english,
    shona_text: shona,
    generated_by: "fallback",
    generated_at: new Date().toISOString(),
  };
}

function toAuditStats(stats: FleetVehicleStats, forDate: string): AuditStats {
  return {
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
}

/**
 * Render-time read. Cache hit → real Gemma narrative. Cache miss → fallback.
 * Never calls a model.
 */
export async function getAuditNarrative(
  stats: FleetVehicleStats,
  forDate: string,
): Promise<AuditNarrativeView> {
  try {
    const client = await createServerClient();

    const { data: cachedData } = await client
      .from("audit_narratives")
      .select("*")
      .eq("vehicle_id", stats.vehicle_id)
      .eq("for_date", forDate)
      .maybeSingle();

    if (cachedData) {
      const cached = cachedData as AuditNarrativeRow;
      return {
        vehicle_id: cached.vehicle_id,
        for_date: cached.for_date,
        english_text: cached.english_text,
        shona_text: cached.shona_text,
        generated_by: "cached",
        generated_at: cached.generated_at,
      };
    }
  } catch {
    // Fall through.
  }
  return fallbackNarrative(stats, forDate);
}

/**
 * Pre-warm path. Calls the live model (Ollama Gemma by default), upserts the
 * result. Used by `scripts/warm-narratives.ts` — never called from a route.
 */
export async function narrateAndCache(
  stats: FleetVehicleStats,
  forDate: string,
): Promise<AuditNarrativeView> {
  const narrative = await narrate(toAuditStats(stats, forDate));

  try {
    const client = await createServerClient();
    await client
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
  } catch {
    // Caller decides what to do; we still return the narrative.
  }

  return {
    vehicle_id: stats.vehicle_id,
    for_date: forDate,
    english_text: narrative.english_text,
    shona_text: narrative.shona_text,
    generated_by: narrateProvider,
    generated_at: narrative.generated_at,
  };
}
