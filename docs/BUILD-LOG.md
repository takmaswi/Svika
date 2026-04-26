# Build Log — Svika

Append-only progress log. One line per completed task. Format:

```
YYYY-MM-DD HH:MM | <phase> | <task> | <commit-hash> | <verified>
```

`<verified>` should be the validation step that passed: `typecheck`, `build`, `smoke`, or `manual`.

When the agent gets interrupted and restarts, the next session reads this log to resume cleanly without re-deriving context.

---

## Phase 0 — Foundations and the Gemma verification spike

2026-04-26 04:00 | Phase 0 | Verify Ollama + Gemma 4 E2B locally available — `gemma4:e2b-it-q4_K_M` present, daemon responds 200 | (pre-commit) | manual
2026-04-26 04:05 | Phase 0 | pnpm install — 555 packages resolved | (pre-commit) | manual
2026-04-26 04:25 | Phase 0 | Gemma Shona spike — 8/13 intents, avg 55s latency, FAIL on latency, Plan B activated | (pre-commit) | manual
2026-04-26 04:30 | Phase 0 | Surgical scaffold fixes — schema bugs, ESLint flat-config switch, React Compiler config move, type errors | (pre-commit) | typecheck+lint+build
2026-04-26 04:35 | Phase 0 | aiClient refactor — per-job UNDERSTAND_PROVIDER/NARRATE_PROVIDER, defaults gemini/ollama | (pre-commit) | typecheck
2026-04-26 04:40 | Phase 0 | Supabase migrations applied to svika-dev (via Cowork) — 12 tables, 4 demo users seeded | (external) | manual
2026-04-26 04:45 | Phase 0 | Gemini understand verification — 1.2s warm latency, 2/2 cases correct | (pre-commit) | manual
2026-04-26 04:55 | Phase 0 | First commit on main — 61 files | 81444d2 | typecheck+lint+build
2026-04-26 05:00 | Phase 0 | Push to GitHub — merged with auto-init readme stub | 66e4964 | manual
2026-04-26 05:10 | Phase 0 | Vercel link + 8 env vars (production+development) + first prod deploy | dpl_EBwRDkTfrdwUPpCURfgdngrq6WGQ | manual
2026-04-26 05:12 | Phase 0 | Production smoke — 4/4 surfaces 200 with persona+brand markup at https://svika.vercel.app | (post-deploy) | manual

## Phase 1 — The network on the map

2026-04-26 05:30 | Phase 1 | Mapbox Directions densifier with silent raw-polyline fallback (`lib/mapbox/densify.ts`) | (uncommitted) | typecheck
2026-04-26 05:32 | Phase 1 | Sim geometry helpers — haversine, polyline length, point-at-distance, advance, WKT (`lib/sim/geometry.ts`) | (uncommitted) | typecheck
2026-04-26 05:35 | Phase 1 | Seed schema types (`seed/schema.ts`) and hand-rolled `Database` shape with `__InternalSupabase` discriminator | (uncommitted) | typecheck
2026-04-26 05:40 | Phase 1 | Full seed loader — stops, routes (densified), route_stops, fare_segments, transfer_points, 8 vehicles (2 per route), initial pings | (uncommitted) | manual
2026-04-26 05:45 | Phase 1 | Sim runner (`lib/sim/simRunner.ts` + `scripts/sim-runner.ts`) — 2s tick, broadcast on `kombi-positions` channel, vehicles update + kombi_pings insert | (uncommitted) | manual
2026-04-26 05:48 | Phase 1 | Migration 0004 — `routes_geojson()`, `stop_points_geojson()`, `route_stops_ordered()` PostGIS-to-GeoJSON RPCs (NOT YET APPLIED to svika-dev) | (uncommitted) | n/a
2026-04-26 05:50 | Phase 1 | Server-side `loadNetwork()` — RPC-first with seed-JSON fallback when 0004 isn't present | (uncommitted) | typecheck
2026-04-26 05:55 | Phase 1 | Passenger map (`components/PassengerMap.tsx`) — 4 routes, named stop labels, kombi GeoJSON source, click-to-show-stops side panel, imperative source updates from Realtime broadcast (no React state for positions) | (uncommitted) | typecheck+lint+build
2026-04-26 06:30 | Phase 1 | Phase 1 gate verified — 4 routes drawn, 9 named stops visible, 8 kombis sliding (motion confirmed across 6s screenshot delta) at /?as=tendai | (uncommitted) | manual via Playwright

### Phase 1 known issues / follow-ups

- **Mapbox Directions densification fell back to raw** for all 4 routes — public token in `.env.local` lacks `directions:read` scope (HTTP 403). Routes display the hand-traced polylines, not road-snapped geometry. **Action:** widen the token's scopes in account.mapbox.com or issue a new token with Directions API enabled, then re-run `pnpm db:seed`.
- **Migration 0004 not yet applied to svika-dev** — page falls back to seed JSON for route geometry. Functionally identical right now (both raw polylines), but apply via Cowork/MCP so post-densification updates reach the page from DB.
- **Turbopack dev server panics consistently on this Windows machine** (`exit code 0xc0000142`). Phase 1 was verified against `pnpm start` (production build). For local dev iteration, recommend either dropping `--turbopack` from the `dev` script or using `pnpm build && pnpm start`.
- **Click-on-route handler binding** is wired in code (`map.on("click", "svika-routes-base", handler)` per Mapbox docs) but Playwright synthetic clicks didn't reach Mapbox's internal interaction system during the verification pass. Worth a manual check in the next interactive session.

## Phase 2 — Passenger experience

2026-04-26 07:30 | Phase 2 | Database types extended — tickets/trips/trip_tickets/transfers/audit_narratives row shapes added to `lib/supabase/types.ts` | (uncommitted) | typecheck
2026-04-26 07:32 | Phase 2 | Access-code helper (`lib/passenger/access-code.ts`) — random 3-digit code + PG_UNIQUE_VIOLATION constant for retry loop | (uncommitted) | typecheck
2026-04-26 07:35 | Phase 2 | Wallet reader (`lib/passenger/wallet.ts`) — pulls active tickets where persona is current_holder OR originator, decorates with route+stop names from seed | (uncommitted) | typecheck
2026-04-26 07:42 | Phase 2 | Server actions (`lib/passenger/actions.ts`) — findPlansAction (understand+planTrip), bookTripAction (mint tickets per leg with unique code retry, deduct credit), transferTicketAction (issued/held → transferred_pending + transfers row), claimTicketAction (transferred_pending → held, claim audit) | (uncommitted) | typecheck
2026-04-26 07:50 | Phase 2 | Passenger UI — `SearchBar` (presets + free text), `PlanList` (option cards, Buy CTA), `Wallet` drawer (3-digit codes, share/transfer per ticket) | (uncommitted) | typecheck+lint
2026-04-26 07:55 | Phase 2 | `PassengerShell` orchestrator — auto-claim on `?claim=`, search + plan + buy + share flow, router.refresh after every action; wraps Phase 1 PassengerMap | (uncommitted) | typecheck+lint+build
2026-04-26 07:58 | Phase 2 | Server client typing — cast createSsrServerClient return through `unknown as SupabaseClient<Database>` to dodge the 5-generic ssr signature collapsing tickets/trips/transfers Insert types to `never` | (uncommitted) | typecheck
2026-04-26 08:05 | Phase 2 | Phase 2 gate verified — passenger surface 200 at /?as=tendai with search bar + Wallet button rendering, planTrip("Heights","Avondale") returns 2 options ($1.50 / $2.50) | (uncommitted) | manual
2026-04-26 08:30 | Phase 2 | Phase 2 prod-verified — git push 0b2643a..2534f3d, https://svika.vercel.app/?as=tendai HTTP 200 with markers {Wallet, Where to, trip-search, Plan}; full smoke via scripts/phase2-prod-smoke.ts (Tendai → search → buy fastest $1.50 → wallet shows codes 289/724 → transfer to Rudo → /?as=rudo&claim=d07c4842-... → Rudo wallet shows 289) | 2534f3d | prod-smoke
2026-04-26 08:35 | Phase 2 | CLAUDE.md "Validation commands" tightened — every phase gate now requires git push + literal curl https://svika.vercel.app verification with named phase marker before BUILD-LOG entry | (uncommitted) | manual

### Phase 2 known issues / follow-ups

- **No new smoke test yet** — per CLAUDE.md hackathon exception, Playwright smoke ships at the Phase 5 gate. Manual test plan: load `/?as=tendai` → click "Heights to Avondale" preset → buy fastest option → wallet should show 2 access codes → tap "Share / transfer" on one → "Transfer to Rudo" → load `/?as=rudo&claim=<id>` → ticket should appear in Rudo's wallet.
- **Web Share API requires HTTPS** — falls back to clipboard on localhost (Wallet.tsx). The deep-link string is correct either way.
- **Booking has no DB transaction** — if `tickets` insert succeeds but `trip_tickets` link fails, the ticket is orphaned. Acceptable for the demo. A Postgres function wrapping the whole booking is roadmap.
- **No idempotency on claim** — re-loading `?claim=<id>` after claim shows "you already hold this ticket" but won't change state, which is correct behaviour.



## Phase 3 — Conductor and fleet surfaces

2026-04-26 16:20 | Phase 3 | Conductor server actions — `assignVehicleAction`, `redeemTicketAction` (3-digit code → ticket.status='redeemed', vehicle.current_passenger_count++), `cashWalkonAction` (mint cash_walkin ticket marked completed) (`lib/conductor/actions.ts`) | (uncommitted) | typecheck
2026-04-26 16:22 | Phase 3 | Conductor state loader — assigned vehicle, available kombi list, today's clears feed (`lib/conductor/state.ts`) | (uncommitted) | typecheck
2026-04-26 16:25 | Phase 3 | Fleet state loader — per-vehicle revenue from tickets + stop count from kombi_pings (5-min bucketed dedupe), totals strip, ZIMRA = 10% × monthly extrapolation (`lib/fleet/state.ts`) | (uncommitted) | typecheck
2026-04-26 16:27 | Phase 3 | Audit narrative pipeline — page is cache-only, never blocks on AI; deterministic English+Shona fallback on cache miss; `narrateAndCache` exposed for the warm script (`lib/fleet/audit.ts`) | (uncommitted) | typecheck
2026-04-26 16:30 | Phase 3 | Conductor UI — `PinKeypad` (3-digit fat-finger keypad with Enter/Clear + keyboard support), `RouteHeaderMap` (single-route Mapbox preview, non-interactive, route line + position dot), `ConductorShell` (vehicle picker → keypad → +Cash/Parcel → today's clears feed) | (uncommitted) | typecheck+lint
2026-04-26 16:32 | Phase 3 | Fleet UI — `VehicleCard` (per-kombi tile), `AuditPanel` (English/Shona tab toggle, generated-by metadata), `ZimraCard` (10% liability), `FleetShell` orchestrator with selectable vehicle drill-in | (uncommitted) | typecheck+lint
2026-04-26 16:35 | Phase 3 | Pages wired — `/hwindi` and `/fleet` swap from placeholder to full shells; `/fleet` runs cache-first narrative read in parallel across all owned kombis (no AI inline) | (uncommitted) | typecheck+lint+build
2026-04-26 16:40 | Phase 3 | Local sanity — pnpm start, /hwindi?as=farai shows ZH 4821 keypad markers, /fleet?as=baba_tino renders in 1.5s with revenue/zimra/audit panel markers | (uncommitted) | manual
2026-04-26 16:42 | Phase 3 | scripts/phase3-prod-smoke.ts written — drives /hwindi PIN entry on ZH 4821 with code 724 (cash-walkon fallback if already redeemed) then asserts /fleet revenue + ZIMRA + bilingual audit text | (uncommitted) | typecheck+lint+build
2026-04-26 16:43 | Phase 3 | scripts/warm-narratives.ts written — pnpm narrate:warm runs Ollama Gemma E2B for every fleet-owned kombi today and upserts into audit_narratives | (uncommitted) | typecheck+lint+build
2026-04-26 16:45 | Phase 3 | Phase 3 prod-verified — git push d0f15d6..8a92173, https://svika.vercel.app/hwindi?as=farai HTTP 200 with marker `hwindi-pin-keypad`, /fleet?as=baba_tino HTTP 200 with marker `fleet-audit-panel`; full smoke via scripts/phase3-prod-smoke.ts (Farai → code 724 → "Cleared 724 · $1.00 · 1/15 on board" → /fleet shows $1.00 revenue, $3.00 ZIMRA, English+Shona narrative) | 8a92173 | prod-smoke
2026-04-26 17:00 | Phase 3 | Audit cache warmed — pnpm narrate:warm produced 8/8 real Gemma 4 E2B narratives on first attempt (avg ~115s/inference), upserted into svika-dev audit_narratives for 2026-04-26. Bumped num_predict 512→1024 + 3-attempt retry loop hardens against Gemma's intermittent JSON truncation. | 8111b0d | manual
2026-04-26 17:05 | Phase 3 | Hydration fix — ConductorShell.prettyTime sliced HH:MM off the ISO string instead of toLocaleTimeString(undefined). Server UTC vs client locale was tripping React error #418 on /hwindi. Re-smoke confirms no page errors, /fleet now serves real Gemma bilingual narratives (211c en / 183c sn for ZH 4821) end-to-end through the audit_narratives cache. | 8111b0d | prod-smoke

### Phase 3 known issues / follow-ups

- **Audit narratives use deterministic fallback until `pnpm narrate:warm` is run.** Gemma 4 E2B on CPU is ~55s per inference (Phase 0 spike), too slow to call inline from the dashboard, and Vercel cannot reach localhost Ollama anyway. The warm script is the demo path: run it once a day on a machine with Ollama, then prod reads from `audit_narratives` cache. The fallback is honest English+Shona that mentions the right numbers, so the demo is never blank.
- **Stop count uses 5-minute bucket dedupe** — `kombi_pings` rows where `is_at_stop=true` are grouped by `(nearest_stop_id, 5-min bucket)`. This prevents a kombi sitting at a rank from inflating the count, but a vehicle that loiters >5 minutes at one stop will register a second stop. Acceptable for the demo.
- **Parcel button is a placeholder** — Phase 4 stretch 1 wires the parcel happy path. The button shows "Parcel handover ships in Phase 4" so the conductor screen still feels complete during the demo.
- **No DB transaction on redeem** — if `tickets` update succeeds but `vehicles` update fails, ticket is redeemed without the passenger-count bump. Acceptable for the demo. Postgres function wrapper is roadmap.

## Phase 4 — Companion surfaces and stretch

<!-- agent: append entries below as Phase 4 tasks complete -->

## Phase 5 — Demo production and submission

<!-- agent: append entries below as Phase 5 tasks complete -->
