/**
 * Shared types for the AI layer. Two jobs, one model family.
 * See docs/SYSTEM-ARCHITECTURE.md → "Artificial intelligence layer".
 */

export type Provider = "ollama" | "gemini";

/**
 * Output of `understand` — passenger natural-language → structured intent.
 */
export interface Intent {
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  willing_to_walk: boolean;
  raw_text: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

/**
 * Input to `narrate` — per-kombi end-of-day stats for the audit narrative.
 */
export interface AuditStats {
  vehicle_id: string;
  for_date: string;
  stops_made: number;
  digital_fares_logged: number;
  cash_walkons_logged: number;
  parcels_delivered: number;
  total_logged_revenue_usd: number;
  estimated_revenue_gap_usd: number;
  zimra_liability_estimate_usd: number;
  unlogged_stop_window_summary?: string;
}

/**
 * Output of `narrate`.
 */
export interface Narrative {
  english_text: string;
  shona_text: string;
  generated_by: Provider;
  generated_at: string;
}
