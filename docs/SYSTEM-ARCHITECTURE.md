# System Architecture — Svika

## Shape of the system

Svika is one Next.js application with five route groups, one Supabase project as the data and realtime backbone, one Mapbox account for map rendering, one Gemini API key for cloud inference, and one local Ollama process running Gemma 4 E2B for the warmed audit narrative. There is no separate backend service, no microservices, no message queue, no third-party authentication, no payment gateway. The whole system is small enough to keep in your head.

## Surfaces

| Route | User | Device target | Tier |
|---|---|---|---|
| `/` | Brand landing page (no params) → "Continue as Takunda" CTA | Mobile-first web | Tier 1 |
| `/?as=takunda` (or `?as=rudo`, `?claim=<id>`) | Passenger surface | Mobile-first web | Tier 1 |
| `/hwindi?as=farai` | Conductor (Farai) | Phone, fullscreen, big tap targets | Tier 1 |
| `/fleet?as=baba_tino` | Fleet owner (Baba Tino) | Desktop laptop | Tier 1 |
| `/wa?as=takunda` | WhatsApp companion (mocked) | Mobile-first web styled like WhatsApp | Tier 1 |
| `/ussd-mock` | Carrier-menu preview | Mobile, Nokia-style | Tier 2 |
| `/api/ai-diag` | Prod sanity check for both AI jobs | n/a | Tier 1 |

The same `app/(landing)/page.tsx` dispatcher serves both the brand landing (no query params) and the passenger surface (with `?as=` or `?claim=`) — there is no separate `(passenger)` route group. The brand landing is the canonical front door; the passenger surface is what the "Continue as Takunda" link routes into.

All surfaces live in one codebase with shared components, shared brand tokens, and one Supabase client pair (`lib/supabase/client.ts` for the browser, `lib/supabase/server.ts` for server actions and route handlers).

## Authentication

There is no real authentication for the hackathon. Persona is selected only via the `?as=` query parameter — `?as=takunda`, `?as=rudo`, `/hwindi?as=farai`, `/fleet?as=baba_tino`. Demo accounts are pre-seeded in `supabase/migrations/0003_demo_users.sql`. Since Phase 3.8, the user-facing UI offers no persona switcher. The brand landing has a single full-width "Continue as Takunda" button plus a small secondary line linking to `/hwindi` and `/fleet` for direct demo deep-links. Rudo's surface is reachable only via a shared claim URL (`/?as=rudo&claim=<ticket-id>`).

In the roadmap, real authentication moves to Supabase magic-link or one-time SMS code via the carrier-menu system.

## Data and state

Supabase PostgreSQL with PostGIS is the single source of truth. Tables and the ticket state machine are described in `docs/DATA-MODEL.md`. Migrations are versioned in `supabase/migrations/` and applied via `supabase db push`. As of Phase 4 the migration set is:

- `0001_initial_schema.sql` — core tables (users, routes, stop_points, route_stops, fare_segments, transfer_points, vehicles, tickets, trips, trip_tickets, transfers, kombi_pings, audit_narratives)
- `0002_indexes.sql` — performance indexes
- `0003_demo_users.sql` — pre-seeded demo accounts (Takunda, Rudo, Farai, Baba Tino)
- `0004_geo_rpcs.sql` — `routes_geojson()`, `stop_points_geojson()`, `route_stops_ordered()` PostGIS-to-GeoJSON helpers
- `0005_payment_method.sql` — `tickets.payment_method` column (`wallet` or `cash`) plus the `top_ups` ledger
- `0006_wa_nearest_vehicle.sql` — `nearest_vehicles_to_point(lat, lng, limit)` RPC powering the WhatsApp `kombi near me` command

For the demo, the server actions use the service-role key and bypass row-level security entirely. Real persona-scoped row-level security is roadmap.

## Realtime channels

There is one Supabase Realtime channel — `kombi-positions`, defined in `lib/sim/simRunner.ts` as `SIM_CHANNEL`. Two events flow over it:

- `tick` — the simulation runner broadcasts a batch of `KombiTickPayload` entries every two seconds (vehicle id, route id, lat, lng, bearing).
- `ticket-redeemed` — the conductor screen broadcasts a `TicketRedeemedPayload` whenever `redeemTicketAction` succeeds (ticket id, vehicle id, current holder, redeemed-at, passenger count).

The passenger surface subscribes to both. `PassengerMap` uses the `tick` stream to drive eased per-vehicle interpolation. `Journey` uses both — `tick` to recompute the live stage and ETA, `ticket-redeemed` to flash the boarding moment ahead of revalidation. `PassengerShell` listens for `ticket-redeemed` filtered to the current persona and surfaces the "Fare cleared by Farai" glass toast.

There is no row-level Realtime in use. State changes are propagated either through the `kombi-positions` channel or through `router.refresh()` after a server action.

## Simulation runner

`scripts/sim-runner.ts` (calling into `lib/sim/simRunner.ts`) ticks every two seconds, advances each kombi along its route polyline at a realistic speed, computes a forward-looking bearing for each vehicle, writes the new position to the `vehicles` table, appends a `kombi_pings` row, and broadcasts the batch on `kombi-positions`. It is started manually for the demo. When the runner is not running, the database holds the last-known position of every kombi and the map renders that, but no eased motion happens.

## Map rendering and the Phase 4.5 motion pipeline

The Mapbox GL JavaScript v3 library renders the map shell. Routes are drawn as line layers using polylines from `seed/network.json` (passed through Mapbox's Directions API for road-snapping when a server-side `MAPBOX_SECRET_TOKEN` is configured; otherwise the raw seed polylines render directly). Stop points are rendered as a symbol layer with rust-tinted halos and labels at zoom-dependent thresholds. Kombi positions are rendered as a symbol layer with a top-down kombi SVG icon registered as `kombi-icon`, sized 1.0 for the assigned vehicle and 0.7 for everything else, and rotated by `icon-rotate: ['get','bearing']`.

Per-vehicle motion is eased by a `requestAnimationFrame` loop. Each `tick` broadcast lands in an interpolation buffer keyed by vehicle id (`interpRef`), and the loop interpolates between the previous and next sample over ~1.5 seconds with shortest-arc bearing lerp. The loop stops once every entry has finished its lerp, and the GeoJSON source is only `setData`-ed when at least one vehicle is mid-broadcast — Mapbox's `loaded()` flag stays usable. The kombi SVG itself is rasterised from an inline `data:image/svg+xml,…` payload because fetching the file at `/brand/kombi.svg` keeps `loaded()` permanently false on prod (a known Mapbox issue with cross-origin SVGs), even though the file is served correctly. The standalone file remains in `public/brand/` as the design source.

The map wrapper inside `PassengerShell` is pinned with `absolute inset-0` rather than relying on percentage heights, so Mapbox always initialises the canvas at full container height (regression caught at the Phase 3.5 → 4.5 boundary).

When a journey is active, the map fits bounds around the boarding stop, the leg endpoints, the walking polyline, and the broadcasting vehicles on the active route, with 80 px padding and a max zoom of 14.5; on `arrived`, it eases back to the full Harare network at 40 px. The active route line is rust-highlighted and other routes are faded to 0.22 opacity. The assigned vehicle gets a breathing rust halo (~2.2 s cycle) and other vehicles dim to 0.55 opacity.

## Trip planning

The trip planner is a function that takes an origin stop identifier, a destination stop identifier, and an optional preference flag, and returns one or more plan options. For the hackathon, the planner reads pre-computed plans from `seed/network.json` (the `trip_plans` array) rather than running a graph-search algorithm. This is honest scope reduction. The planner returns real plans for the demo origin-destination pairs and reports "no plan available" for any pair not pre-computed. A graph-search planner is in the roadmap.

## Ticket lifecycle and payment method

A ticket starts as `issued` when a passenger buys it. It moves to `transferred_pending` when shared, then to `held` once the recipient claims it. It becomes `redeemed` when a conductor enters the access code on a kombi, and `completed` when the kombi reaches the destination stop. Cash walk-ons created on the conductor screen are minted directly as `cash_walkin` and finalised immediately. Parcels mint as `kind='parcel'` tickets and finalise on conductor accept (no separate "completed" stage on the kombi). The state diagram is in `docs/diagrams/ticket-lifecycle.mmd`.

Since Phase 3.7, every passenger ticket also carries a `payment_method` of `wallet` or `cash`. Wallet bookings deduct credit at purchase. Cash bookings reserve the seat and skip the deduction; the conductor's redeem flash branches on the value, showing a salmon "$ Cash" pill plus "Collect $X.XX from passenger" for cash tickets and the regular teal "Cleared" pill for wallet tickets.

Every transition is a server action (`lib/passenger/actions.ts` or `lib/conductor/actions.ts`). Client-side code never mutates ticket state directly.

## Artificial intelligence layer

Two jobs, two providers, switchable per job.

### Job one: natural-language understanding

Turns a passenger's text input ("Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights") into a structured intent — origin stop, destination stop, willingness to walk. The structured intent then drives the trip planner. The same job parses WhatsApp commands.

### Job two: bilingual audit narrative

Given per-kombi structured data (stops made, fares logged, cash boardings, gap estimate), generates a short narrative in English and Shona explaining where revenue gaps exist. Includes the ZIMRA liability estimate.

### Inference path

Two providers, configured via two independent environment variables:

- `UNDERSTAND_PROVIDER` (default `gemini`) — Gemma 4 E2B on a CPU laptop is too slow for the interactive understand path (~55 s in the Phase 0 spike), so Gemini 2.5 Flash is the prod default. Gemma is still wired and selectable via `UNDERSTAND_PROVIDER=ollama` for local rehearsal.
- `NARRATE_PROVIDER` (default `ollama`) — the audit narrative is warmed once a day by `pnpm narrate:warm` running Gemma locally, then upserted into `audit_narratives`. The fleet dashboard reads from cache and never blocks on AI inline. If the cache is cold, a deterministic English+Shona fallback fills in.

A single thin module (`lib/ai/aiClient.ts`) wraps both providers behind `aiClient.understand(input)` and `aiClient.narrate(stats)`. Switching providers is one environment-variable flip.

The Phase 0 Shona spike scored 8/13 intents with Gemma 4 E2B at ~55 s average latency. Plan B activated at the gate: Gemini for understanding, Gemma for the audit narrative.

`/api/ai-diag` runs both jobs against sample inputs and returns provider, ok, latency, and a one-line preview, so a prod outage is visible without driving the full passenger flow.

## Mocked WhatsApp companion

A page at `/wa` styled like WhatsApp green bubbles. Three commands are recognised by a small heuristic parser (`lib/wa/commands.ts`):

- `balance` — reads `users.credit_balance_usd`.
- `kombi near me` — calls the `nearest_vehicles_to_point(lat, lng, limit)` PostGIS RPC against `vehicles.current_position` (active = position recorded within 30 minutes; ETA computed at 25 km/h average).
- `transfer NNN to +PHONE` — resolves the recipient by phone, flips the ticket to `transferred_pending`, inserts a `transfers` row, and replies with the claim URL.

The reply layer is a server action (`lib/wa/actions.ts`). The `understand` AI is *not* in the WhatsApp path — the parser is deterministic. No Twilio, no Meta integration, no real WhatsApp.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public access token (renders the map) |
| `MAPBOX_SECRET_TOKEN` | Mapbox secret token with `directions:read` (server-only; densifies route polylines at seed time). When missing, raw seed polylines render. |
| `OLLAMA_BASE_URL` | Local Ollama URL, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Model tag, default `gemma4:e2b-it-q4_K_M` |
| `UNDERSTAND_PROVIDER` | `ollama` or `gemini`, default `gemini` (prod) |
| `NARRATE_PROVIDER` | `ollama` or `gemini`, default `ollama` (warmed locally) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` (10 RPM, 250/day on the free tier) |
| `NEXT_PUBLIC_DEMO_MODE` | When `true`, demo affordances render (currently a no-op in the user UI since Phase 3.8 — kept for direct deep-links) |

## Realtime data flow — one example

Takunda's "fare cleared by Farai" toast end-to-end:

1. Farai taps `4`, `8`, `2`, Enter on `/hwindi?as=farai`.
2. `redeemTicketAction` validates the code, marks the ticket `redeemed`, increments the vehicle's `current_passenger_count`, and broadcasts a `ticket-redeemed` event on the `kombi-positions` channel with the ticket id, vehicle id, current holder, redeemed-at timestamp, and seat count.
3. `PassengerShell` (subscribed on Takunda's phone) filters by `current_holder_user_id === persona.id`, fetches the conductor name and seat count via `fetchFareClearedContextAction`, and surfaces the glass toast.
4. The `Journey` component (also subscribed) sees the same broadcast, advances its stage, flashes the boarding icon, and triggers a `router.refresh()` so the next render reads the canonical post-redeem state from the server.
5. The simulation runner's next `tick` carries the updated `current_passenger_count` along with the kombi's new position.

All three effects propagate to Takunda's screen without him navigating anywhere.

## Hosting and deployment

- Vercel Hobby plan with the GitHub repository connected for automatic deployment on push to `main`. Domain: `svika.vercel.app`.
- Supabase free-tier project (`svika-dev`) hosted in the closest region. A daily heartbeat ping keeps the project warm against the seven-day pause.
- Ollama runs on the developer's laptop for the audit narrative warm script.
- Gemini API access powers the `understand` job in production.

## What this architecture explicitly does not do

- No microservices, no service mesh, no Kubernetes
- No third-party authentication
- No payment gateway
- No production telemetry or observability beyond `/api/ai-diag`
- No internationalisation framework — Shona and English strings are inline
- No persona-scoped row-level security in the demo (the service-role bypass is documented in code comments)
- No load balancing — single Vercel deployment, single Supabase project
- No multi-region replication
- No backup or disaster recovery for the seeded demo data — the seed file is the recovery
- No live AI inline on the fleet dashboard — the audit narrative is read from cache, never generated on render
