# R2 — feat(R2): map content filter + zoom-to-Bannockburn + 3 kombis

> Paste this whole document into Claude Code as one job. Same operating frame as R1: Auto Mode within `.claude/settings.local.json` allowlist, conventional commits to main, validate `pnpm typecheck && pnpm lint && pnpm build` after edits, do NOT push until Cowork has greenlighted the rehearsal screenshots, append the BUILD-LOG line after push.

## Context

Phase R1 (commit `a63901d`) shipped dark tokens, the dark-v11 base map with paint overrides, and the floating-island tab bar. R2 fixes the **map content** so the empty state reads as Bolt/inDrive: zoomed to the user, three kombis on the corridor, the Heights→Rezende route popping in Apple-blue, the other three routes sitting back in faint white.

Brand framing: **Takunda's location + the kombis that matter to him**. He's at Bannockburn Rd North Terminus (synthetic GPS — no `navigator.geolocation`); the recording shows three kombis on the Heights→Rezende corridor — two outbound (heading south toward Rezende) and one inbound (heading north back to Heights), pinned at UZ Main Gate.

## Locked decisions for R2

- Synthetic user position: lat `-17.74980`, lng `31.04250` (Bannockburn Rd North Terminus). The blue dot is hardcoded here. No browser geolocation.
- Initial map view: `center: [31.04250, -17.74980]`, `zoom: 15.5`, no `bounds` / `fitBoundsOptions` for the idle state. Trip-active fitBounds (existing journey logic) stays.
- Kombi-on-corridor count: exactly **3**, all on `route_heights_rezende`.
  - `ZH 4821` and `ZH 4822` — native plates per `seed/loader.ts`. Driven by sim broadcasts as today.
  - `ZH 4823` — **synthetic** plate. No DB row. Server-injected at SSR time only. Pinned at `sp_uz_gate` (`-17.78465, 31.05154`), bearing `0` (north — inbound visual). Never receives broadcasts so it stays put.
- The other 5 plates (`ZH 4901`, `ZH 4902`, `ZH 5001`, `ZH 5101`, `ZH 5102`) are filtered out at both surface load **and** the client-side broadcast handler, so even if `pnpm sim` ticks for them they never render.
- Route line styling:
  - `route_heights_rezende` — `--color-action` (`#007AFF`), `line-opacity: 0.95`, slightly thicker.
  - The other three routes — `rgba(255,255,255,0.45)` line-color, `line-opacity: 0.18`. Faint, present, not noisy.
- The seed `route_id` for the fourth route is `route_westgate_copa_segment` (note the trailing `_segment`) — the prompt that birthed this rebuild had it as `route_westgate_copa`; ignore that, the seed is the truth.

## Why a synthetic plate (ZH 4823) instead of "borrowing" ZH 5002

The session-prompt-as-written suggested borrowing ZH 5002 from `route_fourthst_borrowdale` and overriding its `route_id` and `current_position` on the surface payload. Problem: when `pnpm sim` runs, simRunner broadcasts the **real** ZH 5002 every 2 s with its real Borrowdale Road position; the client-side broadcast handler would pull the marker off UZ Gate and onto Borrowdale within a tick. We could filter ZH 5002 out of the broadcast handler, but then ZH 5002 has special-case logic in two places (server pin + client filter).

A synthetic plate (`ZH 4823`) sidesteps the entire collision: no DB row, no broadcast, just a static SSR-injected marker. The client only whitelists `ZH 4821` and `ZH 4822` for live updates; `ZH 4823` is invisible to the broadcast pipeline and stays exactly where the server put it.

## Files to NOT touch in R2

- `seed/network.json`, `seed/loader.ts` (frozen)
- `supabase/migrations/*`
- `lib/sim/simRunner.ts` (broadcast pipeline locked)
- `lib/passenger/journey.ts`, `journey-stage.ts`
- `lib/passenger/actions.ts` (server-action shapes)
- `lib/passenger/simulate.ts` (R4 owns walking branch)
- `lib/ai/*`
- All `/hwindi`, `/fleet`, `/wa` files (R5)
- Booking-flow components (`IdleSheetContent`, `PlanList`, `PaymentChoiceSheet`, etc. — R3)
- `components/passenger/TabBar.tsx`, `PassengerShell.tsx` chrome (R1's territory)

---

## Step 1 — server-side corridor filter in `lib/passenger/loadPassengerSurface.ts`

Add a new module-scope helper at the bottom of the file (above the existing `loadPassengerSurface` export) and call it inside the `Promise.all` composition.

```ts
/* ============================================================================
 * R2 — corridor filter
 *
 * Surface-side override that confines visible kombis to the Heights→Rezende
 * corridor for the rebuilt empty state. Two real plates (ZH 4821, ZH 4822)
 * remain DB-backed and continue to receive sim broadcasts. A third synthetic
 * plate (ZH 4823) is injected at SSR time only — no DB row, no broadcasts,
 * pinned at the UZ Main Gate stop with bearing 0 (inbound visual).
 *
 * The other five fleet plates (ZH 4901, ZH 4902, ZH 5001, ZH 5101, ZH 5102)
 * are filtered out here AND must also be filtered at the client-side
 * broadcast handler in PassengerMap.tsx — see R2 step 3.
 * =========================================================================*/

const HEIGHTS_NATIVE_PLATES: ReadonlySet<string> = new Set([
  "ZH 4821",
  "ZH 4822",
]);

const R2_SYNTHETIC_PLATE = "ZH 4823" as const;
const R2_UZ_GATE: Readonly<{ lat: number; lng: number }> = {
  lat: -17.78465,
  lng: 31.05154,
};

function applyR2CorridorFilter(
  kombis: ReadonlyArray<KombiTickPayload>,
): KombiTickPayload[] {
  const corridor = kombis.filter((k) => HEIGHTS_NATIVE_PLATES.has(k.vehicle_id));
  corridor.push({
    vehicle_id: R2_SYNTHETIC_PLATE,
    route_id: "route_heights_rezende",
    lat: R2_UZ_GATE.lat,
    lng: R2_UZ_GATE.lng,
    direction: "inbound",
    bearing: 0,
    at: new Date().toISOString(),
  });
  return corridor;
}
```

Then update the composition at the bottom of `loadPassengerSurface`:

```ts
// Was:
//   const initialKombis = spreadColocatedAlongRoutes(rawKombis, network);
const spread = spreadColocatedAlongRoutes(rawKombis, network);
const initialKombis = applyR2CorridorFilter(spread);
```

> The spread step still runs first, so when `ZH 4821` and `ZH 4822` are both at the polyline start (no sim ticking), the spread distributes them at 1/3 and 2/3 along the Heights→Rezende polyline. Then the corridor filter passes them through and appends the synthetic plate. With sim running, ZH 4821 and ZH 4822 already have non-colocated positions, the spread is a no-op for them, and the corridor filter just appends ZH 4823.

---

## Step 2 — initial map view in `components/PassengerMap.tsx`

Add module-scope constants near the existing `ROUTES_SOURCE` block (~line 17):

```ts
const USER_LOCATION = { lat: -17.74980, lng: 31.04250 } as const;
const USER_SOURCE = "svika-user";
const USER_LAYER_HALO = "svika-user-halo";
const USER_LAYER_DOT = "svika-user-dot";

const HEIGHTS_ROUTE_ID = "route_heights_rezende" as const;
const HEIGHTS_NATIVE_PLATES_CLIENT: ReadonlySet<string> = new Set([
  "ZH 4821",
  "ZH 4822",
]);
```

Change the map constructor at line 561 from:

```ts
const map = new mapboxgl.Map({
  container: containerRef.current,
  style: "mapbox://styles/mapbox/dark-v11",
  bounds: harareBounds(network),
  fitBoundsOptions: { padding: 80, duration: 0 },
  attributionControl: false,
});
```

to:

```ts
const map = new mapboxgl.Map({
  container: containerRef.current,
  style: "mapbox://styles/mapbox/dark-v11",
  center: [USER_LOCATION.lng, USER_LOCATION.lat],
  zoom: 15.5,
  attributionControl: false,
});
```

> Leave the trip-active `fitBounds` `useEffect` alone — it's the journey-active zoom that triggers when a trip is picked. R2 only changes the **idle** view.

---

## Step 3 — split route base layer + add user dot inside `map.on('load', …)`

Find the `ROUTES_LAYER_BASE` add-layer call at around line 601. Replace the single base layer with two filtered base layers — one for the Heights primary, one for the other three routes. **Keep `ROUTES_LAYER_BASE` as the constant name for the secondary layer** so the existing fade-on-journey-active logic at lines 1226/1240 still targets it (we want the secondary lines to fade further when a journey is active; the primary line is overridden by the route-highlight layer when journey is active anyway).

```ts
// Replace the existing single ROUTES_LAYER_BASE addLayer call with two
// filtered base layers — primary (Heights→Rezende) and secondary (others).

// PRIMARY — Heights→Rezende, Apple-blue, prominent.
map.addLayer({
  id: "svika-routes-base-primary",
  type: "line",
  source: ROUTES_SOURCE,
  filter: ["==", ["get", "id"], HEIGHTS_ROUTE_ID],
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": "#007AFF", // --color-action
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5, 16, 7],
    "line-opacity": 0.95,
  },
});

// SECONDARY — other three routes, faint white, present but not noisy.
// NOTE: kept under the existing ROUTES_LAYER_BASE constant id so the
// existing fadeToJourney logic at lines 1226 / 1240 keeps working.
map.addLayer({
  id: ROUTES_LAYER_BASE,
  type: "line",
  source: ROUTES_SOURCE,
  filter: ["!=", ["get", "id"], HEIGHTS_ROUTE_ID],
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": "rgba(255, 255, 255, 0.45)",
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4, 16, 6],
    "line-opacity": 0.18,
  },
});
```

Then, immediately after the existing `STOPS_LAYER_DOT` add-layer call (so user-dot lays on top of stops but below kombi markers — kombis register later in the load callback so they'll naturally land above; verify in the rehearsal), add the user-location source and two layers:

```ts
map.addSource(USER_SOURCE, {
  type: "geojson",
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [USER_LOCATION.lng, USER_LOCATION.lat],
        },
        properties: {},
      },
    ],
  },
});

// Pulsing halo — animated by RAF below.
map.addLayer({
  id: USER_LAYER_HALO,
  type: "circle",
  source: USER_SOURCE,
  paint: {
    "circle-radius": 14,
    "circle-color": "#007AFF",
    "circle-opacity": 0.4,
    "circle-stroke-width": 0,
  },
});

// Solid blue dot with white ring.
map.addLayer({
  id: USER_LAYER_DOT,
  type: "circle",
  source: USER_SOURCE,
  paint: {
    "circle-radius": 7,
    "circle-color": "#007AFF",
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 2,
    "circle-opacity": 1,
  },
});
```

### RAF pulse animation

Below the existing kombi RAF loop in the same effect (find the `interpRef` RAF — around lines 1090–1130, look for the `requestAnimationFrame` that handles kombi interpolation), set up an independent RAF that animates the halo radius and opacity in a 1.6 s cycle. Cleanest is to add a small inline helper:

```ts
// User-dot pulse — independent of the kombi interpolation RAF.
let userPulseRaf = 0;
const startedAt = performance.now();
const tickUserPulse = (now: number) => {
  if (!mapRef.current || !mapRef.current.getLayer(USER_LAYER_HALO)) {
    return;
  }
  const t = ((now - startedAt) % 1600) / 1600; // 0..1 across 1.6s
  const radius = 14 + (26 - 14) * t;
  const opacity = 0.4 * (1 - t);
  try {
    mapRef.current.setPaintProperty(USER_LAYER_HALO, "circle-radius", radius);
    mapRef.current.setPaintProperty(USER_LAYER_HALO, "circle-opacity", opacity);
  } catch {
    // map disposed mid-tick; bail.
    return;
  }
  userPulseRaf = requestAnimationFrame(tickUserPulse);
};
userPulseRaf = requestAnimationFrame(tickUserPulse);
```

In the effect's cleanup function, cancel this RAF alongside the existing cleanup:

```ts
cancelAnimationFrame(userPulseRaf);
```

(If the existing `useEffect` already returns a cleanup that cancels other RAFs, just append the cancel.)

> If `prefers-reduced-motion: reduce` is matched, skip the RAF entirely and leave the halo at the resting `circle-radius: 14, circle-opacity: 0.4`. Cheapest implementation: gate the `requestAnimationFrame` line on `!window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

---

## Step 4 — client-side broadcast filter

Find the broadcast handler at around line 928:

```ts
channel.on("broadcast", { event: SIM_EVENT }, (msg) => {
  /* … existing body iterates `payload` and updates interpRef … */
});
```

Wrap or filter the iteration so only `ZH 4821` and `ZH 4822` reach `interpRef`:

```ts
channel.on("broadcast", { event: SIM_EVENT }, (msg) => {
  const payload = (msg.payload ?? []) as KombiTickPayload[];
  for (const t of payload) {
    // R2: corridor filter — drop ticks for fleet plates not on the
    // Heights→Rezende corridor. Synthetic ZH 4823 is server-injected
    // and never broadcasts, so no special case for it.
    if (!HEIGHTS_NATIVE_PLATES_CLIENT.has(t.vehicle_id)) continue;
    // … rest of the existing body, reading from `t` …
  }
});
```

If the existing handler reads `payload` differently (e.g. iterates with a different binding), preserve that pattern — just add the `continue` early-out at the top of the loop.

---

## Step 5 — validate

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Self-correct any errors.

In two terminals:

```bash
pnpm dev
pnpm sim:start    # important for R2: confirms broadcast filter works
```

Drive `http://localhost:3000/?as=takunda` at 390×844. Capture four rehearsal screenshots in `scripts/phase-R2-rehearsal-{1..4}.png`:

1. **Idle, no journey** — map centered on Bannockburn at zoom ~15.5, pulsing blue dot visible at the user position, exactly **3** kombi markers on the Heights→Rezende corridor, the route line in bright Apple-blue, the other three routes faint white.
2. **Wider zoom (~13)** — manually pinch-zoom or programmatically set zoom 13, confirm only the 3 corridor kombis remain on the map, no fleet plates from other routes appearing as you zoom out.
3. **With sim running for ≥30 s** — confirm ZH 4821 and ZH 4822 are advancing along the Heights polyline (sim broadcasts reach them); ZH 4823 stays pinned at UZ Gate.
4. **Console / DOM probe** — open dev tools and run `window.__svikaMap.getStyle().layers.map(l => l.id)`. Confirm `svika-user-halo`, `svika-user-dot`, `svika-routes-base-primary` are all in the list. Capture the console output as the screenshot's extra evidence (or paste into the brief reply).

Surface the four screenshot paths in your reply so Cowork can visually verify before push.

---

## Step 6 — commit + push (only after Cowork greenlights)

Narrow staging — do NOT use `git add -A`:

```bash
git add \
  lib/passenger/loadPassengerSurface.ts \
  components/PassengerMap.tsx \
  scripts/phase-R2-rehearsal.ts \
  scripts/phase-R2-rehearsal-1.png \
  scripts/phase-R2-rehearsal-2.png \
  scripts/phase-R2-rehearsal-3.png \
  scripts/phase-R2-rehearsal-4.png \
  docs/rebuild/R2-brief.md

git status      # confirm no drift before commit
git commit -m "feat(R2): map content filter + zoom-to-Bannockburn + 3 kombis"
git push origin main
```

> The PNGs may be ignored by `.gitignore:48` (`phase*-*.png` rule). If `git status` shows them as untracked, add `--force` only after a `git check-ignore -v` confirms the rule path. Otherwise, commit without the PNGs and surface them locally for Cowork — same pattern as R1.

---

## Step 7 — append to `docs/BUILD-LOG.md`

```
2026-04-28 | R2 | Surface payload filtered to Heights→Rezende corridor (ZH 4821 + ZH 4822 native, synthetic ZH 4823 pinned at UZ Main Gate as inbound), other 5 fleet plates dropped at SSR and at the broadcast handler; passenger map idle view re-centered on Takunda's synthetic location at Bannockburn (lat -17.74980, lng 31.04250) at zoom 15.5 with a pulsing Apple-blue user dot; route polyline split into a primary layer (Heights = Apple-blue, line-opacity 0.95) and a secondary layer (other three routes, faint white, line-opacity 0.18) | <NEW_SHA> | local-rehearsal
```

Cowork (verifying agent) will append a follow-up `local-rehearsal+prod-curl` entry once the marker `data-testid="svika-tab-bar"` (existing R1 marker) and `window.__svikaMap.getLayer("svika-user-dot")` are both confirmed live.

---

## Stop conditions

- Stop only on a real architecture conflict (e.g. the broadcast filter breaks an existing test fixture, or `applyR2CorridorFilter` interacts badly with `loadActiveJourney`).
- If the user pulse RAF causes visible frame drops (rare on dark-v11 + 2 layers), drop the radius/opacity animation to a 4-step CSS-keyframe equivalent on a regular DOM overlay instead — but only if you've measured a real problem.
- Otherwise, run all the way through to commit + push + BUILD-LOG.

End of brief.
