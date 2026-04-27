# Product Requirements — Svika

## One-sentence vision

Svika digitises the kombi: shareable digital tickets, real-revenue dashboards, same-kombi parcel delivery — built for Harare's informal network, not for Silicon Valley.

## Why this exists

Harare moves on kombis. Millions of people, billions of dollars annually. Yet the entire network is invisible: cash-only fares, no receipts, no audit trail, no shared source of truth on prices, no way for a visitor or a student new to the city to figure out which kombi to take. Conductors and passengers fight over fifty-cent change every day. Fleet owners cannot see how much revenue actually reaches them. The Zimbabwe Revenue Authority cannot see the informal economy at all. And as fuel prices fluctuate, fares change with no shared digital signal — leaving room for accusations of exploitation that are often just operators passing on costs.

Svika is the digital layer over this network. Not a replacement, not a competitor, not an Uber-style disruption. A coordinated set of small surfaces that make the existing system more honest, more legible, and more accessible.

## Who it serves

### Takunda — the passenger (the only persona on camera)

A working professional in Mt Pleasant Heights. Travels by kombi several times a week to the city, to Avondale, to the University of Zimbabwe. Has a smartphone and intermittent data. Knows his own routes from habit, but cannot always plan a trip to a part of the city he does not know. From Phase 3.8 onwards he is the only persona the user-facing UI offers — every other character (conductor, fleet owner, transfer recipient) appears as a propagated effect on his screen, not as a destination he switches into.

What he needs:
- See where kombis are now
- Plan a trip from where he is to where he wants to go
- Know the current fare without arguing with a conductor
- Pay digitally without exact change
- Send a ticket to a family member when plans change
- A receipt of every ride
- See the conductor's clearance and the fleet's revenue land *on his own screen* without changing surfaces

### Rudo — the transfer recipient

Takunda's cousin. A student. Takunda sometimes pays Rudo's fare. When plans change, Rudo needs to receive a ticket Takunda already paid for and use it. Reachable via a shared claim link only — not a persona the user picks during the demo.

What she needs:
- Receive a ticket via WhatsApp or in-app share
- Board a kombi and clear the fare with the access code

### Farai — the kombi conductor (hwindi)

Works on a Heights to Rezende kombi. Fifteen-seat Toyota Hiace. Long shifts. Phone is older, screen is small, hands are busy. Does not have time to navigate complex screens.

What he needs:
- One screen, big buttons, big numbers
- Tap a code from a passenger, fare clears
- Tap a cash button when someone pays cash
- See the kombi's current position on a small map
- Function offline and sync when reconnected

### Baba Tino — the fleet owner

Owns four kombis. Has been running the fleet for twenty years. Loses money to conductor shrinkage every month and cannot prove it. Pays his ZIMRA tax based on guesswork. Never sure if the fares his conductors report match reality.

What he needs:
- A dashboard that shows real fares per kombi per day
- A clear record of cash boardings versus digital boardings
- A bilingual narrative explaining where revenue gaps exist
- An estimate of his monthly tax liability

### The roadmap user — the carrier-menu user

Someone with a feature phone, no smartphone, no data. Today excluded from any digital solution. Phase-2 work will let them check balance, plan a trip, and transfer tickets via the *123# carrier menu.

## Pain points the system must solve

1. **The change problem.** Fights over fifty-cent change slow trips and damage trust. Digital tickets remove cash from the boarding moment.

2. **Conductor shrinkage and fare opacity.** Cash fares disappear into pockets. Owners have no visibility. Every fare must be logged against a route, a kombi, and a stop.

3. **Dynamic fare volatility.** Fares change with fuel prices. Without a shared digital signal, passengers and operators argue. Fares must be stored as live, updatable data and visible to all parties at the moment of purchase.

4. **Tribal-knowledge routing.** The most useful trip plans — especially walking transfers between routes — exist only in the heads of locals. Visitors and students cannot easily figure them out. The trip planner makes this knowledge accessible.

5. **Tax invisibility.** ZIMRA cannot see the informal economy. Digital tickets create an honest, auditable record without forcing operators into the formal economy overnight.

6. **Cash-only friction.** Passengers must carry exact small notes. Tickets cannot be shared, gifted, or transferred. Transferable digital tickets fix this.

7. **No proof of payment.** Disputes between conductors and passengers have no neutral arbiter. A digital ticket with verifiable status is the arbiter.

8. **Last-mile parcel delivery.** Kombis already carry small parcels informally. Formalising this with the same ticket model creates a real revenue stream and a real service.

9. **No visibility into kombi position.** Passengers wait at stops not knowing if a kombi is one minute away or twenty. Live position data on the route.

## What success looks like for the hackathon

Three sources of judgement, weighted as published by the hackathon:

| Dimension | Weight | What we deliver |
|---|---|---|
| Innovation and creativity | 30% | Transferable digital tickets, walking-transfer trip planner exposing tribal knowledge, on-device Shona artificial intelligence, kombi-as-courier sidecar |
| Technical execution | 30% | Working trip planner with two viable Heights-to-Avondale plans, real ticket state machine with transfer support, simulated kombi movement, Gemma-driven audit narrative on the dashboard |
| Google tools utilisation | 20% | Gemma 4 E2B running locally via Ollama, Gemini as cloud fallback, Google Maps surfaces, Mapbox map rendering |
| Presentation and completeness | 20% | Three-minute edited video, eight-slide pitch deck, honest tier-labelled README, public GitHub repository |

## What is in scope (Tier 1, must work in code)

- Trip planning across the four-route network with three viable trips
- Ticket purchase with per-segment fare lookup
- Ticket transfer between two passenger accounts
- Ticket redemption via three-digit access code
- Conductor screen with PIN entry and cash walk-on
- Live kombi positions on the map (simulated)
- Fleet dashboard with per-kombi revenue ledger
- Bilingual Ghost Trip audit narrative generated by Gemma
- ZIMRA liability estimate card on the dashboard
- WhatsApp companion with three mocked commands
- Persona switching via URL parameter

## What is shown but stubbed (Tier 2, clickable but backed by fixtures)

- Parcel happy path — single send and accept flow, single PIN, no two-code handover
- Optional: a static emergency-contacts card on the dashboard
- Optional: a single static feature-phone menu mock to preview the carrier-menu roadmap

## What is roadmap only (Tier 3, slides not code)

See `docs/ROADMAP.md` for the full list with timing assumptions.

## Out-of-scope explicitly

- Real EcoCash, Paynow, or any live money movement (top-up screens are mocked)
- Real WhatsApp Business API integration (the `/wa` route is the WhatsApp surface)
- Real-time kombi telemetry from real vehicles (positions are simulated)
- Real ZUPCO integration (the design is "ready to integrate with")
- Account-to-account balance transfer (only tickets transfer)
- Multiple currencies (United States Dollars only)
- ZiG support
- A native mobile application — the passenger surface is a mobile-friendly web experience

## Constraints

- The full system must run on free tiers of all services. Mapbox uses a credit card on file with a zero-dollar spending cap as the only exception.
- The demo must run on the developer's laptop without live external integrations.
- The video, pitch deck, and README must clearly distinguish what is built from what is demonstrated from what is roadmap.
- Geography, naming, and informal-network practice in the documents and the code must match Harare reality. The user is the source of truth.
