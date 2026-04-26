# Execution Plan — Svika

## Hard deadline

Hackathon submission closes **2026-04-30 at 23:59 Central African Time**.

The plan below is organised in **phases with gates**, not days. Move through phases as fast as you can clear each gate. The gate is the only thing that matters — once it is passed, the next phase opens.

## Phase 0 — Foundations and the Gemma verification spike

**Gate to pass:** Gemma 4 E2B can either understand Shona well enough or be replaced cleanly by Gemini. The repository runs locally. Mapbox and Supabase are wired. Brand assets are committed.

### Tasks

- [ ] Pull Gemma 4 E2B into Ollama. Run ten Shona kombi-booking sentences and ten mixed Shona-English sentences through it with a JSON-output prompt. Score: latency under three seconds, structured output valid, intent correct in eight of ten cases at minimum.
- [ ] If Gemma fails, plan B: keep Gemma for the audit narrative job, swap to Gemini for understanding. Confirm the Gemini API free tier works.
- [ ] Create the GitHub repository. Push the existing source documents and `seed/network.json` already drafted.
- [ ] Initialise a Next.js project with the App Router, TypeScript, Tailwind, and the brand tokens from CLAUDE.md.
- [ ] Set up Supabase (free plan), create the project, enable PostGIS, copy the URL and keys into `.env.local`.
- [ ] Create the Mapbox account, add the credit card, set the spending cap to zero, copy the public token into `.env.local`.
- [ ] Commit a wordmark and brand-token CSS file using the Mosi-oa-Tunya palette.
- [ ] Wire up the Vercel project for automatic deployment from GitHub.
- [ ] Add an `aiClient.ts` module with two functions — `understand(input)` and `narrate(stats)` — and the provider switch behind `AI_PROVIDER`.

### What "passed" looks like

- A `dev` server runs locally and shows a placeholder page with the brand colours.
- The Vercel deployment URL works.
- Calling `aiClient.understand("Ndirikuda kuenda Avondale")` returns a sensible JSON object.

## Phase 1 — The network on the map

**Gate to pass:** opening the passenger surface shows the four kombi routes drawn on the map, the named stops as labelled markers, and at least two simulated kombis sliding along their routes in real time.

### Tasks

- [ ] Write the database migrations from `docs/DATA-MODEL.md`: users, routes, stop_points, route_stops, fare_segments, transfer_points, vehicles, tickets, trips, trip_tickets, transfers, kombi_pings, audit_narratives.
- [ ] Build the seed loader. Read `seed/network.json`, insert routes, stop points, route stops, fare segments, transfer points. Pre-load Tendai, Rudo, Farai, Baba Tino. Pre-load two vehicles per route.
- [ ] Optionally densify the polylines through Mapbox's directions service so they snap perfectly to roads. Keep the original raw polylines as a fallback.
- [ ] Build the Mapbox shell on the passenger surface. Render route lines, stop markers, and kombi markers.
- [ ] Build the simulation runner — a script or route handler that advances each vehicle along its polyline every two seconds and writes the new position to the database. Use a Supabase Realtime channel to broadcast updates.
- [ ] Subscribe the passenger map to the channel. Update kombi markers using imperative Mapbox source updates, not React state.

### What "passed" looks like

- Open `/?as=tendai`, see the four routes drawn cleanly.
- Click any route, see its named stops.
- Watch two kombis move smoothly along their routes.

## Phase 2 — Passenger experience

**Gate to pass:** Tendai can plan a Heights-to-Avondale trip, see two options, choose one, buy two tickets, view them in her wallet, and transfer one to Rudo via a share sheet. Rudo can claim the transferred ticket.

### Tasks

- [ ] Build the trip planner module. For the hackathon, it reads pre-computed plans from `seed/network.json`'s `trip_plans` array. Returns the array of options for the requested origin-destination pair.
- [ ] Build the search bar. Accept text input. Send to `aiClient.understand`. Use the result to find the matching trip plan.
- [ ] Build the trip-plan card list. Show each option with timing, fare, walking time, and a small map preview.
- [ ] Build the booking flow. On "Buy trip," create a `trips` row, create one or two `tickets` rows, deduct credit, return the access codes.
- [ ] Build the ticket wallet. List active tickets. Tap one to see details and the share button.
- [ ] Build the transfer flow. Share via the system share sheet with a deep link `/?as=<recipient>&claim=<ticket_id>`. The recipient's app claims the ticket on load.
- [ ] Update ticket states correctly: `issued` → `transferred_pending` → `held` for Rudo. The original holder sees "Transferred to Rudo."

### What "passed" looks like

- A search for "Avondale from Heights" returns two options.
- Buying option A creates two access codes in Tendai's wallet.
- Sharing one to Rudo via WhatsApp works end-to-end on a real phone or simulator.
- Rudo's wallet shows the ticket as held.

## Phase 3 — Conductor and fleet surfaces

**Gate to pass:** Farai can clear a fare with a PIN entry on `/hwindi`. He can log a cash walk-on. The fleet dashboard shows the result. Baba Tino sees the bilingual Gemma audit narrative and the ZIMRA liability card.

### Tasks

- [ ] Build the conductor screen at `/hwindi?as=farai`. Big buttons: **Code**, **Cash**, **Parcel**. A small map at the top showing the kombi's route and current position.
- [ ] Implement the PIN-entry flow. Enter three digits, server checks, if valid: increment the kombi's passenger count, mark the ticket as `redeemed`, log the fare. Visual confirmation in sunset rust accent.
- [ ] Implement the cash walk-on flow. A "+1 cash $1" tap creates a `cash_walkin` ticket with no `originating_user_id` and immediately marks it `completed`.
- [ ] Build the fleet dashboard at `/fleet?as=baba_tino`. List of vehicles, click one to drill in.
- [ ] Per-vehicle view: today's stop count (computed from `kombi_pings` where `is_at_stop`), today's digital fare count, today's cash walk-on count, total revenue.
- [ ] Wire the audit narrative. On dashboard load, call `aiClient.narrate({stops, digital, cash, gap})`. Generate English plus Shona. Display in the audit panel. Cache the result in `audit_narratives` so re-rendering does not regenerate.
- [ ] Build the ZIMRA liability card. Calculate as a fixed percentage of the day's revenue extrapolated to a month. Show the figure prominently.

### What "passed" looks like

- A code typed on Farai's screen clears the corresponding ticket. Counter increments. Position updates.
- The fleet dashboard shows live revenue. The audit narrative reads naturally in both languages. The ZIMRA card displays a number.

## Phase 4 — Companion surfaces and stretch

**Gate to pass:** the WhatsApp companion at `/wa` accepts three commands. At least one Tier 2 stretch feature works (parcel happy path, carrier-menu mock, emergency-contact card). Gemini API fallback is tested and switches behind a flag.

### Tasks

- [ ] Build the `/wa` page styled like WhatsApp green bubbles. A simple chat input.
- [ ] Wire the three commands: `balance`, `kombi near me` (with a hardcoded "current location" in the demo), `transfer 482 to <phone>`. Each goes through `aiClient.understand` to parse intent, then calls the corresponding server function.
- [ ] **Stretch 1 (recommended) — parcel happy path.** Add a "Send parcel" tab on the passenger surface. Same booking flow as a passenger ticket but with a parcel description and a receiver phone number. The conductor's `Parcel` button accepts and confirms the parcel with a single PIN. End-to-end happy path only — no failure modes.
- [ ] **Stretch 2 (optional) — carrier-menu mock.** A single Next.js route at `/ussd-mock` styled like a Nokia feature phone, showing the menu structure: 1. Balance, 2. Plan trip, 3. Transfer ticket. Static text only.
- [ ] **Stretch 3 (optional) — emergency-contact card.** A static card on the fleet dashboard showing emergency contacts for the active trip. Hardcoded fixture data.
- [ ] Test the Gemini fallback. Set `AI_PROVIDER=gemini`, verify both `understand` and `narrate` work identically.

### What "passed" looks like

- Typing `balance` in `/wa` returns Tendai's credit balance.
- Typing `kombi near me` returns the nearest kombi name and arrival estimate.
- The parcel send-and-accept flow works end-to-end with seed data.
- Switching `AI_PROVIDER` between `ollama` and `gemini` produces working narratives in both modes.

## Phase 5 — Demo production and submission

**Gate to pass:** the three-minute video is recorded, edited, and uploaded. The README is published with tier labels matching the script. The pitch deck is exported. The hackathon submission form is filled and submitted.

### Tasks

- [ ] Record each scene from `docs/DEMO-SCRIPT.md`. Multiple takes per scene. Save raw footage.
- [ ] Edit the video. Add brand title cards, voiceover, on-screen text. Keep the total at three minutes including the twenty-second roadmap tail.
- [ ] Render and upload the video to YouTube unlisted, or to whatever the submission form requires.
- [ ] Write the README. Sections: vision, what's built (Tier 1), what's demonstrated (Tier 2), roadmap (Tier 3), how to run, screenshots, video link.
- [ ] Build the eight-slide pitch deck following `docs/PITCH-DECK-OUTLINE.md`. Export to PDF.
- [ ] Final smoke test on a clean browser: clear cookies, open `/?as=tendai`, run through the full passenger flow. Then `/hwindi?as=farai`. Then `/fleet?as=baba_tino`. Then `/wa?as=tendai`. Every flow must work.
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
- Add one more stretch feature if time genuinely permits

Do not start new features in buffer. Buffer is for finishing what is half-done.

## Anti-patterns

- Do not start a new phase before the previous gate is genuinely passed. "Mostly working" is not passed.
- Do not skip the Phase 0 Gemma test. The whole local-artificial-intelligence story rides on its result.
- Do not implement anything from the cut list. If a stretch feature is taking too long, drop it.
- Do not change the seed data once Phase 1 is complete. The demo script depends on the planted discrepancy.
