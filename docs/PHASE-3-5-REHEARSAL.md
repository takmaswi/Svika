# Phase 3.5 Journey UX — production rehearsal

Drove the full six-stage Journey UX against `https://svika.vercel.app/?as=tendai`
after draining Tendai's wallet and topping up to $5.00. Every screenshot and
layer probe below was captured from the live production page; no mocks, no
local overrides. The orchestrator is `scripts/phase3-5-rehearsal.ts` —
re-runnable any time.

## Setup

| Step | Result |
|---|---|
| Drained Tendai's active tickets (`UPDATE tickets SET status='completed'`) | 2 tickets cleared |
| Topped up Tendai (`UPDATE users SET credit_balance_usd=5`) | $5.00 ✅ |
| Booked "Heights to Avondale" → fastest plan ($1.50) via Playwright | 2 tickets minted (one per leg) ✅ |
| Trip identified | Lomagundi walking-transfer plan, two kombi legs + one walking leg |

Vehicles assigned by the rehearsal:
- **ZH 4821** on `route_heights_rezende` (leg 1)
- **ZH 5101** on `route_westgate_copa_segment` (leg 2)

Stops geofenced (lat,lng from `seed/network.json`):
- `sp_heights_start_north` — Bannockburn Rd North Terminus
- `sp_second_lomagundi` — leg-1 alight, walking-transfer start
- `sp_lomagundi_kinggeorge_pickup` — walking-transfer end, leg-2 board
- `sp_avondale_shops` — destination

## Per-stage layer state

The `window.__svikaMap` audit hook lets the orchestrator read the live filter
and source-feature counts at each stage. The active-route highlight switches
**at stage 4** when the rider steps off leg 1, exactly as the spec required.

| Stage | Kind | Highlight filter | Walking polylines | Kombi positions |
|---|---|---|---|---|
| 1 | walk-to-board | `route_heights_rezende` | 2 | 3 |
| 2 | boarding (leg 1) → in-transit | `route_heights_rezende` | 2 | 3 |
| 3 | in-transit | `route_heights_rezende` | 2 | 3 |
| 4 | walking-transfer | **`route_westgate_copa_segment`** | 2 | 3 |
| 5 | boarding-leg-2 → in-transit | `route_westgate_copa_segment` | 2 | 3 |
| 6 | arrived | _(empty — base routes restored)_ | 2 | 3 |

`walkingFeatures: 2` on every stage proves `svika-walking-line` is rendering
the dashed transfer polyline (`transfer_lomagundi_walk` from `seed/network.json`,
two coordinate pairs forming one LineString segment with three vertices).

## Stage screenshots

Each PNG is committed at `scripts/rehearsal-stage-N.png`.

### Stage 1 — Walk to board (`scripts/rehearsal-stage-1.png`)
Sheet: **STAGE 1 OF 6 · LEG 1 · Bannockburn Rd North Terminus → Avondale Shops** ·
"Walk to board · Bannockburn Rd North Terminus" · code 814 · ETA 4 min ·
$1.00 this leg · $1.50 total. Map shows full network with leg-1 route
rust-highlighted; assigned-vehicle halo on ZH 4821 at the board stop.

### Stage 2 — Boarding (leg 1) (`scripts/rehearsal-stage-2.png`)
Boarding flash window is ~1.1s, expired by capture time; sheet shows
**STAGE 3 OF 6 · LEG 1 · "On board · heading to Second St at Lomagundi Rd
Intersection"**, ETA 20 min. The redeem broadcast triggered `router.refresh()`
and the sheet advanced past walk-to-board immediately.

### Stage 3 — In transit (leg 1) (`scripts/rehearsal-stage-3.png`)
Vehicle moved to mid-leg. Sheet still **STAGE 3 OF 6**, ETA dropped to 10 min.
Progress bar at ~50%. Highlighted route still `route_heights_rezende`.

### Stage 4 — Walking transfer (`scripts/rehearsal-stage-4.png`)
**Highlight filter switched to `route_westgate_copa_segment`** ✅
Sheet: **STAGE 4 OF 6 · LEG 2 · "Walking transfer · King George Rd just off
Lomagundi Rd · Catch Westgate to Copacabana (Avondale Segment) · code 565"**.
ETA chip switched to **ZH 5101**. The `svika-walking-line` source has 2
features; the dashed rust line connects `sp_second_lomagundi` to
`sp_lomagundi_kinggeorge_pickup`.

### Stage 5 — Boarding (leg 2) (`scripts/rehearsal-stage-5.png`)
Sheet: **STAGE 5 OF 6 · LEG 2 · "On board · heading to Avondale Shops
(King George Rd)" · code 565 · ETA 5 min · $0.50 this leg · $1.50 total**.
Highlight stays on `route_westgate_copa_segment`.

### Stage 6 — Arrived (`scripts/rehearsal-stage-6.png`)
Sheet collapsed to a single line as specified:

> **Trip complete · 31 min · $1.50 spent · receipt saved · [Plan another]**

Highlight filter cleared (`["literal", []]`); `svika-routes-base` opacity
returned to `0.55` so the full network reads as ambient again. Tapping
"Plan another" wipes journey state and reopens the search bar.

## Bugs caught and fixed during the rehearsal

The rehearsal exposed two regressions that the static smoke could not have
caught. Both shipped to prod before the rehearsal completed.

1. **Stage-derivation loop returned in-transit on leg 1 once leg 2 was also
   redeemed.** The redeemed-leg branch had no `continue` path, so stages 5
   and 6 stuck on "Stage 3 of 6". Fixed in `lib/passenger/journey-stage.ts`
   (commit `b956ade`): when a later leg is also redeemed and we are not
   currently flashing, the loop advances past this leg.
2. **Map blanked during stages 2 and 5.** Build effect's deps
   `[network, mapboxToken]` re-fired on every `router.refresh()` because
   `loadNetwork()` returns a fresh object reference each server pass. The
   cleanup tore down the in-flight map; the next build raced against
   another refresh and the WebGL canvas never composited a frame. Fixed in
   `components/PassengerMap.tsx` (commit `d9b2562`): network, token, stage,
   and journey are mirrored into refs and the build effect runs exactly
   once per component mount.

## How to re-run

```bash
npx tsx --env-file=.env.local scripts/phase3-5-rehearsal.ts
```

Re-runs are idempotent: the script drains Tendai's wallet first, tops her up
to $5, books a fresh trip, and writes screenshots back into `scripts/`. The
report at this path is overwritten each run with the same structure but fresh
sheet text + layer snapshots.
