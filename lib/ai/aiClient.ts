import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";
import { z } from "zod";

import { NARRATE_SYSTEM, UNDERSTAND_SYSTEM, narrateUserMessage, understandUserMessage } from "./prompts";
import type { AuditStats, Intent, Narrative, Provider } from "./types";

// Per-job provider selection. The Phase 0 spike (docs/PHASE-0-GEMMA-SPIKE.md)
// showed Gemma 4 E2B running on CPU was too slow for the live search bar
// (≈55 s average latency). Plan B from docs/EXECUTION-PLAN.md → Phase 0:
//   understand() → Gemini Flash (real-time, sub-second)
//   narrate()    → Ollama Gemma (audit narrative is async, on-device story holds)
// Override either with UNDERSTAND_PROVIDER / NARRATE_PROVIDER, or both with AI_PROVIDER.
const FALLBACK = (process.env.AI_PROVIDER ?? "ollama") as Provider;
const UNDERSTAND_PROVIDER = (process.env.UNDERSTAND_PROVIDER ?? FALLBACK ?? "gemini") as Provider;
const NARRATE_PROVIDER = (process.env.NARRATE_PROVIDER ?? FALLBACK ?? "ollama") as Provider;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e2b-it-q4_K_M";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ----- shared helpers ------------------------------------------------------

// `raw_text` is injected by the wrapper after parsing — the model is not asked
// to echo it back. Keep it out of the schema so a faithful model is not
// rejected for omitting a field it was never told to produce.
// `notes` accepts null because some models emit `notes: null` rather than omitting it.
const intentSchema = z.object({
  origin_stop_id: z.string().nullable(),
  destination_stop_id: z.string().nullable(),
  willing_to_walk: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullish(),
});

const narrativeSchema = z.object({
  english_text: z.string().min(20),
  shona_text: z.string().min(20),
});

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

// ----- Ollama path ---------------------------------------------------------

const ollama = new Ollama({ host: OLLAMA_BASE_URL });

async function ollamaJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const res = await ollama.chat({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    format: "json",
    options: { temperature: 0.2, num_predict: 512 },
  });
  return JSON.parse(stripJsonFences(res.message.content));
}

// ----- Gemini path ---------------------------------------------------------

const gemini = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

async function geminiJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
  if (!gemini) throw new Error("GEMINI_API_KEY not set; cannot use AI_PROVIDER=gemini");
  const res = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  return JSON.parse(stripJsonFences(res.text ?? ""));
}

// ----- public API ----------------------------------------------------------

/**
 * Turn a passenger's natural-language input into a structured intent.
 * Used by the trip planner search bar and the WhatsApp companion.
 * Defaults to Gemini Flash (sub-second). Override with UNDERSTAND_PROVIDER.
 */
export async function understand(rawText: string): Promise<Intent> {
  const userPrompt = understandUserMessage(rawText);
  const raw = UNDERSTAND_PROVIDER === "gemini"
    ? await geminiJSON(UNDERSTAND_SYSTEM, userPrompt)
    : await ollamaJSON(UNDERSTAND_SYSTEM, userPrompt);
  const parsed = intentSchema.parse(raw);
  const { notes, ...rest } = parsed;
  return { ...rest, raw_text: rawText, notes: notes ?? undefined };
}

/**
 * Generate the bilingual audit narrative for a kombi's day.
 * Defaults to local Ollama Gemma — preserves the on-device pitch story.
 * Override with NARRATE_PROVIDER for the Gemini fallback used during recording.
 */
export async function narrate(stats: AuditStats): Promise<Narrative> {
  const userPrompt = narrateUserMessage(stats);
  const raw = NARRATE_PROVIDER === "gemini"
    ? await geminiJSON(NARRATE_SYSTEM, userPrompt)
    : await ollamaJSON(NARRATE_SYSTEM, userPrompt);
  const parsed = narrativeSchema.parse(raw);
  return {
    english_text: parsed.english_text,
    shona_text: parsed.shona_text,
    generated_by: NARRATE_PROVIDER,
    generated_at: new Date().toISOString(),
  };
}

export const aiClient = { understand, narrate };
export const understandProvider: Provider = UNDERSTAND_PROVIDER;
export const narrateProvider: Provider = NARRATE_PROVIDER;
