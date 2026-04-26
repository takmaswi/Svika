# CLAUDE.md — Svika
# Inherits ~/.claude/CLAUDE.md (Karpathy + ECC + Meta-Skills) when running under Claude Code.
# For sessions without home-directory access (Cowork, web chats), the user attaches the global file at session start.
# This project file overrides specific global rules until 2026-04-30 23:59 CAT — see "Hackathon exceptions" below.

## What Svika is

Svika is a digital ticketing and trip-planning system for Harare's informal kombi network. Passengers buy transferable digital tickets in United States Dollars, plan trips that may include walking transfers between routes, and check kombi positions in real time. Conductors clear fares with a three-digit access code on a fat-finger conductor screen. Fleet owners see real revenue, dynamic-fare visibility, and a bilingual artificial-intelligence-generated audit narrative that flags shrinkage. The same kombi, with the same access-code mechanic, also moves small parcels.

Pitch in five words: **digital tickets, real revenue, same kombi.**

## Project status

Planning is complete. Build phase begins now. Submission is due **2026-04-30 at 23:59 Central African Time** for the GDG Harare "Build with AI" Hackathon 2026. The submission consists of a three-minute edited video, a public GitHub repository with an honest tier-labelled README, and an eight-slide pitch deck.

## Hard checkpoint dates

| Date | Status target |
|---|---|
| 2026-04-26 (today) | Phase 0 begins. Foundations + Gemma Shona spike. |
| 2026-04-27 EOD | Phase 0 gate passed. Phase 1 in flight. |
| 2026-04-28 EOD | Phases 1, 2, 3 gates passed. Phase 4 starts. |
| 2026-04-29 midday | Phase 4 gate passed. Recording begins. |
| 2026-04-29 evening | Raw footage in the can. |
| 2026-04-30 morning | Video edited. README finalised. Deck exported. |
| 2026-04-30 23:59 CAT | Submitted. |

If a phase is at risk, drop stretch features in this order: Phase 4 stretch 3 then 2 then 1. Do not push the recording date.

## Hackathon exceptions to global rules

These exceptions apply only until 2026-04-30 23:59 CAT and revert post-submission.

| Global rule | Exception |
|---|---|
| **B2** — full ECC sequence on every feature | TDD downgraded to a single Playwright smoke test per surface, run only at the Phase 5 gate. `/security-scan` still runs on anything touching tickets, transfers, or fares. |
| **E3** — never commit to `main` directly | Direct commits to `main` permitted with conventional-commit messages (`feat:`, `fix:`, `chore:`, `docs:`). Branch + PR resumes post-submission. |
| **C1** — Prompt Upgrade with "OK or edit" confirmation | Skip the confirmation. The user has approved upfront for the sprint. |

All other global rules apply as written. **C3 Fact Checker is non-negotiable** for every README claim and every pitch-deck line — verify before writing. Never re-introduce stale facts (model availability, free-tier limits, library versions, deprecation dates) without web-search confirmation.

## Auto Mode operating envelope

The user runs Claude Code in **Auto Mode** (or `acceptEdits` + hooks fallback) for this sprint. Operate accordingly.

**Proceeds without confirmation:**
- Read, Edit, Write, Glob, Grep on any file inside the repo.
- Bash commands matching the allowlist in `.claude/settings.local.json` — pnpm, supabase, git (non-destructive), ollama, vercel, npx, node, ls/cat/mkdir/touch/echo.
- All MCP tool calls listed under "Active MCPs" below.

**Never run without explicit user approval:**
- `rm -rf`, `git push --force`, `git push -f`, `git reset --hard <ref>`, `git clean -fd`, `sudo *`, `chmod *`.
- Writes to `~/.ssh/**`.
- Writes to any `.env*` file other than `.env.local` and `.env.example`.
- Pushing to any remote other than `origin`.
- Amending or force-pushing already-pushed commits.

**Discipline:**
- Commit at every phase gate with a conventional-commit message. Surface the diff before committing only if it crosses ten files or three hundred lines.
- After every Edit or Write to a `.ts` / `.tsx` file, run `pnpm typecheck` and surface failures inline. Self-correct without prompting.
- Append one line to `docs/BUILD-LOG.md` after each completed task: `<phase> | <task> | <commit-hash> | <verified>`.
- If something is genuinely ambiguous (real architecture choice, irreversible decision), stop and ask. Per global A1 — surface confusion, do not silently choose.

## How to help during the build phase

- The user is the source of truth for Harare-specific geography, naming, and informal-network practices. Never invent street names, ranks, kombi behaviour, or transfer corners.
- Default to plain English. Do not introduce technical abbreviations.
- Treat each task as targeted: do not refactor or expand scope without confirmation.
- Run the Phase 0 Gemma Shona spike before committing the local-AI narrative to the demo script.
- For any feature listed under "Cut from code" below, do not implement. It is roadmap-only.
- Plan execution in **phases with gates**, not in days.

## Locked decisions

| Area | Decision |
|---|---|
| Hero user | Passenger (Tendai). Workers: conductor (Farai), fleet owner (Baba Tino). Companion surface: WhatsApp utility. |
| Currency | United States Dollars only. No ZiG. |
| Tickets | Tickets transfer between users. Account balances do not. Avoids fintech licensing. |
| ZUPCO framing | "Designed to integrate with ZUPCO." Never claim a partnership. |
| Authentication | No real login. Persona switch via `?as=tendai` query parameter. Pre-seeded demo accounts. |
| Codebase | One Next.js project. Route groups: `/` passenger, `/hwindi` conductor, `/fleet` owner, `/wa` mocked WhatsApp companion. |
| RLS | Demo-only service-role bypass during the sprint. Real persona-scoped RLS is roadmap. Spell out in code comments. |
| Database | Supabase free tier with PostGIS. Daily heartbeat ping to prevent the 7-day pause. |
| Maps | Mapbox GL JavaScript v3, free tier with credit card on file and zero-dollar spending cap. |
| Local AI | `gemma4:e2b-it-q4_K_M` via Ollama for natural-language understanding and the bilingual audit narrative. |
| Cloud AI fallback | **Gemini 2.5 Flash** (10 RPM, 250/day free) — not 2.5 Pro (5 RPM, 100/day, too tight for retakes). Switch via `AI_PROVIDER=gemini`. |
| WhatsApp | Mocked chat page at `/wa`. Three commands: balance, kombi near me, transfer. No Twilio, no Meta. |
| Hosting | Vercel free Hobby plan. Domain: `svika.vercel.app`. Hobby is non-commercial — move to Pro before any real-user pilot. |
| Brand | Mosi-oa-Tunya. Primary `#0A4B5C` deep teal. Accent `#D9622A` sunset rust. Background `#F2EDE6` pale stone. Geist as the typeface. |
| Demo | Three-minute edited video. Last twenty seconds is a roadmap tail. |
| Honesty tiers | Tier 1 real and working with seed data. Tier 2 clickable screen with fixed-response backend. Tier 3 pitch slides only, never in code. README labels every feature. |
| Network data | Four routes, three transfer points, three trip plans. Verified against Google Maps and Waze. Stored in `seed/network.json`. **Frozen after Phase 1.** |

## Stack pinned versions

| Layer | Version / tag | Notes |
|---|---|---|
| Next.js | **16** (App Router) | React Compiler stable. `cacheLife` and `cacheTag` no `unstable_` prefix. Server Components default. |
| TypeScript | 5.x | Strict mode on. |
| React | 19.2 (via Next 16) | Mark client components with `'use client'` only when needed. |
| Tailwind CSS | **v4.1** | CSS-first config via `@theme` block in `app/globals.css`. **No `tailwind.config.js`.** |
| Supabase JS | v2 with `@supabase/ssr` | App Router cookie handling. |
| Database | Postgres 15+ via Supabase, PostGIS enabled | Daily keep-alive ping (GitHub Action) to prevent the 7-day pause. |
| Migrations | Supabase CLI | `supabase/migrations/*.sql`. Apply with `supabase db push`. |
| Mapbox GL JS | v3 | 50k loads/mo free, $0 spending cap on file. |
| Local AI | Ollama | `OLLAMA_MODEL=gemma4:e2b-it-q4_K_M` (7.2 GB, 140+ languages, on-device). |
| Cloud AI fallback | Google Generative AI SDK | `GEMINI_MODEL=gemini-2.5-flash` (default). Switch via `AI_PROVIDER=gemini`. |
| Hosting | Vercel Hobby | Non-commercial only. |
| Package manager | pnpm | Lockfile committed. |

## Code layout

```
app/
  (passenger)/           # served at /
  hwindi/                # conductor surface
  fleet/                 # fleet dashboard
  wa/                    # WhatsApp companion (mocked)
  globals.css            # Tailwind v4 @theme tokens, brand palette
  layout.tsx             # root layout, brand fonts, brand background
components/              # shared UI; one file per component
lib/
  supabase/{client,server}.ts
  ai/{aiClient,prompts}.ts
  sim/simRunner.ts
  trip-planner/index.ts
seed/
  network.json           # verified network — DO NOT modify after Phase 1
  loader.ts              # idempotent seed loader
supabase/
  migrations/*.sql       # Supabase CLI migrations
docs/                    # source of truth — do not duplicate content here
public/brand/            # wordmark SVG, OG image
.env.local               # local secrets, never committed
```

## Validation commands

The agent MUST run these before declaring any task done:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

After Phase 1, also:

```bash
pnpm test:e2e:smoke
```

A failure on any command means the task is not done. Fix and re-run before commit.

### Phase-gate prod-verification discipline

**Local green is not "verified".** Every phase-gate verification claim must be backed by a literal `https://svika.vercel.app` response. The Phase 1 and Phase 2 reviews both caught the agent claiming a gate had passed when the local commit had not yet been pushed and Vercel was still serving the previous build.

Required steps at every phase gate, in order:

1. `git status` and `git log --oneline -5` to confirm the gate commit exists locally.
2. `git push origin main` and surface the `..NEW_SHA` line in the response.
3. Poll prod until the new build is live, e.g.:

   ```bash
   until curl -s https://svika.vercel.app/?as=tendai | grep -q "<phase-marker>"; do sleep 8; done
   ```

   `<phase-marker>` is a string that exists only after the new commit ships (Phase 1: a route name from `seed/network.json`; Phase 2: `trip-search`; Phase 3: `hwindi-pin-keypad` or the equivalent — name the marker in the gate task itself).

4. Record the actual `curl https://svika.vercel.app/...` response and the markers found in the BUILD-LOG entry. **Never reference `localhost` as evidence of a gate passing.**

5. For phases that change the database (tickets, ledgers, audit narratives), drive the user-visible smoke flow on the live URL — `scripts/phase2-prod-smoke.ts` is the template. Cowork must be able to query the corresponding tables and see the rows your smoke produced.

If the prod URL still serves the previous phase, the gate has not been passed — even if local typecheck, lint, build, and dev-server tests are all green. Push, wait, re-curl, and only then update BUILD-LOG.

## Active MCPs (this project only)

Enable only the following. Disable everything else to stay under global B1 budget (≤10 MCPs, ≤80 total tools). Project-scoped config is in `.mcp.json` at repo root.

| MCP | Purpose | Auth |
|---|---|---|
| **Supabase** | Schema, migrations, queries, real-time inspection. Connect to a **dev project**, not prod. | OAuth via `https://mcp.supabase.com/mcp` |
| **GitHub** | Public repo, README, releases | `GITHUB_PERSONAL_ACCESS_TOKEN` env var |
| **Vercel** | Deploy status, env vars, build logs | OAuth via `https://mcp.vercel.com` |
| **Context7** | Always-current docs: Next.js 16, Supabase JS v2, Mapbox GL JS v3, Tailwind v4 | Public HTTP |
| **Playwright** | E2E smoke tests on all four surfaces | None |
| **Firecrawl** | Doc scraping when Context7 misses something | `FIRECRAWL_API_KEY` env var |
| **WebSearch / WebFetch** | C3 Fact Checker | Built in |

**Disabled for this project:** Claude in Chrome, Gmail, Drive, Slack-equivalents, scheduled-tasks, MCP registry / plugin search, session_info, cowork-onboarding, skill-creator. If you need to add an MCP mid-sprint, document the reason in `docs/BUILD-LOG.md`.

## Skills to invoke (from global C6)

`verification-before-completion` at every phase gate · `systematic-debugging` when stuck · `pptx` for the pitch deck · `pdf` for export · `frontend-design` for the conductor + fleet layouts · `copywriting` + Humanizer (C2) for the README and deck · `mcp-builder` only if a missing MCP genuinely blocks progress.

## Surfaces

| Path | User | Purpose |
|---|---|---|
| `/` | Passenger (Tendai) | Live kombi map, trip planner, ticket purchase, ticket wallet, ticket transfer |
| `/hwindi` | Conductor (Farai) | Fat-finger conductor screen: PIN entry, +1 cash, parcel accept, route view |
| `/fleet` | Fleet owner (Baba Tino) | Revenue ledger, Ghost Trip audit narrative, ZIMRA liability card |
| `/wa` | WhatsApp companion | Mocked WhatsApp chat with three commands powered by Gemma |

## Cut from code

These are pitch slides only. Do not implement.

- Carrier menu system (*123#)
- Real EcoCash and Paynow money movement
- Real WhatsApp Business API integration
- Two-code parcel handover (single PIN is the demo flow)
- Full speeding-detection engine (one fake banner if Tier 2 budget allows)
- Emergency medical manifest as a working webhook (one static card if Tier 2 budget allows)
- Multi-stop route planner with dwell-time penalties
- Separate dashboard for city planners
- Subscription tiers, advertising, real revenue authority ledger
- Real ZUPCO integration

## Documentation map

- [`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md) — what we are building, who for, why, success criteria, full pain-point list
- [`docs/SYSTEM-ARCHITECTURE.md`](docs/SYSTEM-ARCHITECTURE.md) — moving parts and how they talk
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — database tables, relationships, fare-by-segment design
- [`docs/NETWORK-DATA.md`](docs/NETWORK-DATA.md) — the four routes, three transfers, three trip plans
- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — the three-minute video, scene by scene
- [`docs/EXECUTION-PLAN.md`](docs/EXECUTION-PLAN.md) — phases with gates, not days
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — every cut feature reframed as future work
- [`docs/PITCH-DECK-OUTLINE.md`](docs/PITCH-DECK-OUTLINE.md) — eight slides with key messages
- [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) — append-only progress log (one line per task)
- [`docs/diagrams/system-architecture.mmd`](docs/diagrams/system-architecture.mmd) — Mermaid system diagram
- [`docs/diagrams/ticket-lifecycle.mmd`](docs/diagrams/ticket-lifecycle.mmd) — Mermaid ticket state diagram
- [`seed/network.json`](seed/network.json) — verified seed data for the kombi network

## Open items still to resolve in code

- Whether `gemma4:e2b-it-q4_K_M` handles Shona well enough for the demo. **Phase 0 verification:** ten Shona kombi-booking sentences plus three code-switched Shona-English sentences, scored on intent accuracy, latency under 3 s, and JSON validity.
- Whether to densify the polylines further via Mapbox Directions. Phase 1 polish, optional.
- Final wording of the bilingual audit narrative prompt for Gemma. Phase 3.
