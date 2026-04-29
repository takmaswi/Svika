# Phase 2 — pattern map: every place that could publish on `kombi-positions`

Goal: confirm whether anything *other* than a sim-runner process can produce a
duplicate broadcast on the `kombi-positions` channel that would survive killing
all `tsx scripts/sim-runner.ts` processes.

Methodology: grep for `kombi-positions`, `SIM_CHANNEL`, `SIM_EVENT`,
`TICKET_REDEEMED_EVENT`, `channel.send`, `type: "broadcast"`, `setInterval`,
`pg_cron`, `cron.schedule`, `cron_job`, `realtime.broadcast` across the entire
repo. For each hit, classify producer vs subscriber, lifetime (long-running vs
short-lived per request), and event type.

## All publishers on `SIM_CHANNEL` (= `"kombi-positions"`)

| File | Line | Event | Lifetime | Risk shape |
|---|---|---|---|---|
| `lib/sim/simRunner.ts` | 228 | `SIM_EVENT` (positions) | **Long-running** — single `setInterval` at 2 s while `startSim` is alive | This is THE canonical source. Multiple instances → the bug. |
| `lib/conductor/actions.ts` | 203 | `TICKET_REDEEMED_EVENT` | Short-lived per `redeemTicketAction` call: open, send once, `removeChannel` | Different event. Map's broadcast handler only matches `SIM_EVENT`. Cannot teleport positions. |
| `lib/passenger/simulate.ts` | 499 | `TICKET_REDEEMED_EVENT` | Short-lived per `simulateNextStepAction` call: open, send 1–N redeems, `removeChannel` | Different event. Same reasoning. |
| `scripts/phase-Z2-rehearsal.ts` | 348, 446 | `SIM_EVENT` and `TICKET_REDEEMED_EVENT` | Manual Playwright run, exits | Dev-only, not background. |
| `scripts/phase3-5-rehearsal.ts` | 128 | `SIM_EVENT` (test ticks) | Manual run, exits | Dev-only. |
| `scripts/phase3-8-screenshots.ts` | 99, 125 | `SIM_EVENT` + redeem | Manual run, exits | Dev-only. |
| `scripts/phase4-5-motion-verify.ts` | 116 | `SIM_EVENT` (test ticks) | Manual run, exits | Dev-only. |

Verdict on each candidate the user asked me to check:

### (a) Sim runner instantiating two `setInterval` ticks (HMR / hot-reload)

- `lib/sim/simRunner.ts:168` is the only `setInterval` in `lib/sim/`.
- `scripts/sim-runner.ts` calls `startSim()` exactly once. `tsx` runs the
  script once; tsx does **not** support HMR.
- Within a single `startSim` invocation, there is no path for a second
  `setInterval` to be created.
- Conclusion: cannot produce a duplicate broadcast within one process.
- The leak path is purely **multi-process**: every `pnpm sim:start` spawns
  a fresh process, and on Windows an orphaned `tsx` child can survive its
  parent shell closing (the SIGINT/SIGTERM handlers in
  `scripts/sim-runner.ts:50-51` only fire when the signal is actually
  delivered). The user's environment had **10 such orphans accumulated**.

### (b) Second Supabase channel subscription somewhere in the app that re-emits

Subscribers on `SIM_CHANNEL`:
- `components/PassengerMap.tsx:1336-1377` — listens for `SIM_EVENT`,
  writes to `interpRef`. Does **not** call `channel.send`. Pure consumer.
- `components/passenger/Journey.tsx:248-285` — listens for `SIM_EVENT`
  (`setVehicles`) and `TICKET_REDEEMED_EVENT` (UI flash). Does **not**
  call `channel.send`. Pure consumer.

No re-emit anywhere. Conclusion: no client-side channel republisher.

### (c) `simulateNextStepAction` publishing on `kombi-positions`

Confirmed yes: `lib/passenger/simulate.ts:499` calls `channel.send({ type:
"broadcast", event: TICKET_REDEEMED_EVENT, payload: r })` inside
`broadcastRedeems()`. The event is `TICKET_REDEEMED_EVENT`, **not**
`SIM_EVENT`. The map's broadcast handler at
`components/PassengerMap.tsx:1340` filters strictly on `event: SIM_EVENT`,
so a redeem broadcast cannot reach `interpRef` and cannot move a kombi
marker. The Journey component's redeem handler triggers a UI flash + a
`router.refresh()` only.

Cannot teleport kombi positions.

### (d) Prod `pg_cron` or Supabase Edge Function broadcasting on the channel

- `supabase/migrations/*.sql` — grep for `pg_cron|cron.schedule|cron_job`:
  **zero matches**. The only Postgres extensions installed are `postgis`
  and `pgcrypto` (`supabase/migrations/0001_initial_schema.sql:7-8`).
- `supabase/functions/` — does not exist (`Glob` returned no files).
- `supabase/config.toml` — `[edge_runtime] enabled = false`. No edge
  functions configured.
- CLAUDE.md's claim that "the prod sim heartbeat ticks at 6 s via Supabase
  pg_cron" is aspirational, not implemented. Phase 1's probe-4 (prod URL
  with no local sim → marker frozen for 40 s) is consistent with this.

No prod-side broadcast source exists. Conclusion: nothing on prod produces
broadcasts on `kombi-positions` other than the dev sim runners that share
the Supabase project via `.env.local`.

## Other things I checked while I was in there

- `scripts/sim-runner.ts:50-51` registers `SIGINT` and `SIGTERM` handlers
  that call `handle.stop()`. On Windows, closing a terminal window with
  the X button does not always deliver these signals to descendants —
  this is the upstream reason for the orphan accumulation. The PID-lock
  fix the user wants will make subsequent invocations either take over
  or refuse, neutralising that leak.
- `package.json` does not bundle `pnpm sim:start` into `pnpm dev` (no
  `concurrently`, `npm-run-all`, or `run-p`). `sim:start` is a separate
  manual script invocation. Good — it means a single `pnpm dev` does not
  trigger any auto-spawn of sim runners.
- All the rehearsal scripts (`phase-Z2`, `phase3-5`, `phase3-8`,
  `phase4-5-motion-verify`) open a channel, broadcast a small batch,
  `removeChannel`, exit. They cannot survive in the background.

## Verdict

**Zero additional broadcast sources survive killing all `sim-runner.ts`
processes.** The Phase 1 hypothesis stands alone:

> The teleport / ETA-jump / no-arrival symptoms are caused by ≥2 concurrent
> long-running `tsx scripts/sim-runner.ts` processes broadcasting on the
> shared `kombi-positions` Realtime channel. Each process holds independent
> `VehicleRuntimeState[]` from `loadVehicles`, so their `progressMeters`
> values disagree. The client's `interpRef` is overwritten on every
> broadcast, producing back-and-forth teleport on the map and oscillating
> ETA in the journey card.

No second root cause is hiding in the code. Phase 3 can proceed to verify
both fixes the user authorised:

1. **Producer-side single-flight guard** in `scripts/sim-runner.ts` (PID
   lock-file or equivalent) so `pnpm sim:start` either takes over or
   refuses to start when another instance is already broadcasting.
2. **Client-side defensive guard** in `components/PassengerMap.tsx`
   broadcast handler — drop a tick whose `progressMeters` regresses by
   more than the chord distance between `prev` and `next` lat/lng (or
   some equivalent monotonicity-with-known-reversal-tolerance check).

## End of Phase 2

No cause changed. No new hypothesis. Single root cause stands.
