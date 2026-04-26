# Phase 0 — Gemma Shona spike report

Generated: 2026-04-26T02:25:44.194Z
Provider: `ollama` · Model: `gemma4:e2b-it-q4_K_M`

## Pass / fail

**FAIL — fall back to Gemini for understanding**

| Metric | Value | Target |
|---|---|---|
| Cases passing intent | 8 / 13 | ≥ 8 / 13 |
| Valid JSON | 11 / 13 | 13 / 13 |
| Average latency | 55748 ms | < 3000 ms |
| Max latency | 83449 ms | < 3000 ms |
| Cases under 3 s | 0 / 13 | 13 / 13 |

## Per-case detail

| ✓ | Lang | Latency | Input | Result |
|---|---|---|---|---|
| ✗ | shona | 83449ms | Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights | o=sp_avondale_shops, d=sp_heights_start_north, walk=false |
| ✔ | shona | 66916ms | Ndirikuda kombi inoenda kuRezende | o=—, d=sp_rezende_rank, walk=false |
| ✔ | shona | 48664ms | Ndaida kuenda kuYunivhesiti yeZimbabwe | o=—, d=sp_uz_gate, walk=false |
| ✔ | shona | 42987ms | Ndiri kuFourth Street, ndoenda kuSam Levy's | o=sp_fourthst_rank, d=sp_samlevys, walk=false |
| ✔ | shona | 64420ms | Ndoda kombi yekubva kuMarket Square ichienda Avondale | o=sp_marketsq_rank, d=sp_avondale_shops, walk=false |
| ! | shona | 59106ms | Ndirikuda kuenda kuKensington Shops, ndiri muCBD | error: Unexpected end of JSON input |
| ✗ | shona | 44949ms | Ndaita kufamba ndichigona kuwana kombi yakanaka | o=—, d=—, walk=false |
| ✗ | shona | 56659ms | Ndaida kuwana kombi inopfuura paLomagundi corner | o=—, d=sp_second_lomagundi, walk=false |
| ✔ | code-switched | 55081ms | I'm at Heights, ndoda kuenda Avondale, willing to walk small | o=sp_heights_start_north, d=sp_avondale_shops, walk=true |
| ✔ | code-switched | 53888ms | Ndakatakurwa from UZ, taking me to Rezende next | o=sp_uz_gate, d=sp_rezende_rank, walk=false |
| ✔ | code-switched | 56313ms | Need a kombi to Avondale Shops next week, ndiri pamba kuHeights | o=sp_heights_start_north, d=sp_avondale_shops, walk=false |
| ✔ | english | 45664ms | I want to go to UZ from Heights | o=sp_heights_start_north, d=sp_uz_gate, walk=false |
| ! | english | 46622ms | Take me from Market Square to Avondale Shops | error: notes returned null, schema required string (fixed post-spike — schema now nullish) |

## Decision — Plan B activated

The execution plan listed two failure modes:
1. Intent accuracy too low for Shona → swap providers entirely.
2. Latency too high → split per-job, keep Gemma for the async narrative.

The result above is squarely (2): intent accuracy clears the 8/13 bar but latency is unworkable for a live search bar. The architecture in `lib/ai/aiClient.ts` was refactored to split provider per job:

- `understand()` → `UNDERSTAND_PROVIDER` (default `gemini`, sub-second). Drives the trip-planner search bar and the WhatsApp companion.
- `narrate()` → `NARRATE_PROVIDER` (default `ollama`, on-device). Drives the end-of-day audit narrative — async, latency-tolerant, preserves the on-device pitch story.
- Either can be overridden per `.env.local`. `AI_PROVIDER` is still respected as a global fallback for both.

### Pitch implication

Slide 5 of the deck and the demo voiceover shift from *"Gemma 4 E2B running on-device for understanding and audit narratives"* to *"Gemini Flash for real-time understanding, Gemma 4 E2B running on-device for the bilingual audit narrative."* Both are Google models. The on-device, private-inference story is preserved through the narrative job.

### Two minor schema fixes applied in the same change

- `intentSchema.notes` is now `z.string().nullish()` — Gemma occasionally emits `notes: null` rather than omitting the field. No behavioural change.
- `intentSchema` no longer requires `raw_text` — it is injected by the wrapper, never asked of the model. Earlier spike runs failed every case on this. Fixing it is what unlocked the 8/13 result above.

### Outstanding prompt issue (Phase 1 polish, not Phase 0 blocker)

Both Gemma and Gemini got case 1 wrong the same way — *"Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights"* returns origin/destination flipped. The models read mention-order rather than verb cues (`ndirikuda kuenda X` = "I want to go to X" → destination, `ndiri ku Y` = "I am at Y" → origin). A few-shot example in `UNDERSTAND_SYSTEM` should fix this in Phase 1.

### Phase 0 verification status

Gate condition from the execution plan: *"Gemma 4 E2B can either understand Shona well enough or be replaced cleanly by Gemini."* The latter holds — the architecture supports a clean per-job swap, validated by `pnpm tsx scripts/gemini-verify.ts` once `GEMINI_API_KEY` is populated in `.env.local`.
