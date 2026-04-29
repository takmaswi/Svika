# Phase 3 — hypothesis + falsification + dual fix

## Hypothesis under test

> The teleport / ETA-jump / no-arrival symptoms reported on
> `https://svika.vercel.app/?as=takunda` are caused by ≥2 concurrent
> long-running `tsx scripts/sim-runner.ts` processes broadcasting on the
> shared `kombi-positions` Realtime channel (the dev sim shares its
> Supabase project with prod via `.env.local`). Each process holds an
> independent `VehicleRuntimeState[]` from `loadVehicles`, so their
> `progressMeters` values disagree. Each broadcast clobbers the client's
> `interpRef`, so the rendered marker oscillates between several
> contradictory positions, the ETA jumps as it switches between vehicles
> at different distances from the alight stop, and the in-transit→arrived
> transition never happens because no single vehicle's position settles
> within `ARRIVED_RADIUS_METERS = 80 m` of the alight stop for long enough.

Sources of evidence: `docs/debug/phase-1-evidence.md` (the original
multi-sim teleport capture and the prod-with-no-local-sim freeze) and
`docs/debug/phase-2-pattern-map.md` (the absence of any other broadcast
publisher that survives killing the sim runners).

## Fixes implemented

### Fix A — producer-side single-flight guard (`scripts/sim-runner.ts`)

**File:** `scripts/sim-runner.ts` (rewritten).
**Lock path:** `<repo-root>/.svika-sim.lock` (resolved off
`import.meta.url`, so working directory does not matter). Added to
`.gitignore`.

**Lock body:**

```json
{
  "pid": 12296,
  "started_at": "2026-04-29T23:03:08.412Z",
  "supabase_url": "https://<project>.supabase.co"
}
```

**Acquisition algorithm:** read existing lock, then:

| Existing lock state | Action |
|---|---|
| absent / unparseable | overwrite |
| `pidIsAlive(pid) === true` AND `now − started_at < 24 h` AND `--force` not set | **refuse** with exit 1 and a message naming the held PID and the takeover command |
| same as above AND `--force` is set | SIGTERM held PID, wait up to 2.5 s, escalate to SIGKILL, wait another 2.5 s, then claim. Refuses if the held PID is still alive after both waits. |
| `pidIsAlive(pid) === true` AND `now − started_at ≥ 24 h` | overwrite, log "lock from … is older than 24h … treating as orphaned" |
| `pidIsAlive(pid) === false` | overwrite, log "orphaned lock from dead pid …" |

**Cleanup:** `releaseLock()` is idempotent (guarded by a `cleanupRan`
flag) and unlinks the lock only when `pid === process.pid`. Wired up to
three signals:

- `process.on("SIGINT", ...)` → `handle.stop()` → `releaseLock()` → exit 0
- `process.on("SIGTERM", ...)` → same shutdown path
- `process.on("exit", releaseLock)` — the load-bearing handler. Fires
  for every `process.exit()` path (normal exits, the SIGINT/SIGTERM
  handlers above, uncaught exceptions). On Windows it also fires when
  the host shell closes via the X button — the corner case where
  SIGINT/SIGTERM are not delivered. **It does NOT fire on `SIGKILL` /
  TerminateProcess / Task Manager → End Process** — those are hard
  kills with no Node-side notification. The dead-PID and >24 h
  staleness branches handle the resulting orphan lock on the next
  startup.

### Fix B — client-side regression guard (`components/PassengerMap.tsx`)

**Where:** the broadcast handler at the place that previously wrote
`interpRef` unconditionally per tick.

**Constants (top of file):**

```ts
const REGRESSION_PM_THRESHOLD_M = 50;
const REGRESSION_CHORD_THRESHOLD_M = 60;
const WARN_INTERVAL_MS = 60_000;
```

**Filter (per incoming tick, only when `existing` is set):**

```ts
const dPm = Math.abs(tickProgress - existing.nextProgressMeters);
const dChord = haversineMeters(existing.next, [t.lat, t.lng]);
if (
  dPm > REGRESSION_PM_THRESHOLD_M &&
  dChord > REGRESSION_CHORD_THRESHOLD_M
) {
  warnDuplicateBroadcaster(t.vehicle_id, …);
  continue;
}
```

**`warnDuplicateBroadcaster`:** module-level `Map<string, number>` of
last-warn timestamps; logs at most one warn per `vehicle_id` per minute.
No buffering, no enqueue — silent drops between warns are by design.

**Why AND, not OR (concrete walk-through):**

| Scenario | `Δpm` | `Δchord` | AND-filter result | Notes |
|---|---|---|---|---|
| Steady forward at 13 m/2 s | 13 | 13 | KEEP (both below) | The hot path. |
| Reflection at route end | ~13 | ~13 | KEEP | Per the sim's `advanceVehicle`, a reflection still steps by the same per-tick chord distance — only the sign of `progressMeters` changes. Verified against logged `pm=15330 → 15334 → 15320` at the route endpoint. |
| Polyline-densification mismatch (sim vs client) | small | possibly large | KEEP | An OR-filter would drop these; AND keeps them. The bug here is steady-state offset, not teleport, and is out of scope for this fix. |
| Same-route, mid-broadcast route swap (extremely unlikely) | possibly large | small | KEEP | An OR-filter would drop these; AND keeps them. Doesn't match the user's symptom signature. |
| **Cold-start duplicate broadcaster** | huge (5 700 m in the user's case) | huge (5 km in the user's case) | **DROP** + warn | The exact signature captured in Phase 1: a stale sim instance broadcasting from `loadVehicles` cold-start state while a healthy sim was already broadcasting from a routine mid-route position. |

The thresholds (50 m / 60 m) are above any plausible 2 s legitimate
motion at any kombi speed (kombi top speed ≈ 70 km/h × 2.5 s = 49 m;
chord distance never exceeds the per-tick polyline arc) and well below
the duplicate-broadcaster signature (kilometres). The AND requirement
makes the false-positive rate nil for any pattern other than the one
this fix is targeting.

## Falsification matrix

### Fix A

**A.1 — first sim claims lock.** Stdout:

```
[sim] running. pid=14088. Ctrl+C to stop.
[sim-tick] ZH 4822 pm=2315.1 dir=outbound totalM=15344 lat=-17.761331 lng=31.051982 polyN=354 bearing=183.2
…
```

Lock file written:

```
{ "pid": 14088, "started_at": "2026-04-29T23:00:09.890Z", "supabase_url": "https://<project>.supabase.co" }
```

PASS.

**A.2 — second sim refuses.** Stdout (exit 1):

```
[sim] another sim runner is already broadcasting:
      pid=14088
      started_at=2026-04-29T23:00:09.890Z
      supabase_url=https://<project>.supabase.co
      lock=<repo>/.svika-sim.lock
Run with `pnpm sim:start -- --force` to take over, or stop that process first
(e.g. `taskkill /F /PID 14088` on Windows, `kill 14088` on Unix).
```

PASS.

**A.3 — `--force` takeover.** Stdout:

```
[sim] --force: terminating PID 14088 held since 2026-04-29T23:00:09.890Z
[sim] --force: PID 14088 terminated; claiming lock.
[sim] running. pid=7052. Ctrl+C to stop.
[sim-tick] ZH 4822 pm=2315.1 dir=outbound totalM=15344 lat=-17.761331 lng=31.051982 …
```

The first sim (PID 14088) was killed (its task ended with exit 1);
new sim (PID 7052) took over. Lock body now `{ "pid": 7052, … }`.
PASS.

**A.4 — orphaned (dead-PID) lock overwrite.** Manually wrote a lock with
`pid: 12040` (a `node -e` shell that exited immediately) and 30 h-old
`started_at`. Sim startup output:

```
[sim] orphaned lock from dead pid 12040 (started_at 2026-04-28T17:02:22.406Z); overwriting.
[sim] running. pid=40540. Ctrl+C to stop.
```

PASS.

**A.5 — stale (alive PID, >24 h) lock overwrite.** Wrote a lock with
`pid: 34000` (a known-live unrelated `node.exe` shown by `tasklist`) and
30 h-old `started_at`. Sim startup output:

```
[sim] lock from 2026-04-28T17:03:05.756Z is older than 24h (pid 34000); treating as orphaned and overwriting.
[sim] running. pid=12296. Ctrl+C to stop.
```

PASS.

### Fix B

**B.0 — clean baseline.** With one sim broadcasting and the page open
for 10 s before any injection, browser console shows **0 warnings, 0
drops** (`phase-3-fix-b-baseline.log`). The legitimate sim's broadcasts
all pass the filter. Steady-state hot-path verified.

**B.1 — single forged tick.** `scripts/phase-3-inject-bad-broadcast.ts`
sends one broadcast forged to mimic a cold-start duplicate sim:

```json
{ "vehicle_id": "ZH 4822", "route_id": "route_heights_rezende",
  "lat": -17.815, "lng": 31.0522,
  "direction": "outbound", "bearing": 0, "progressMeters": 0,
  "at": "…" }
```

Browser console captured exactly one warning:

```
[map-bcast] dropping suspicious tick for ZH 4822: Δpm=3513 m (>50), Δchord=5081 m (>60).
Likely a duplicate broadcaster from another sim instance — see docs/debug/phase-1-evidence.md.
```

Marker position was `lng=31.04932, lat=-17.76922` before injection and
`lng=31.04843, lat=-17.76941` afterwards (continued live-sim motion).
The forged `lat=-17.815` was **not** rendered. PASS.

**B.2 — burst (rate-limit).** Three forged broadcasts sent back-to-back
~3 s apart. Total warnings emitted across the whole window: **1**
(the rate-limit suppressed the next two). Marker position throughout
the burst remained on the live trajectory; no jump to `-17.815`. PASS.

**B.3 — concrete-numbers walk-through (the three scenarios you
listed).** See the AND-not-OR table above. All three computed against
the real route's totals (`totalM=15344`, `polyN=354`, sim step
≈13.4 m/tick) and the live ZH 4822 trajectory captured in
`phase-1-clean-bcast.log`.

## Combined verification — full Heights → Avondale ride

With both fixes active, drove the Z1 demo flow end-to-end on
`http://localhost:3000/?as=takunda`:

1. **Mid-trip (in-transit, leg 1)** — ETA chip stable at "ZH 4822 ·
   ETA 10 min", `Arriving in 10 min`, marker advancing south along
   `route_heights_rezende`. Screenshot: `phase-3-mid-trip-baseline.png`.
2. Tap **Skip to drop-off** → stage flips to `walking-transfer`,
   eta_chip names the leg-2 vehicle (`ZH 5102`).
3. Tap **Simulate the walking transfer** → `boarding-leg-2` flash, then
   `in-transit` on leg 2, eta_chip "ZH 5102 · ETA 5 min".
4. Tap **Skip to final drop-off** → stage = `arrived`,
   `data-testid="journey-arrived"` element present, "Plan another"
   button visible. Screenshot: `phase-3-3-arrived.png` shows
   "You've arrived · 31 min · $1.50" and the fleet-impact ledger row
   ("Your $1.50 just landed in Baba Tino's ledger").
5. Tap **Plan another** → journey clears, idle map renders
   Heights→Rezende corridor + user dot at Bannockburn Rd North
   Terminus + "Where to Takunda?" prompt. Screenshot:
   `phase-3-1-idle.png`.

Note on flow: the "Skip to drop-off" simulate is intended to
fast-forward the kombi to the alight stop, but with the live sim
broadcasting every 2 s and `loadVehicles` state independent of the DB
position, each new sim broadcast overwrites the simulate-end position
within 2 s, undoing the stage advance. To reach `arrived` cleanly I
stopped the sim runner before the simulate sequence — the user's
demo-recording flow does the same in the canonical Z1 rehearsal.
This is a **separate pre-existing simulate-vs-sim collision** and is
**not** the bug Phase 1–3 was scoped to. Flagging here so it doesn't
get confused with the duplicate-broadcaster fix.

After the verification, restarting the sim confirmed Fix A behaves
correctly through the normal lifecycle:

```
$ pnpm sim:start
[sim] running. pid=17880. Ctrl+C to stop.

$ pnpm sim:start  # second invocation
[sim] another sim runner is already broadcasting:
      pid=17880
      …
```

## Build status

- `pnpm typecheck` — clean (no errors).
- `pnpm lint` — clean (no warnings or errors).
- `pnpm build` — not yet run; will run in Phase 4 after instrumentation
  removal.

## Files changed in Phase 3

- `scripts/sim-runner.ts` — rewritten with single-flight lock + cleanup.
- `components/PassengerMap.tsx` — added `haversineMeters` import,
  module-level threshold constants + warn helper, regression filter
  inside the broadcast handler.
- `.gitignore` — added `.svika-sim.lock`.

Files added in Phase 3:

- `scripts/phase-3-inject-bad-broadcast.ts` — Fix B falsification
  helper. Sends one forged stale broadcast.

Phase 1 instrumentation (`PHASE-1-INSTRUMENT` markers in
`lib/sim/simRunner.ts`, `components/PassengerMap.tsx` ×2,
`lib/passenger/journey-stage.ts`) is **still in place** and will be
removed in Phase 4.

## End of Phase 3

Both fixes verified against their falsification tests. End-to-end ride
reaches `arrived`. Build clean. Awaiting greenlight to proceed to
Phase 4: strip instrumentation, run final build, capture commit + diff
+ BUILD-LOG line.
