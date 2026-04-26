/**
 * One-shot Gemini verification — Phase 0 Plan B confirmation.
 * Calls understand() forced through Gemini and reports latency.
 * Pass: latency under 3 s, intent has expected origin/destination ids.
 *
 * Run: pnpm tsx scripts/gemini-verify.ts
 */

// Force Gemini for understand() before the aiClient module captures env at load.
process.env.UNDERSTAND_PROVIDER = "gemini";

async function main() {
  const { understand } = await import("@/lib/ai/aiClient");

  const cases = [
    {
      text: "Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights",
      want: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_avondale_shops" },
    },
    {
      text: "I want to go to UZ from Heights",
      want: { origin_stop_id: "sp_heights_start_north", destination_stop_id: "sp_uz_gate" },
    },
  ];

  let pass = true;
  for (const c of cases) {
    const start = performance.now();
    try {
      const intent = await understand(c.text);
      const latency = Math.round(performance.now() - start);
      const ok =
        intent.origin_stop_id === c.want.origin_stop_id &&
        intent.destination_stop_id === c.want.destination_stop_id;
      const tick = ok ? "✔" : "✗";
      console.log(`${tick}  ${latency} ms  "${c.text}"`);
      console.log(`     o=${intent.origin_stop_id ?? "—"}, d=${intent.destination_stop_id ?? "—"}, walk=${intent.willing_to_walk}, conf=${intent.confidence}`);
      if (!ok || latency > 3000) pass = false;
    } catch (err) {
      console.log(`!  ERROR  "${c.text}"`);
      console.log(`     ${err instanceof Error ? err.message : String(err)}`);
      pass = false;
    }
  }

  console.log(`\nGemini verification: ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main();
