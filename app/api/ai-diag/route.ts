import { NextResponse } from "next/server";

import {
  narrate,
  narrateProvider,
  understand,
  understandProvider,
} from "@/lib/ai/aiClient";
import type { AuditStats } from "@/lib/ai/types";

/**
 * Phase 4 — AI provider diagnostic.
 *
 * Hits both `understand` and `narrate` end-to-end and reports which provider
 * each one resolved to plus whether the call returned a structured result.
 * Used by the Phase 4 prod-smoke to verify the Gemini fallback works against
 * `https://svika.vercel.app` when AI_PROVIDER=gemini is set on Vercel.
 *
 * Not linked from any UI. Cached for 0 seconds; always live.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAMPLE_INTENT_TEXT =
  "Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights";

const SAMPLE_AUDIT_STATS: AuditStats = {
  vehicle_id: "ZH 4821",
  for_date: new Date().toISOString().slice(0, 10),
  stops_made: 22,
  digital_fares_logged: 8,
  cash_walkons_logged: 3,
  parcels_delivered: 1,
  total_logged_revenue_usd: 14.5,
  estimated_revenue_gap_usd: 6.0,
  zimra_liability_estimate_usd: 7.25,
};

interface JobResult {
  ok: boolean;
  provider: string;
  duration_ms: number;
  error?: string;
  preview?: string;
}

async function runUnderstand(): Promise<JobResult> {
  const started = Date.now();
  try {
    const intent = await understand(SAMPLE_INTENT_TEXT);
    return {
      ok: true,
      provider: understandProvider,
      duration_ms: Date.now() - started,
      preview: `${intent.origin_stop_id ?? "?"} → ${intent.destination_stop_id ?? "?"} · ${intent.confidence}`,
    };
  } catch (err) {
    return {
      ok: false,
      provider: understandProvider,
      duration_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runNarrate(): Promise<JobResult> {
  const started = Date.now();
  try {
    const narrative = await narrate(SAMPLE_AUDIT_STATS);
    return {
      ok: true,
      provider: narrateProvider,
      duration_ms: Date.now() - started,
      preview: narrative.english_text.slice(0, 80),
    };
  } catch (err) {
    return {
      ok: false,
      provider: narrateProvider,
      duration_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const [understandResult, narrateResult] = await Promise.all([
    runUnderstand(),
    runNarrate(),
  ]);

  return NextResponse.json(
    {
      ai_provider_env: process.env.AI_PROVIDER ?? null,
      understand: understandResult,
      narrate: narrateResult,
      checked_at: new Date().toISOString(),
    },
    { status: 200 },
  );
}
