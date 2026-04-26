/**
 * Phase 0 — Gemma Shona verification spike.
 *
 * Gate per CLAUDE.md and docs/EXECUTION-PLAN.md:
 *   "Gemma 4 E2B can either understand Shona well enough or be replaced
 *   cleanly by Gemini."
 *
 * Pass criteria (from the execution plan):
 *   - Latency under 3 s per call
 *   - Output is valid JSON matching the Intent schema
 *   - Intent correct in at least 8 of 10 sentences
 *
 * Run with: pnpm ai:spike
 *
 * Make sure Ollama is running and the model is pulled:
 *   ollama serve
 *   ollama pull gemma4:e2b-it-q4_K_M
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { understand } from "@/lib/ai/aiClient";
import type { Intent } from "@/lib/ai/types";

interface Case {
  text: string;
  expected: {
    origin_stop_id: string | null;
    destination_stop_id: string | null;
    willing_to_walk?: boolean;
  };
  language: "shona" | "english" | "code-switched";
}

const CASES: Case[] = [
  // Pure Shona
  { text: "Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights",
    expected: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_avondale_shops" },
    language: "shona" },
  { text: "Ndirikuda kombi inoenda kuRezende",
    expected: { origin_stop_id: null, destination_stop_id: "sp_rezende_rank" },
    language: "shona" },
  { text: "Ndaida kuenda kuYunivhesiti yeZimbabwe",
    expected: { origin_stop_id: null, destination_stop_id: "sp_uz_gate" },
    language: "shona" },
  { text: "Ndiri kuFourth Street, ndoenda kuSam Levy's",
    expected: { origin_stop_id: "sp_fourthst_rank", destination_stop_id: "sp_samlevys" },
    language: "shona" },
  { text: "Ndoda kombi yekubva kuMarket Square ichienda Avondale",
    expected: { origin_stop_id: "sp_marketsq_rank", destination_stop_id: "sp_avondale_shops" },
    language: "shona" },
  { text: "Ndirikuda kuenda kuKensington Shops, ndiri muCBD",
    expected: { origin_stop_id: "sp_marketsq_rank", destination_stop_id: "sp_pe_kensington" },
    language: "shona" },
  { text: "Ndaita kufamba ndichigona kuwana kombi yakanaka",
    expected: { origin_stop_id: null, destination_stop_id: null, willing_to_walk: true },
    language: "shona" },
  { text: "Ndaida kuwana kombi inopfuura paLomagundi corner",
    expected: { origin_stop_id: "sp_second_lomagundi", destination_stop_id: null },
    language: "shona" },

  // Code-switched
  { text: "I'm at Heights, ndoda kuenda Avondale, willing to walk small",
    expected: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_avondale_shops", willing_to_walk: true },
    language: "code-switched" },
  { text: "Ndakatakurwa from UZ, taking me to Rezende next",
    expected: { origin_stop_id: "sp_uz_gate", destination_stop_id: "sp_rezende_rank" },
    language: "code-switched" },
  { text: "Need a kombi to Avondale Shops next week, ndiri pamba kuHeights",
    expected: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_avondale_shops" },
    language: "code-switched" },

  // Pure English baseline
  { text: "I want to go to UZ from Heights",
    expected: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_uz_gate" },
    language: "english" },
  { text: "Take me from Market Square to Avondale Shops",
    expected: { origin_stop_id: "sp_marketsq_rank", destination_stop_id: "sp_avondale_shops" },
    language: "english" },
];

interface Result {
  text: string;
  language: Case["language"];
  expected: Case["expected"];
  actual: Intent | null;
  latency_ms: number;
  intent_correct: boolean;
  json_valid: boolean;
  error?: string;
}

function isCorrect(expected: Case["expected"], actual: Intent): boolean {
  if (expected.origin_stop_id !== undefined && actual.origin_stop_id !== expected.origin_stop_id) {
    return false;
  }
  if (
    expected.destination_stop_id !== undefined &&
    actual.destination_stop_id !== expected.destination_stop_id
  ) {
    return false;
  }
  if (
    typeof expected.willing_to_walk === "boolean" &&
    actual.willing_to_walk !== expected.willing_to_walk
  ) {
    return false;
  }
  return true;
}

async function runOne(c: Case): Promise<Result> {
  const start = performance.now();
  try {
    const actual = await understand(c.text);
    const latency = performance.now() - start;
    return {
      text: c.text,
      language: c.language,
      expected: c.expected,
      actual,
      latency_ms: Math.round(latency),
      intent_correct: isCorrect(c.expected, actual),
      json_valid: true,
    };
  } catch (err) {
    return {
      text: c.text,
      language: c.language,
      expected: c.expected,
      actual: null,
      latency_ms: Math.round(performance.now() - start),
      intent_correct: false,
      json_valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`[spike] running ${CASES.length} cases against ${process.env.OLLAMA_MODEL ?? "gemma4:e2b-it-q4_K_M"}\n`);

  const results: Result[] = [];
  for (const c of CASES) {
    const r = await runOne(c);
    results.push(r);
    const tick = r.intent_correct ? "✔" : r.json_valid ? "✗" : "!";
    console.log(`${tick}  [${r.language.padEnd(13)}] ${r.latency_ms}ms  "${c.text}"`);
    if (!r.intent_correct && r.actual) {
      console.log(`     expected ${JSON.stringify(c.expected)}`);
      console.log(`     actual   { origin: ${r.actual.origin_stop_id}, dest: ${r.actual.destination_stop_id}, walk: ${r.actual.willing_to_walk} }`);
    }
    if (r.error) console.log(`     error: ${r.error}`);
  }

  const total = results.length;
  const correct = results.filter((r) => r.intent_correct).length;
  const validJson = results.filter((r) => r.json_valid).length;
  const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latency_ms, 0) / total);
  const maxLatency = Math.max(...results.map((r) => r.latency_ms));
  const under3s = results.filter((r) => r.latency_ms < 3000).length;

  const summary = {
    timestamp: new Date().toISOString(),
    model: process.env.OLLAMA_MODEL ?? "gemma4:e2b-it-q4_K_M",
    provider: process.env.AI_PROVIDER ?? "ollama",
    total,
    intent_correct: correct,
    json_valid: validJson,
    avg_latency_ms: avgLatency,
    max_latency_ms: maxLatency,
    under_3s_calls: under3s,
    pass: correct >= 8 && validJson === total && maxLatency < 3000,
  };

  console.log("\n[spike] summary");
  console.log(JSON.stringify(summary, null, 2));

  const out = resolve(process.cwd(), "docs", "PHASE-0-GEMMA-SPIKE.md");
  const md = renderReport(summary, results);
  writeFileSync(out, md, "utf8");
  console.log(`\n[spike] report written → ${out}`);

  process.exit(summary.pass ? 0 : 1);
}

function renderReport(summary: Summary, results: Result[]): string {
  return `# Phase 0 — Gemma Shona spike report

Generated: ${summary.timestamp}
Provider: \`${summary.provider}\` · Model: \`${summary.model}\`

## Pass / fail

**${summary.pass ? "PASS — Gemma stays" : "FAIL — fall back to Gemini for understanding"}**

| Metric | Value | Target |
|---|---|---|
| Cases passing intent | ${summary.intent_correct} / ${summary.total} | ≥ 8 / ${summary.total} |
| Valid JSON | ${summary.json_valid} / ${summary.total} | ${summary.total} / ${summary.total} |
| Average latency | ${summary.avg_latency_ms} ms | < 3000 ms |
| Max latency | ${summary.max_latency_ms} ms | < 3000 ms |
| Cases under 3 s | ${summary.under_3s_calls} / ${summary.total} | ${summary.total} / ${summary.total} |

## Per-case detail

| ✓ | Lang | Latency | Input | Result |
|---|---|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.intent_correct ? "✔" : r.json_valid ? "✗" : "!"} | ${r.language} | ${r.latency_ms}ms | ${r.text.replace(/\|/g, "\\|")} | ${
        r.actual
          ? `o=${r.actual.origin_stop_id ?? "—"}, d=${r.actual.destination_stop_id ?? "—"}, walk=${r.actual.willing_to_walk}`
          : `error: ${r.error}`
      } |`,
  )
  .join("\n")}
`;
}

type Summary = {
  timestamp: string;
  model: string;
  provider: string;
  total: number;
  intent_correct: number;
  json_valid: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  under_3s_calls: number;
  pass: boolean;
};

main();
