# System Architecture — Svika

## Shape of the system

Svika is one Next.js application with four route groups, one Supabase project as the data and realtime backbone, one Mapbox account for map rendering, and one local Ollama process running Gemma 4 E2B for natural-language work. There is no separate backend service, no microservices, no message queue, no third-party authentication, no payment gateway. The whole system is small enough to keep in your head.

## Surfaces

| Route | User | Device target | Tier |
|---|---|---|---|
| `/` | Passenger (Takunda; Rudo via shared claim link only) | Mobile-first web | Tier 1 |
| `/hwindi` | Conductor (Farai) | Phone, fullscreen, big tap targets | Tier 1 |
| `/fleet` | Fleet owner (Baba Tino) | Desktop laptop | Tier 1 |
| `/wa` | WhatsApp companion (mocked) | Mobile-first web styled like WhatsApp | Tier 1 (basic), Tier 2 (richer commands) |

All four surfaces live in one codebase with shared components, shared brand tokens, shared Supabase client. Persona is selected via a `?as=` query parameter for the demo. No real authentication.

## Data and state

Supabase PostgreSQL is the single source of truth. Tables are described in `docs/DATA-MODEL.md`. Row-level security is enabled only on user-facing tables and uses the persona query parameter to scope reads and writes during the demo.

Supabase Realtime channels deliver:
- Kombi position updates (every two seconds, pushed by the simulation runner)
- Ticket state changes (issued, transferred, redeemed)
- Trip events (boarded, alighted)

The passenger app, conductor screen, and fleet dashboard subscribe to the channels they care about. No polling.

## The simulation runner

A small server-side process pushes kombi positions to the database every two seconds, advancing each kombi along its route polyline at a realistic speed. For the hackathon, this runs as a Next.js route handler triggered manually for the demo, or as a tiny Node script started during the demo. It is not production telemetry.

When the runner is not running, the database holds the last-known position of every kombi. The map renders that. The user can manually re-trigger the simulation between demo takes.

## Map rendering

The Mapbox GL JavaScript library renders the map shell. Routes are drawn as line layers using the polylines from `seed/network.json`. Stop points are rendered as small circles with labels. Kombi positions are rendered as markers that update by injecting new feature-collection data into the relevant Mapbox source — the React state tree is not used to track moving positions, because that would freeze the user's phone.

The map style is a clean light Mapbox style adapted to the brand palette where possible.

## Trip planning

The trip planner is a function that takes an origin stop identifier, a destination stop identifier, and an optional preference flag (such as "willing to walk"), and returns one or more plan options. For the hackathon, the planner reads pre-computed plans from `seed/network.json` (the `trip_plans` array) rather than running a graph-search algorithm. This is honest scope reduction: the planner returns real plans for the demo origin-destination pairs and reports "no plan available" for any pair not pre-computed. A graph-search planner is in the roadmap.

## Ticket lifecycle

A ticket starts as `issued` when a passenger buys it. It moves to `transferred_pending` when shared, then to `held` once the recipient claims it. It becomes `redeemed` when a conductor enters the access code on a kombi, and `completed` when the kombi reaches the destination stop. The state diagram is in `docs/diagrams/ticket-lifecycle.mmd`.

Every transition is a server function call wrapped in a database transaction. Client-side code never mutates ticket state directly.

## Artificial intelligence layer

Two jobs, one model family.

### Job one: natural-language understanding

Turn a passenger's text or voice input ("Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights") into a structured intent: origin stop, destination stop, willingness to walk. The structured intent then drives the trip planner.

### Job two: bilingual audit narrative

At end of day, given per-kombi structured data (stops made, fares logged, cash boardings, parcel deliveries), generate a short narrative in English and Shona explaining where revenue gaps exist. Includes the ZIMRA liability estimate.

### Inference path

Local first, cloud fallback:

1. Ollama running Gemma 4 E2B on the developer's laptop. This is the default path. It is the "on-device, private inference" story the hackathon wants.
2. If a feature flag (`AI_PROVIDER=gemini`) is set, calls go to the Gemini API instead. This exists to protect the video recording in case Ollama is too slow on the day.
3. If Gemma genuinely cannot handle Shona well enough during Phase 0 verification, the system swaps Gemma to the audit narrative job only and uses Gemini for understanding. Both are Google models. The pitch becomes "Gemini for understanding, Gemma for explaining."

A single thin module wraps both providers behind an `aiClient.understand(input)` and `aiClient.narrate(stats)` interface. Switching providers is a one-line change.

## Authentication

No real authentication for the hackathon. Personas are selected via a query parameter (`/?as=takunda`, `/hwindi?as=farai`, `/fleet?as=baba_tino`). Demo accounts are pre-seeded. From Phase 3.8 the user-facing UI only offers Takunda — the other URLs work as direct deep-links during recording but are never surfaced as switches. This saves a full phase of work and is appropriate for the demo.

In the roadmap, real authentication moves to Supabase magic-link or one-time SMS code via the carrier-menu system.

## Mocked WhatsApp companion

A page styled like WhatsApp. Three commands are recognised:
- `balance` — returns the current ticket-credit balance
- `kombi near me` (with a fake "shared location") — returns the nearest kombi on the user's planned route
- `transfer 482 to +263772XXXXXX` — transfers ticket access code 482 to the named phone number

Each command sends the user's input to the artificial-intelligence layer, which parses it into a structured command, which calls the corresponding server function. No Twilio, no Meta integration, no actual WhatsApp.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox public access token |
| `OLLAMA_BASE_URL` | Local Ollama URL, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Model tag, default `gemma:4-e2b` (use the actual Ollama tag) |
| `AI_PROVIDER` | `ollama` or `gemini`, default `ollama` |
| `GEMINI_API_KEY` | Google AI Studio key, used when `AI_PROVIDER=gemini` |

## Realtime data flow — one example

The kombi position update flow:

1. The simulation runner advances kombi `ZH 4821` by twenty metres along its polyline.
2. The runner writes the new latitude and longitude to the `vehicles` table.
3. Supabase Realtime broadcasts the row change to all subscribed clients.
4. The passenger app receives the new position and updates the Mapbox source for that kombi.
5. The conductor screen receives the same update and shows the kombi's progress on the small route map.
6. The fleet dashboard receives the update and increments the kombi's distance ledger for the day.

All three surfaces see the same kombi move at the same time.

## Hosting and deployment

- Vercel Hobby plan with the GitHub repository connected for automatic deployment on push.
- Supabase project hosted in the closest region (Frankfurt or London — whichever the free tier offers).
- Ollama runs on the developer's laptop during the demo.
- Gemini API access is used only as a fallback.

## What this architecture explicitly does not do

- No microservices, no service mesh, no Kubernetes
- No third-party authentication
- No payment gateway
- No production telemetry or observability
- No internationalisation framework — Shona and English strings are inline
- No automated tests for the hackathon scope
- No load balancing — single Vercel deployment, single Supabase project
- No multi-region replication
- No backup or disaster recovery for the seeded demo data — the seed file is the recovery
