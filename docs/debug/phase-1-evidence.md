# Phase 1 evidence — kombi marker teleport / ETA-jump / no-arrival

Captured 2026-04-29 22:23–22:38 CAT. Branch: main. Commit range under
investigation: `99cf6cf` (R5) … `784ec88` (R4.5).

This document only describes what was observed. No cause is proposed.

## Repro

1. `pnpm dev` (already running, port 3000, PID 6732 — was already live at the
   start of the session).
2. `pnpm exec tsx --env-file=.env.local scripts/sim-runner.ts` in a second
   terminal.
3. Open `http://localhost:3000/?as=takunda` in Playwright Chromium.
4. Observe the kombi marker for ≥30 s; sample the GeoJSON source every 2 s.

## Symptom — observation #1, BEFORE killing orphan processes

Initial probe at 22:23:25, with whatever sim runners had been left over from
prior dev sessions. Stage was `walking-transfer`, then flipped to
`in-transit` ~75 s later.

Per-2 s sample of `svika-kombis` source `_data` for ZH 4822 (lng):

```
i= 3  31.04362
i= 4  31.04469   ← +0.00107 (~115 m east, single 2 s window)
i= 5  31.04438
i= 6  31.04392
i= 7  31.04413
…
i=12  31.04482
i=13  31.04590   ← +0.00108 (~108 m east)
i=14  31.04485   ← back ~115 m west
i=15  31.04517
```

ZH 4821 oscillates similarly across ~500 m of lat in the same window.

Visible behaviour: marker jitters east-west by ~100 m every couple of
seconds; it does not advance smoothly along the road.

ETA on this trip stayed at "ETA 12 min" once the journey settled into
`in-transit`. The 3 → 8 → 13 → 3 ETA pattern from the brief was *not*
reproduced in this window — the journey was already mid-leg-1 when the
session opened.

`probe-1-30s-walking-transfer.json` is the raw evidence.

## Diagnosis tape — instrumented broadcast handler, BEFORE killing orphans

After adding `console.log` instrumentation to:

- `lib/sim/simRunner.ts` per-tick (Heights pair only)
- `components/PassengerMap.tsx` broadcast handler (every interpRef write,
  Heights pair only)
- `components/PassengerMap.tsx` RAF loop (every 30th frame for the Heights pair)
- `lib/passenger/journey-stage.ts` `pickAssignedVehicle` (every call)

… and reloading the page, the broadcast handler logged this within ~2.2 s:

```
[ 4707ms] map-bcast ZH 4822 prev_pm=4832.0 -> next_pm=4832.0   (cold start, prev=next)
[ 4920ms] map-bcast ZH 4822 prev_pm=4832.0 -> next_pm=0.0      ← reset to 0
[ 5621ms] map-bcast ZH 4822 prev_pm=0.0    -> next_pm=2436.2
[ 6385ms] map-bcast ZH 4822 prev_pm=2436.2 -> next_pm=5518.5
[ 6386ms] map-bcast ZH 4822 prev_pm=5518.5 -> next_pm=0.0      ← 1 ms after the previous, second source
[ 6570ms] map-bcast ZH 4822 prev_pm=0.0    -> next_pm=0.0
[ 6733ms] map-bcast ZH 4822 prev_pm=0.0    -> next_pm=4845.5
[ 6953ms] map-bcast ZH 4822 prev_pm=4845.5 -> next_pm=0.0
```

Eight Realtime broadcasts in 2.25 s. Sim is supposed to tick every 2000 ms.
`progressMeters` is supposed to grow monotonically by ~13 m/tick (sim
stdout from the same window confirmed +13.4 m/tick steady on a 15 344 m
polyline). The client received `progressMeters` = {4832, 0, 2436, 5518, 0,
0, 4845, 0} within 2 s — values consistent with multiple sim instances,
each at a different position along the polyline, each with its own
`loadVehicles` cold-start position.

`phase-1-clean-bcast.log` extract earlier in the session captured the same
pattern (prior to the cleanup).

## Process inventory — confounding factor

`wmic process where "name='node.exe'"` enumeration found **10 distinct
`tsx scripts/sim-runner.ts` processes** running concurrently on this
machine. PIDs: 42856, 35376, 2012, 3096, 34668, 20888, 32100, 37640,
45740, 7244 (process trees with pnpm/cmd/tsx wrappers each rooted in a
different shell).

Each process holds its own `VehicleRuntimeState[]` initialised by
`loadVehicles` at startup, and broadcasts every 2 s to the
`kombi-positions` Supabase Realtime channel.

The brief's "do not touch" boundary — the sim runner has no concurrency
guard, no PID lock-file, no shutdown hook to release a previous instance.

## Symptom — observation #2, AFTER killing all sim processes

`taskkill /F /T` against every PID, plus a sweep that found four more
that respawned via pnpm wrappers (4944, 29832, 9384, 34032) and killed
those too. Verified `0` sim-runner processes remaining.

Restarted exactly one sim. Re-loaded the page.

Per-frame RAF instrumentation (extracts):

```
ZH 4822 prev_pm=2409.3 -> next_pm=2422.8 prev_ll=[-17.762175,31.051916] next_ll=[-17.762296,31.051901]
ZH 4822 prev_pm=2422.8 -> next_pm=2436.2 prev_ll=[-17.762296,31.051901] next_ll=[-17.762416,31.051885]
ZH 4822 prev_pm=2436.2 -> next_pm=2449.7 prev_ll=[-17.762416,31.051885] next_ll=[-17.762536,31.051868]
ZH 4822 prev_pm=2449.7 -> next_pm=2463.1 …
ZH 4822 prev_pm=2463.1 -> next_pm=2476.6 …
…through 2517.0 (8 broadcasts)
```

Steady +13.4 m/tick. Broadcasts arrive every 2000 ± 30 ms. RAF loop logs
`polylineHit=true polylineLen=354` on every emitted frame. `lerped_pm`
grows monotonically inside the 1500 ms easing window.

Per-2 s GeoJSON sample: ZH 4822 lat advances steadily by ~120 µ° (~13 m)
per sample. No oscillation. `probe-2-30s-clean-single-sim.json` raw.

## Symptom — observation #3, prod URL `https://svika.vercel.app/?as=takunda`

While the single local sim was still running, the same probe against prod
showed the same monotonic motion (lat advancing by ~120 µ° per 2 s, no
teleport, eta_chip stable at "ZH 4822 · ETA 11 min" through 30 samples).
`probe-3-prod-60s.json` raw.

After killing the local sim entirely, the **same prod URL froze** — ZH 4822
sat at `lat=-17.776353, lng=31.050378` across all 20 samples (40 s) with no
movement at all. eta_chip dropped to "ZH 4822" with the ETA suffix gone.
`probe-4-prod-no-local-sim.json` raw.

## Architectural inconsistencies surfaced during the trace (not the
teleport bug; flagged for completeness)

- `components/PassengerMap.tsx:1350` drops every broadcast tick whose
  `vehicle_id` is not in `HEIGHTS_NATIVE_PLATES_CLIENT = {ZH 4821, ZH 4822}`.
  `components/passenger/Journey.tsx:255` has no such filter; its
  `vehicles` Map ingests all 8 plates.
- For a leg 2 (`route_westgate_copa_segment`), `pickAssignedVehicle`
  returns `ZH 5101`, which the eta-chip displays — but the map source has
  no feature for `ZH 5101` because of the corridor filter, so the chip
  names a vehicle the user cannot see.
- The server-injected synthetic `ZH 4823` is in the kombis source on the
  first paint (via `mountAllSources`), then disappears after the first
  broadcast: the RAF loop rebuilds the source only from interpRef-derived
  entries, and `ZH 4823` never broadcasts.
- `assignedVehicleIdRef.current` is read every RAF frame, but the
  rendered `is_assigned` on each feature only updates while the RAF is
  actively writing (i.e., during the 1500 ms ease window after a
  broadcast). Between broadcasts the source can show a stale assignment.

## Files instrumented (Phase 1 — to be reverted before Phase 4)

- `lib/sim/simRunner.ts` (~+10 lines, marked `PHASE-1-INSTRUMENT`)
- `components/PassengerMap.tsx` broadcast handler (~+8 lines)
- `components/PassengerMap.tsx` RAF loop (~+15 lines)
- `lib/passenger/journey-stage.ts` `pickAssignedVehicle` (~+15 lines)

Grep `PHASE-1-INSTRUMENT` to find them all.

## End of Phase 1

No cause proposed. Awaiting review.
