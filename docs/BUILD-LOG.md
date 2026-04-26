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

### Phase 2 known issues / follow-ups

- **No new smoke test yet** — per CLAUDE.md hackathon exception, Playwright smoke ships at the Phase 5 gate. Manual test plan: load `/?as=tendai` → click "Heights to Avondale" preset → buy fastest option → wallet should show 2 access codes → tap "Share / transfer" on one → "Transfer to Rudo" → load `/?as=rudo&claim=<id>` → ticket should appear in Rudo's wallet.
- **Web Share API requires HTTPS** — falls back to clipboard on localhost (Wallet.tsx). The deep-link string is correct either way.
- **Booking has no DB transaction** — if `tickets` insert succeeds but `trip_tickets` link fails, the ticket is orphaned. Acceptable for the demo. A Postgres function wrapping the whole booking is roadmap.
- **No idempotency on claim** — re-loading `?claim=<id>` after claim shows "you already hold this ticket" but won't change state, which is correct behaviour.



## Phase 3 — Conductor and fleet surfaces

<!-- agent: append entries below as Phase 3 tasks complete -->

## Phase 4 — Companion surfaces and stretch

<!-- agent: append entries below as Phase 4 tasks complete -->

## Phase 5 — Demo production and submission

<!-- agent: append entries below as Phase 5 tasks complete -->
