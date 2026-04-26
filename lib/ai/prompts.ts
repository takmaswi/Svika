import type { AuditStats, Intent } from "./types";

/**
 * Prompt for the natural-language understanding job.
 * Phase 0 spike validates this against ten Shona kombi-booking sentences.
 */
export const UNDERSTAND_SYSTEM = `You are a strict JSON extractor for a Harare kombi (minibus) trip planner.
Given a passenger's request in English, Shona, or a code-switched mix, extract:
- origin_stop_id: best-guess stop identifier or null
- destination_stop_id: best-guess stop identifier or null
- willing_to_walk: true if the user said anything implying a walking transfer
- confidence: "high" | "medium" | "low" based on how clearly the stops are named
- notes: optional one-line explanation

Known stops include: sp_heights_start_north (Bannockburn / Mt Pleasant Heights),
sp_uz_gate (University of Zimbabwe), sp_second_lomagundi (Second / Lomagundi corner),
sp_rezende_rank (Rezende Rank), sp_marketsq_rank (Market Square Rank),
sp_pe_kensington (Prince Edward / Kensington), sp_avondale_shops (Avondale Shops),
sp_fourthst_rank (Fourth Street Rank), sp_samlevys (Sam Levy's Village).

Output ONLY a valid JSON object matching the schema. No prose. No markdown fences.`;

export function understandUserMessage(rawText: string): string {
  return `User input: ${JSON.stringify(rawText)}\n\nReturn the JSON object now.`;
}

/**
 * Prompt for the bilingual audit narrative job.
 * Two-language output, plain register, no hype, ZIMRA-context-aware.
 */
export const NARRATE_SYSTEM = `You are an audit-narrative writer for kombi fleet owners in Harare.
Given a kombi's day-of-operation stats, produce two short paragraphs:
1. English — for the bank or for ZIMRA, plain professional register.
2. Shona — for the operator's family or community, conversational register.

Both must:
- Lead with the headline number (revenue gap, if any).
- Mention the stop count and the digital-vs-cash split honestly.
- Reference the ZIMRA liability estimate.
- Avoid hype, avoid exaggeration, avoid blaming the conductor by name.

Output ONLY a valid JSON object: { "english_text": string, "shona_text": string }.
No prose, no markdown fences.`;

export function narrateUserMessage(stats: AuditStats): string {
  return `Stats:\n${JSON.stringify(stats, null, 2)}\n\nReturn the JSON object now.`;
}

/**
 * Few-shot examples — used in the Phase 0 spike to anchor the model.
 */
export const UNDERSTAND_FEW_SHOTS: Array<{ input: string; output: Intent }> = [
  {
    input: "Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights",
    output: {
      origin_stop_id: "sp_heights_start_north",
      destination_stop_id: "sp_avondale_shops",
      willing_to_walk: true,
      raw_text: "Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights",
      confidence: "high",
      notes: "Heights to Avondale — known walking transfer at Lomagundi.",
    },
  },
  {
    input: "I want to go to UZ from Heights",
    output: {
      origin_stop_id: "sp_heights_start_north",
      destination_stop_id: "sp_uz_gate",
      willing_to_walk: false,
      raw_text: "I want to go to UZ from Heights",
      confidence: "high",
    },
  },
];
