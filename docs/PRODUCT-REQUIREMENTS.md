# Product Requirements — Svika

## One-sentence vision

Svika digitises the kombi: shareable digital tickets, real-revenue dashboards, same-kombi parcel delivery — built for Harare's informal network, not for Silicon Valley.

## Why this exists

Harare moves on kombis. Millions of people, billions of dollars annually. Yet the entire network is invisible: cash-only fares, no receipts, no audit trail, no shared source of truth on prices, no way for a visitor or a student new to the city to figure out which kombi to take. Conductors and passengers fight over fifty-cent change every day. Fleet owners cannot see how much revenue actually reaches them. The Zimbabwe Revenue Authority cannot see the informal economy at all. And as fuel prices fluctuate, fares change with no shared digital signal — leaving room for accusations of exploitation that are often just operators passing on costs.

Svika is the digital layer over this network. Not a replacement, not a competitor, not an Uber-style disruption. A coordinated set of small surfaces that make the existing system more honest, more legible, and more accessible.

## Who it serves

### Takunda — the passenger (the only persona on camera)

A working professional in Mt Pleasant Heights. Travels by kombi several times a week to the city, to Avondale, to the University of Zimbabwe. Has a smartphone and intermittent data. Knows his own routes from habit, but cannot always plan a trip to a part of the city he does not know. Since Phase 3.8, the brand landing page offers a single full-width "Continue as Takunda" button. There is no in-product persona switcher. The other characters (conductor, fleet owner, transfer recipient) appear as propagated effects on Takunda's screen, never as destinations he switches into.

What he needs:
- See where kombis are now
- Plan a trip from where he is to where he wants to go
- Know the current fare without arguing with a conductor
- Pay digitally from his wallet, or reserve a seat and pay cash on board
- Send a ticket to a family member when plans change
- A receipt of every ride
- See the conductor's clearance and the fleet's revenue land *on his own screen* without changing surfaces

### Rudo — the transfer recipient (a character in Takunda's flow, not a persona destination)

Takunda's cousin. A student. Takunda sometimes pays Rudo's fare. When plans change, Rudo needs to receive a ticket Takunda already paid for and use it. Reachable via a shared claim link only — `/?as=rudo&claim=<id>` works as a deep link during recording but the user-facing UI never offers a "switch to Rudo" affordance.

What she needs:
- Receive a ticket via WhatsApp or in-app share
- Board a kombi and clear the fare with the access code

### Farai — the kombi conductor (hwindi) (a character, not a persona destination)

Works on the Heights to Rezende kombi `ZH 4821`. Fifteen-seat Toyota Hiace. Long shifts. Phone is older, screen is small, hands are busy. Does not have time to navigate complex screens. He appears in Takunda's narrative as the named driver on the journey card and as the source of the "Fare cleared" toast. The hwindi screen at `/hwindi?as=farai` exists as a deep-link surface that the cutaway insert pulls from during the demo.

What he needs:
- One screen, big buttons, big numbers
- Tap a code from a passenger, fare clears
- Tap a cash button when someone pays cash
- Distinct visual treatment so he knows whether the cleared fare came from wallet credit or is still owed in cash on board
- See the kombi's current position on a small map
- Function offline and sync when reconnected

### Baba Tino — the fleet owner (a character, not a persona destination)

Owns four kombis. Has been running the fleet for twenty years. Loses money to conductor shrinkage every month and cannot prove it. Pays his ZIMRA tax based on guesswork. Never sure if the fares his conductors report match reality. His ledger surfaces inside Takunda's arrived sheet as a "Your $1.50 just landed in Baba Tino's ledger ›" disclosure row. The full dashboard at `/fleet?as=baba_tino` exists as a deep-link surface.

What he needs:
- A dashboard that shows real fares per kombi per day
- A clear record of cash boardings versus digital boardings
- A bilingual narrative explaining where revenue gaps exist
- An estimate of his monthly tax liability

### The roadmap user — the carrier-menu user

Someone with a feature phone, no smartphone, no data. Today excluded from any digital solution. A static carrier-menu mock at `/ussd-mock` previews the future surface; the real implementation requires a mobile network operator and a USSD aggregator and stays roadmap.

## Pain points the system must solve

1. **The change problem.** Fights over fifty-cent change slow trips and damage trust. Digital tickets remove cash from the boarding moment. Where cash is unavoidable, the system reserves the seat ahead of time and tells the conductor exactly how much to collect.

2. **Conductor shrinkage and fare opacity.** Cash fares disappear into pockets. Owners have no visibility. Every fare must be logged against a route, a kombi, and a stop, and split clearly between wallet and cash.

3. **Dynamic fare volatility.** Fares change with fuel prices. Without a shared digital signal, passengers and operators argue. Fares must be stored as live, updatable data and visible to all parties at the moment of purchase.

4. **Tribal-knowledge routing.** The most useful trip plans — especially walking transfers between routes — exist only in the heads of locals. Visitors and students cannot easily figure them out. The trip planner makes this knowledge accessible.

5. **Tax invisibility.** ZIMRA cannot see the informal economy. Digital tickets create an honest, auditable record without forcing operators into the formal economy overnight.

6. **Cash-only friction.** Passengers must carry exact small notes. Tickets cannot be shared, gifted, or transferred. Transferable digital tickets fix this.

7. **No proof of payment.** Disputes between conductors and passengers have no neutral arbiter. A digital ticket with verifiable status is the arbiter.

8. **Last-mile parcel delivery.** Kombis already carry small parcels informally. Formalising this with the same ticket model creates a real revenue stream and a real service.

9. **No visibility into kombi position.** Passengers wait at stops not knowing if a kombi is one minute away or twenty. Live position data on the route, with eased motion between updates so the dot does not jump.

## What success looks like for the hackathon

Three sources of judgement, weighted as published by the hackathon:

| Dimension | Weight | What we deliver |
|---|---|---|
| Innovation and creativity | 30% | Transferable digital tickets, walking-transfer trip planner exposing tribal knowledge, on-device Shona artificial intelligence (with cloud fallback), kombi-as-courier sidecar, Uber-style live journey card on a network the city has never seen on a map |
| Technical execution | 30% | Working trip planner with two viable Heights-to-Avondale plans, real ticket state machine with transfer support, simulated kombi movement with eased per-vehicle interpolation, bearing-rotated SVG kombi markers, conductor PIN flow with payment-method branching, Gemma-driven audit narrative on the dashboard |
| Google tools utilisation | 20% | Gemma 4 E2B running locally via Ollama for the audit narrative, Gemini 2.5 Flash as cloud fallback for understanding (and as the prod default after Phase 0 latency spike), Mapbox GL JavaScript v3 for map rendering |
| Presentation and completeness | 20% | Three-minute edited video, eight-slide pitch deck, honest tier-labelled README, public GitHub repository |

## What is in scope (Tier 1 — built and working through Phase 4.5)

- Brand landing page at `/` with the single "Continue as Takunda" CTA and direct deep-links for the conductor and fleet surfaces
- Trip planning across the four-route network with three viable trips (read from the seed)
- Ticket purchase with per-segment fare lookup, paid from wallet credit *or* reserved for cash on board
- Wallet top-up sheet (mocked, logs to a `top_ups` ledger so balances are real in the demo)
- Ticket transfer between two passenger accounts via a shared claim link
- Ticket redemption via three-digit access code
- Conductor screen with PIN entry, cash walk-on, and a payment-method-aware feedback flash
- Live kombi positions on the map, simulated, eased between samples with bearing-rotated SVG markers
- Six-stage live journey card (walk-to-board, boarding, in-transit, walking-transfer, boarding-leg-2, arrived) with Uber-style driver chip and live ETA-minute readout
- "Fare cleared by Farai" glass toast on the passenger surface, driven by a Realtime broadcast from the conductor screen
- "Your fare just landed in Baba Tino's ledger" disclosure card inside the arrived sheet, with today's revenue split
- Fleet dashboard with per-kombi revenue ledger
- Bilingual Ghost Trip audit narrative (warmed via local Gemma, served from cache in prod)
- ZIMRA liability estimate card on the dashboard
- WhatsApp companion at `/wa` with three live commands (`balance`, `kombi near me`, `transfer`) backed by a real PostGIS RPC for nearest-vehicle lookup
- Same-kombi parcel happy path — passenger-side `Parcel` sheet, conductor-side parcel-PIN mode on the same keypad
- AI diagnostics endpoint at `/api/ai-diag` for prod sanity checks of both AI jobs

## What is shown but stubbed (Tier 2 — clickable but backed by fixtures)

- Static carrier-menu mock at `/ussd-mock` (single Nokia-style page, no logic)
- Static emergency-contacts card on the fleet dashboard (hardcoded fixture)
- Wallet top-up flow (no real EcoCash, no Paynow — the `top_ups` table is the ledger)
- Audit narrative falls back to a deterministic English+Shona sentence when the cache is cold; the warmed cache is the demo path

## What is roadmap only (Tier 3 — slides not code)

See `docs/ROADMAP.md` for the full list with framing.

## Out-of-scope explicitly

- Real EcoCash, Paynow, or any live money movement (top-up screens are mocked)
- Real WhatsApp Business API integration (the `/wa` route is the WhatsApp surface)
- Real-time kombi telemetry from real vehicles (positions are simulated)
- Real ZUPCO integration (the design is "ready to integrate with")
- Account-to-account balance transfer (only tickets transfer)
- Multiple currencies (United States Dollars only)
- ZiG support
- A native mobile application — the passenger surface is a mobile-friendly web experience
- Persona switching as a user-facing affordance — Takunda is the only choice the UI offers

## Constraints

- The full system must run on free tiers of all services. Mapbox uses a credit card on file with a zero-dollar spending cap as the only exception.
- The demo runs against the deployed Vercel surface, with the simulation runner started on the developer's laptop to make the markers move.
- The video, pitch deck, and README must clearly distinguish what is built from what is demonstrated from what is roadmap.
- Geography, naming, and informal-network practice in the documents and the code must match Harare reality. The user is the source of truth.
