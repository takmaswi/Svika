# Execution Plan — Svika

## Hard deadline

Hackathon submission closes **2026-04-30 at 23:59 Central African Time**.

The plan is organised in **phases with gates**, not days. Phases 0 through 4.5 have shipped — what follows records what actually landed (with the commit shape from `docs/BUILD-LOG.md`) so the plan stays readable as a checkpoint, not a wishlist. Phase 5 is the only forward-looking section.

## Phase 0 — Foundations and the Gemma verification spike — DONE

**Gate:** Gemma 4 E2B can either understand Shona well enough or be replaced cleanly by Gemini. The repository runs locally. Mapbox and Supabase are wired. Brand assets are committed.

### What shipped

- Pulled `gemma4:e2b-it-q4_K_M` into Ollama. Ran the Shona spike — 8/13 intents, 55 s average latency. **Latency failed**, plan B activated: Gemini for the interactive `understand` job, Gemma kept for the warmed audit narrative.
- Next.js 16 App Router + TypeScript 5 + Tailwind v4.1 (CSS-first config in `app/globals.css`) scaffolded with brand tokens.
- Supabase project `svika-dev` created. PostGIS enabled. Migrations 0001–0003 applied. Daily heartbeat ping configured to keep the project warm.
- Mapbox account opened with a $0 spending cap. Public token in `.env.local`.
- `aiClient.ts` shipped with per-job `UNDERSTAND_PROVIDER` / `NARRATE_PROVIDER` switches. Defaults: `gemini` for understand, `ollama` for narrate.
- Vercel project linked. Eight environment variables set. First production deploy at `svika.vercel.app`.

### Verified

Four surfaces returned 200 with persona and brand markup at `https://svika.vercel.app`. Commit `81444d2`.

## Phase 1 — The network on the map — DONE

**Gate:** opening the passenger surface shows the four kombi routes drawn on the map, the named stops as labelled markers, and at least two simulated kombis sliding along their routes in real time.

### What shipped

- Database types extended for the seed (`seed/schema.ts`), Database shape with `__InternalSupabase` discriminator added to `lib/supabase/types.ts`.
- Mapbox Directions densifier with silent raw-polyline fallback when the public token lacks `directions:read`. Server-side `MAPBOX_SECRET_TOKEN` path added later in Phase 3.6 for road-snapping.
- Sim geometry helpers (haversine, polyline length, point-at-distance, advance, WKT) in `lib/sim/geometry.ts`.
- Idempotent seed loader populated the network: stops, routes (densified or raw), route_stops, fare_segments, transfer_points, eight vehicles (two per route), initial pings.
- Migration 0004 added `routes_geojson()`, `stop_points_geojson()`, `route_stops_ordered()` — with seed-JSON fallback when 0004 isn't present.
- Sim runner (`lib/sim/simRunner.ts` + `scripts/sim-runner.ts`) ticks every two seconds, broadcasts on the `kombi-positions` channel, updates `vehicles` and appends `kombi_pings`.
- Passenger map (`components/PassengerMap.tsx`) with four routes, named stop labels, kombi GeoJSON source, and imperative source updates from the Realtime broadcast.

### Verified

Four routes drawn, nine named stops visible, eight kombis sliding (motion confirmed across a 6-second screenshot delta) at `/?as=tendai` (later renamed to Takunda in Phase 3.8).

## Phase 2 — Passenger experience — DONE

**Gate:** the passenger can plan a Heights-to-Avondale trip, see two options, choose one, buy two tickets, view them in his wallet, and transfer one to Rudo via a share sheet. Rudo can claim the transferred ticket.

### What shipped

- `lib/passenger/access-code.ts` with a 3-digit access code + retry on `PG_UNIQUE_VIOLATION`.
- Wallet reader (`lib/passenger/wallet.ts`) pulling active tickets where the persona is `current_holder` or `originator`, decorated with route + stop names from the seed.
- Server actions for the full passenger flow (`lib/passenger/actions.ts`): `findPlansAction`, `bookTripAction`, `transferTicketAction`, `claimTicketAction`.
- Passenger UI: `SearchBar` with presets and free text, `PlanList` with option cards and a Buy CTA, `Wallet` drawer with 3-digit codes and per-ticket share/transfer.
- `PassengerShell` orchestrator with auto-claim on `?claim=`, full search → plan → buy → share flow, `router.refresh()` after every action.
- Server-client typing patched to dodge the 5-generic ssr signature collapsing tickets/trips/transfers Insert types to `never`.

### Verified

`scripts/phase2-prod-smoke.ts` drove the full Tendai → search → buy fastest $1.50 → wallet shows codes 289/724 → transfer to Rudo → `/?as=rudo&claim=...` → Rudo wallet shows 289 against the live Vercel surface. Commit `2534f3d`.

## Phase 3 — Conductor and fleet surfaces — DONE

**Gate:** Farai can clear a fare with a PIN entry on `/hwindi`. He can log a cash walk-on. The fleet dashboard shows the result. Baba Tino sees the bilingual Gemma audit narrative and the ZIMRA liability card.

### What shipped

- Conductor server actions (`lib/conductor/actions.ts`): `assignVehicleAction`, `redeemTicketAction` (3-digit code → ticket `redeemed` + passenger count++), `cashWalkonAction` (mints `cash_walkin` ticket, finalised immediately).
- Conductor state loader and fleet state loader.
- Audit narrative pipeline (`lib/fleet/audit.ts`) — page is cache-only, never blocks on AI; deterministic English+Shona fallback on cache miss; `narrateAndCache` exposed for the warm script.
- Conductor UI: `PinKeypad` (3-digit fat-finger keypad with keyboard support), `RouteHeaderMap` (single-route Mapbox preview), `ConductorShell` (vehicle picker → keypad → +Cash/Parcel → today's clears).
- Fleet UI: `VehicleCard`, `AuditPanel` (English/Shona toggle, generated-by metadata), `ZimraCard` (10% liability), `FleetShell`.
- `scripts/warm-narratives.ts` — `pnpm narrate:warm` runs Ollama Gemma E2B for every fleet-owned kombi today and upserts into `audit_narratives`. First run produced 8/8 real Gemma narratives; bumped `num_predict` 512→1024 + 3-attempt retry hardens against intermittent JSON truncation.

### Verified

`scripts/phase3-prod-smoke.ts` drove the full Farai → code 724 → "Cleared 724 · $1.00 · 1/15 on board" → `/fleet` shows revenue, ZIMRA, and bilingual audit text against prod. Hydration fix on `prettyTime` resolved a server-UTC vs client-locale React #418 error. Commit `8111b0d`.

## Phase 3.5 — Journey UX — DONE

**Gate:** the passenger surface shows a live, six-stage journey card driven by the simulation runner and the conductor's redeem broadcast, without persona switching.

### What shipped

- Active-journey loader (`lib/passenger/journey.ts`) picks the most-recent in-flight trip, reconstructs walk legs from seed `trip_plans`, and returns ordered kombi+walk legs with per-leg ticket status.
- Stage derivation (`lib/passenger/journey-stage.ts`) — pure functions that map vehicle positions and ticket statuses to one of six stages (walk-to-board, boarding, in-transit, walking-transfer, boarding-leg-2, arrived).
- Journey bottom sheet — sticky, "Stage N of M" header, rust square stage icon with boarding flash, animated rust progress bar, expand-to-timeline. Subscribes to the `kombi-positions` and the new `ticket-redeemed` broadcasts.
- Conductor `redeemTicketAction` now broadcasts `ticket-redeemed` on the existing `kombi-positions` channel.
- Map overlays: fade non-active routes to 0.22, rust-highlight the active leg, render walking-transfer dashed line, breathing halo on the assigned kombi.
- Title cross-fade fix using a CSS keyframe (replaces a JS-driven opacity swap that could land at opacity 0).
- **Map-blank regression fix** — moved `stage` and `journey` out of the map-build effect's deps; the build effect now depends only on `(network, mapboxToken)` and reads stage/journey through refs. Without the fix, every JourneyStage update tore down a half-built map and the WebGL canvas never composited a single tile.

### Verified

`scripts/phase3-5-prod-smoke.ts` drove farai (ZH 4821) to redeem code 109 against running prod; sheet advanced from `walk-to-board` to `in-transit`. Commit `aeae59b`.

## Phase 3.6 — Visual polish — DONE

### What shipped

- Top-down minibus SVG marker (replacing rust circles), `bearing` field on every tick payload computed in `simRunner` via `lookAheadPoint`, drives `icon-rotate`.
- `fitBounds`-on-trip-change keyed on `journey?.trip_id`.
- Plain-English copy audit across the journey sheet ("Walk to your kombi at X", "On your way to X", "Catch your next kombi · code Y", "You've arrived").
- Pre-trip hero (`components/passenger/SearchHero.tsx`) — *"Where to, &lt;persona&gt;?"* headline, three preset destination cards.
- Stop-label polish: zoom-dependent visibility, rust halos on active-trip stops.
- `MAPBOX_SECRET_TOKEN` (server-only) added to densify route polylines at seed time. (Token still pending user provisioning at the time of the rehearsal — coarse hand-traced polylines render until then.)
- End-trip `×` affordance + `endTripAction` + (since-removed) persona switcher dropdown.

### Verified

`scripts/phase3-5-rehearsal.ts` walked all six stages end-to-end against prod with the new copy. Six rehearsal screenshots. Commit `fe0f162`.

## Phase 3.7 — Visual rebuild + payment choice + brand landing — DONE

### What shipped

- Design system rewritten in `app/globals.css` — cooler `--color-svika-teal #0F4C5C`, salmon `#F2733E` for FEATURED tags, off-white `#FAFAF9` base, glass utilities.
- Brand landing at `app/(landing)/page.tsx` (now the canonical root). 2x2 persona picker — *later removed in Phase 3.8*.
- New passenger empty state with bento grid (one large featured Avondale tile + two small tiles).
- Header chip pattern with avatar + name + balance.
- Cash-vs-wallet payment via `PaymentChoiceSheet` (rust wallet button, teal-outline cash button).
- `TopUpSheet` — `$2 / $5 / $10 / $20` grid calling `topUpAction` (mocked, logs to `top_ups` table).
- Walking-transfer detail in `Journey.tsx` — derives "Walk west on Lomagundi Road" from the seed transfer record.
- Conductor-side cash badge — when a redeemed ticket has `payment_method='cash'`, the feedback flash shows a salmon "$ Cash" pill plus "Collect $X.XX from passenger".
- Migration `0005_payment_method.sql` — `tickets.payment_method` column (`wallet` or `cash`) plus the `top_ups` ledger.

### Verified

Prod-curl confirmed all SSR markers (`Try the demo`, `Where every kombi`, `Built for Harare`, `FEATURED`, `Pay $1.50 from wallet`, `Walk west on`). Commit `e533834`.

## Phase 3.8 — Single-user Takunda narrative pivot — DONE

### What shipped

- Renamed Tendai → Takunda everywhere (DB user row updated via `scripts/phase3-8-rename-takunda.ts`; UUID preserved so prior trips/tickets/transfers keep linking). Codebase, scripts, smoke tests, seed loader, migrations and docs updated.
- Removed the user-facing persona switcher from `PassengerShell`; the header chip is now a static identity badge. Landing page replaced the 2x2 persona-picker grid with a single full-width 56 px rust "Continue as Takunda" CTA plus a small secondary line linking to `/hwindi` and `/fleet` for direct deep-links.
- `FareClearedToast` driven by a Realtime subscription in `PassengerShell` — on every redeem broadcast for a ticket Takunda holds, the surface fetches the conductor name and seat count via `fetchFareClearedContextAction` and surfaces a glass top-toast.
- `FleetImpactCard` injected into the arrived sheet — disclosure row "Your $1.50 just landed in Baba Tino's ledger ›" expands to today's revenue (digital + cash split) plus a "See full fleet dashboard →" link.
- Removed the unconditional "Tap a route line to see its stops" hint from `PassengerMap`.

### Verified

`scripts/phase3-5-rehearsal.ts` drove all six stages against prod, with the rehearsal screenshots in `scripts/phase3-8-screenshots/` capturing the brand landing, empty state, walk-to-board, fare-cleared toast, arrived collapsed, and impact card expanded. Commit `2df6b32`.

## Phase 4 — Companion surfaces and stretch — DONE

### What shipped

- `/wa` WhatsApp companion with a heuristic command parser (`lib/wa/commands.ts`), Meta-style green-bubble chat, and three suggestion chips.
- `balance` reads `users.credit_balance_usd`.
- `kombi near me` calls the new RPC `nearest_vehicles_to_point(lat, lng, limit)` against `vehicles.current_position` (active = position recorded within 30 minutes; ETA at 25 km/h average). Migration `0006_wa_nearest_vehicle.sql` applied.
- `transfer NNN to +PHONE` resolves recipient by phone, flips the ticket to `transferred_pending`, inserts a `transfers` row.
- Parcel happy path: `bookParcelAction` mints `kind='parcel'` ticket on `route_heights_rezende`; `redeemParcelAction` flips it to `redeemed` + `completed_at` and pins `vehicle_id`. Passenger surface gets a `Parcel` pill next to Wallet → opens `ParcelSheet`. Conductor's existing Parcel button toggles parcel-PIN mode on the same `PinKeypad`.
- `/ussd-mock` — static Nokia-style menu (Balance / Plan trip / Transfer ticket).
- `EmergencyContactsCard` injected into `FleetShell` right column with two hardcoded contacts.
- `app/api/ai-diag/route.ts` runs both AI jobs and returns provider + ok + latency + preview.
- `data-testid="booking-flash"` and `booking-flash-codes` for the parcel smoke.

### Verified

`scripts/phase4-prod-smoke.ts` drove an eight-step flow against prod: `/wa` empty state → balance → kombi near me → transfer with DB verification → parcel send + accept with DB verification → `/api/ai-diag` confirming both jobs run through Gemini 2.5 Flash → `/ussd-mock` and emergency card render. Commit `9735f67`.

## Phase 4.5 — Premium passenger motion + Uber-style journey card — DONE

### What shipped

- `public/brand/kombi.svg` (top-down Hiace, cream body, teal stripe, rust bumper, soft drop shadow). Registered in PassengerMap as `kombi-icon`. Symbol layer driven by `icon-rotate: ['get','bearing']` and `icon-size` 1.0/0.7 case on `is_assigned`.
- Per-vehicle interpolation buffer + `requestAnimationFrame` loop ease each kombi between previous and next sample over ~1.5 s, with shortest-arc bearing lerp. Broadcast handler stops writing the GeoJSON source directly.
- `fitBounds` for the active trip uses padding 80 + maxZoom 14.5.
- Journey card swap: driver chip (Farai · Conductor + plate · Toyota Hiace · cream), live "Arriving in N min" minute readout (rust mono) during in-transit, drop-off line, 700 ms eased progress bar.
- Parcel-parity branch in the journey card: "Carrying parcel" pill, status-driven stage line ("Parcel waiting to board / in transit / delivered"), receiver-phone hand-off line, "Parcel code: NNN · revealed to receiver on arrival" footer. Loader synthesises a single-leg ActiveJourney for any in-flight parcel; the `×` button does a local dismiss for parcels (no `trips` row).
- Series of motion-pipeline fixes: drop `crossOrigin` on the icon Image load; gate `setData` on actual motion to avoid pinning Mapbox `loaded()` to false; pin map wrapper to `absolute inset-0` so the canvas always sizes to the section; switch `kombi-icon` back to inline `data:image/svg+xml,…` rasterisation because fetching the SVG file kept `loaded()` false on prod.

### Verified

`scripts/phase4-5-tile-probe.ts` headed (Mapbox v3 + chromium headless captures a transparent canvas, so the probe runs headed). Basemap renders fully (streets, route highlight, kombi SVG marker rendered at the assigned-vehicle position with rust halo). `scripts/phase3-5-rehearsal.ts` re-run headed and captured the six stages with the new artwork: walk-to-board chip showing `F · Farai · Conductor · — · Toyota Hiace · cream`, in-transit showing `Arriving in 20 min`, walking-transfer fallback to `— · Toyota Hiace · cream`, leg-2 showing `ZH 5101 · Toyota Hiace · cream + Arriving in 5 min`, arrived collapse summary `31 min · $1.50 + Plan another`. `scripts/phase4-5-motion-verify.ts` confirmed eased mid-broadcast samples between three two-second ticks. Commit `2a981fb`.

## Phase 5 — Demo production and submission — TO DO

**Gate:** the three-minute video is recorded, edited, and uploaded. The README is published with tier labels matching the script. The pitch deck is exported. The hackathon submission form is filled and submitted.

### Tasks

- [ ] Record each scene from `docs/DEMO-SCRIPT.md`. Multiple takes per scene. Save raw footage. The simulation runner must be running for every take to make markers move.
- [ ] Edit the video. Add brand title cards, voiceover, on-screen text. Keep total at three minutes including the twenty-second roadmap tail.
- [ ] Render and upload the video to YouTube unlisted, or to whatever the submission form requires.
- [ ] Write the README. Sections: vision, what's built (Tier 1), what's demonstrated (Tier 2), roadmap (Tier 3), how to run, screenshots, video link. Mirror the tier list from `docs/PRODUCT-REQUIREMENTS.md`.
- [ ] Build the eight-slide pitch deck following `docs/PITCH-DECK-OUTLINE.md`. Export to PDF.
- [ ] First Playwright smoke test (per the hackathon exception in `CLAUDE.md`, TDD was downgraded to one smoke test per surface, run at the Phase 5 gate).
- [ ] Final smoke on a clean browser: open `/`, click "Continue as Takunda", run through the full passenger flow including parcel and transfer. Then `/hwindi?as=farai`, `/fleet?as=baba_tino`, `/wa?as=takunda`, `/ussd-mock`.
- [ ] Apply migration 0005 to `svika-dev` if not already applied (the cash flow needs `tickets.payment_method` to exist).
- [ ] Provision `MAPBOX_SECRET_TOKEN` and re-run `pnpm db:seed` so the four route polylines render road-snapped instead of hand-traced.
- [ ] Fill the submission form. Submit. Take a screenshot of the confirmation.

### What "passed" looks like

- The submission confirmation screen exists.
- The repository is public and clean.
- Anyone with the video link can watch the demo end to end without needing to log in.

## Buffer

Anything left after Phase 5 is buffer. Use it to:
- Fix bugs found in the smoke test
- Polish the brand
- Re-record a scene that did not land
- Apply the Mapbox secret token if it was not provisioned in time

Do not start new features in buffer. Buffer is for finishing what is half-done.

## Anti-patterns

- Do not start a new phase before the previous gate is genuinely passed. "Mostly working" is not passed.
- Do not change the seed data once Phase 1 is complete. The demo script depends on the planted discrepancy in the audit narrative.
- Do not implement anything from the cut list. If a stretch feature is taking too long, drop it — Phase 4 stretches 1, 2, 3 are the documented drop order.
- Do not push the recording date.
