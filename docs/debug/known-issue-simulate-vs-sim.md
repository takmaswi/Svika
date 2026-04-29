# Known issue — simulate-vs-sim collision

When the live `tsx scripts/sim-runner.ts` is broadcasting on
`kombi-positions` while the passenger taps the "Skip to drop-off" /
"Simulate the walking transfer" / "Skip to final drop-off" buttons,
the `simulateNextStepAction` server action computes a fast-forward path
to the next target stop and the client RAF-animates the marker to that
final position over `duration_ms` (≈6 s, see `lib/passenger/simulate.ts`).
After the animation completes, `Journey.tsx`'s `setVehicles` writes the
simulated final lat/lng into the local `vehicles` map so
`deriveJourneyStage` will detect arrival. **But within 0–2 s, the next
sim broadcast tick arrives and overwrites `positionsRef[<vehicle_id>]`
with the live sim's actual mid-route position**, which is far from the
simulated alight stop — so `deriveJourneyStage` reverts to `in-transit`
and the journey never reaches `arrived`. Surfaced during Phase 3
end-to-end verification: had to stop the sim runner before the simulate
sequence to reach `arrived`.

This is **out of scope for the duplicate-broadcaster commit**. It is a
separate latent collision in the simulate path that pre-dates the
Phase 1–4 work and can be ticketed and fixed without changing any of
the sim-runner / PID-lock / regression-filter code that just shipped.
The canonical demo-recording flow already works around it (see
`scripts/phase-Z1-rehearsal.ts` — same pattern, sim is paused before
the simulate sequence). Queued for a separate ticket post-recording;
candidate fix shapes include: (a) `simulateNextStepAction` writing the
final position back to the `vehicles` table AND broadcasting a synthetic
`SIM_EVENT` so `interpRef` syncs on the next tick, (b) the broadcast
handler ignoring ticks for a vehicle that is currently in a
simulate-path animation (track via a `Set<string>` of in-flight
animations), (c) re-architecting the simulate path to publish through
the same channel the sim broadcasts on so there is one source of truth
for vehicle positions in the demo.
