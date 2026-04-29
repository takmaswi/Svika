# R3 — feat(R3): two quick picks + trip preview + payment-choice restyle

> Paste this whole document into Claude Code as one job. Same operating frame as R1/R2: Auto Mode within `.claude/settings.local.json` allowlist, conventional commits to main, validate `pnpm typecheck && pnpm lint && pnpm build` after edits, do NOT push until Cowork has greenlighted the rehearsal screenshots.

## Context

R1 (commit `a63901d`) shipped dark tokens + tab bar. R2 (`663b7dc`) filtered the map to 3 corridor kombis and zoomed to Bannockburn. R3 fixes the **booking flow**: reduce the bento to 2 quick picks (Rezende + Avondale), add a new TripPreviewCard between quick-pick tap and payment-choice, restyle PaymentChoiceSheet and PlanList to dark + glass + Apple-blue.

Demo flow after R3 (recording-ready):

1. Land on `/?as=takunda` → idle, dark map, 3 kombis on the corridor, sheet at peek showing "Where to, Takunda?" + 2 quick picks.
2. Tap "Avondale Shops" quick pick → sheet rises to half, map fits the trip corridor, **TripPreviewCard** shows the Avondale walking-transfer plan with stats and a `Buy $1.50` CTA.
3. Tap `Buy $1.50` → **PaymentChoiceSheet** restyled to dark + glass with Apple-blue primary "Pay from wallet" and a dark-glass-outlined "Pay cash" secondary.
4. Tap `Pay $1.50 from wallet` → standard journey flow takes over (walk-to-board, in-transit, walking-transfer, leg 2, arrived). Those screens are R1/R2-correct already; R3 doesn't touch them.

Free-text search (e.g. typed Shona query) still flows through `findPlansAction` → `PlanList` → user picks → `PaymentChoiceSheet`. PlanList gets a visual restyle so it reads on dark.

## Locked decisions for R3

- **Quick picks reduced to 2.** Drop UZ direct + Sam Levy's via rank. Add Rezende Rank.
  - **Rezende Rank** — direct single-leg, $1.50, 38 min, no walk.
  - **Avondale Shops** — multi-leg via Lomagundi walking transfer, $1.50, 31 min, 6 min walk. (Same plan that's already FEATURED, restyled.)
- **Quick picks bypass `findPlansAction`.** Each preset has a full `TripPlan` baked into the IdleSheetContent module — tapping a preset fires a new `onPickPreview(plan)` callback, not the existing `onSubmit(query)`. Reasoning: the seed's `trip_plans` array is frozen at three entries (Avondale, UZ, Sam Levy's); adding a Rezende plan would violate CLAUDE.md's "three trip plans · frozen after Phase 1" lock. Hardcoding the two preview plans in client code keeps the seed pristine; drift risk is low at hackathon scale.
- **New SheetState `"trip-preview"`** sits between `"plans-returned"` and `"choosing-payment"` in the ladder. Driven by a new `quickPickPreview: TripPlan | null` state in `PassengerShell`.
- **TripPreviewCard is brand-new** (`components/passenger/TripPreviewCard.tsx`). Glass card on dark surface, Apple-blue Buy CTA. Shows: trip label, stats row (duration, fare, walking minutes if any), legs preview chip strip, walking-transfer indicator if applicable.
- **Map fits the trip corridor** when `quickPickPreview !== null`. Reuses the same fitBounds machinery the active-journey hook uses today — extended to also key off the preview plan.
- **PaymentChoiceSheet restyled**: Apple-blue primary CTA (`#007AFF`), dark-glass secondary CTA with Apple-blue outline. Old `bg-svika-rust` (which now legacy-aliases to `--color-action`) is replaced with explicit `bg-[var(--color-action)]` so the intent is unambiguous.
- **PlanList restyled** to be readable on dark. Card backgrounds switch from `bg-white` to `.svika-glass`; text uses `--color-ink` / `--color-ink-soft` / `--color-ink-mute`.
- All other sheet states unchanged: walk-to-board, in-transit, walking-transfer, boarding-leg-2, arrived, parcel, wallet, topping-up.

## Files to NOT touch in R3

- `seed/network.json`, `seed/loader.ts` (frozen)
- `supabase/migrations/*`
- `lib/sim/simRunner.ts`
- `lib/passenger/journey.ts`, `journey-stage.ts`, `loadPassengerSurface.ts` (R2)
- `lib/passenger/actions.ts` (server-action shapes locked — `bookTripAction` accepts the existing `TripPlan` shape; R3's hardcoded plans must match it)
- `lib/passenger/simulate.ts` (R4 owns walking branch)
- `lib/ai/*`
- All `/hwindi`, `/fleet`, `/wa` files (R5)
- `components/passenger/Wallet.tsx` (R5 territory — its light cards on dark are an acknowledged R3 visual gap, deferred)
- `components/passenger/TopUpSheet.tsx`, `ParcelSheet.tsx` (R5 territory)
- `components/passenger/TabBar.tsx` (R1)
- `components/passenger/Journey.tsx` (R1/R2 visuals are correct enough)
- `components/passenger/FareClearedToast.tsx`, `FleetImpactCard.tsx`

---

## Step 1 — `components/passenger/IdleSheetContent.tsx`

**Goal**: 2 quick picks with full `TripPlan` shape baked in. New `onPickPreview` callback.

Open the file. Replace the existing `FEATURED` constant and `SECONDARY` array with two new presets, each carrying a full `TripPlan`. The component's prop signature changes — `onSubmit` stays for the typed-search path, but a new `onPickPreview` prop owns the quick-pick path.

```tsx
"use client";

import { useState } from "react";

import SearchBar from "./SearchBar";
import type { TripPlan } from "@/lib/trip-planner";

interface IdleSheetContentProps {
  personaName: string;
  nextHeightsMinutes: number;
  onSubmit: (text: string) => Promise<void>;        // typed search path
  onPickPreview: (plan: TripPlan) => void;          // NEW — quick-pick path
  busy: boolean;
}

interface QuickPick {
  testid: string;
  label: string;
  destination: string;
  via: string;
  badge: "Direct" | "via Lomagundi walk";
  plan: TripPlan;
}

// =====================================================================
// Quick-pick presets — TripPlan shape must match `lib/trip-planner`'s
// public types so bookTripAction accepts it without modification. Verify
// before edit by reading lib/trip-planner.ts; if the shape has drifted
// since this brief, mirror the live shape, don't mirror these strings.
// =====================================================================

const REZENDE_PRESET: QuickPick = {
  testid: "quick-pick-rezende",
  label: "Heights → Rezende Rank",
  destination: "Rezende Rank",
  via: "Direct kombi · 38 min",
  badge: "Direct",
  plan: {
    label: "Heights → Rezende Rank",
    total_fare_usd: 1.5,
    total_duration_minutes: 38,
    total_walking_minutes: 0,
    legs: [
      {
        type: "kombi",
        route_id: "route_heights_rezende",
        board_at_stop_id: "sp_heights_start_north",
        alight_at_stop_id: "sp_rezende_rank",
        fare_usd: 1.5,
        duration_minutes: 38,
      },
    ],
    notes: "Direct kombi to Rezende. No transfers.",
  },
};

const AVONDALE_PRESET: QuickPick = {
  testid: "quick-pick-avondale",
  label: "Heights → Avondale Shops",
  destination: "Avondale Shops",
  via: "via Lomagundi walk · 31 min",
  badge: "via Lomagundi walk",
  plan: {
    label: "Heights → Avondale Shops (via Lomagundi)",
    total_fare_usd: 1.5,
    total_duration_minutes: 31,
    total_walking_minutes: 6,
    legs: [
      {
        type: "kombi",
        route_id: "route_heights_rezende",
        board_at_stop_id: "sp_heights_start_north",
        alight_at_stop_id: "sp_second_lomagundi",
        fare_usd: 1.0,
        duration_minutes: 12,
      },
      {
        type: "walk",
        from_stop_id: "sp_second_lomagundi",
        to_stop_id: "sp_lomagundi_kinggeorge_pickup",
        duration_minutes: 6,
      },
      {
        type: "kombi",
        // Verify route_id by checking which seed route owns
        // sp_lomagundi_kinggeorge_pickup → sp_avondale_shops. Likely
        // route_marketsq_avondale per seed/network.json. If the seed has
        // a different route id covering that segment, use it.
        route_id: "route_marketsq_avondale",
        board_at_stop_id: "sp_lomagundi_kinggeorge_pickup",
        alight_at_stop_id: "sp_avondale_shops",
        fare_usd: 0.5,
        duration_minutes: 13,
      },
    ],
    notes: "Two kombis with a 6-minute walk at Lomagundi Road.",
  },
};

const PRESETS: ReadonlyArray<QuickPick> = [REZENDE_PRESET, AVONDALE_PRESET];

export default function IdleSheetContent({
  personaName,
  nextHeightsMinutes,
  onSubmit,
  onPickPreview,
  busy,
}: IdleSheetContentProps) {
  const [pickedTestid, setPickedTestid] = useState<string | null>(null);
  const firstName = personaName.split(" ")[0];

  function handlePreset(preset: QuickPick): void {
    if (busy) return;
    setPickedTestid(preset.testid);
    onPickPreview(preset.plan);
  }

  return (
    <section
      className="pt-1 pb-24"
      aria-label="Plan a trip"
      data-testid="idle-sheet-content"
    >
      <h2
        style={{
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "-0.4px",
          lineHeight: 1.15,
          color: "var(--color-ink)",
        }}
      >
        Where to, {firstName}?
      </h2>
      <p
        className="svika-meta mt-1"
        style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
      >
        Type in Shona or English · next Heights kombi {nextHeightsMinutes} min
      </p>

      <div className="mt-3">
        <SearchBar
          onSubmit={onSubmit}
          disabled={busy}
          size="hero"
          placeholder="Avondale, Rezende, UZ…"
        />
      </div>

      <p
        className="svika-meta mt-4 px-1 uppercase"
        style={{ color: "var(--color-ink-mute)" }}
      >
        Quick picks
      </p>

      <div className="mt-2 space-y-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.testid}
            type="button"
            onClick={() => handlePreset(preset)}
            disabled={busy}
            data-testid={preset.testid}
            className="svika-glass relative flex w-full items-center gap-3 px-3 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                backgroundColor: "var(--color-action)",
                color: "white",
              }}
            >
              ↗
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block"
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: "var(--color-ink)",
                }}
              >
                {preset.destination}
              </span>
              <span
                className="svika-meta mt-0.5 block"
                style={{
                  textTransform: "none",
                  color: "var(--color-ink-mute)",
                }}
              >
                {preset.via}
              </span>
            </span>
            <span
              className="svika-mono-code"
              style={{ color: "var(--color-ink)" }}
            >
              ${preset.plan.total_fare_usd.toFixed(2)}
            </span>
            {busy && pickedTestid === preset.testid ? (
              <span
                className="absolute right-3 bottom-1 text-[10px]"
                style={{ color: "var(--color-action)" }}
              >
                …
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
```

> **Verify the `TripPlan` shape**: Before saving, open `lib/trip-planner.ts` and confirm field names match exactly (`total_fare_usd`, `total_duration_minutes`, `total_walking_minutes`, `legs[].type`, `legs[].route_id`, `legs[].board_at_stop_id`, `legs[].alight_at_stop_id`, `legs[].fare_usd`, `legs[].duration_minutes`, `legs[].from_stop_id`, `legs[].to_stop_id` for walks, `notes`). If any field name differs, mirror the file's truth.
>
> **Verify the route_id for Avondale leg 2**: open `seed/network.json` and find the route that owns the stop `sp_lomagundi_kinggeorge_pickup` heading to `sp_avondale_shops`. The brief assumes `route_marketsq_avondale`; if the seed's existing Avondale trip_plan uses a different route_id (e.g. a dedicated King George segment), use that instead.

---

## Step 2 — new `components/passenger/TripPreviewCard.tsx`

```tsx
"use client";

import type { TripPlan } from "@/lib/trip-planner";

interface TripPreviewCardProps {
  plan: TripPlan;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

interface LegSummary {
  kind: "kombi" | "walk";
  duration: number;
  fare: number | null;
}

function summariseLegs(plan: TripPlan): LegSummary[] {
  return plan.legs.map((leg) => ({
    kind: leg.type,
    duration: leg.duration_minutes,
    fare: leg.type === "kombi" ? leg.fare_usd ?? null : null,
  }));
}

export default function TripPreviewCard({
  plan,
  busy,
  onConfirm,
  onClose,
}: TripPreviewCardProps) {
  const fareLabel = `$${plan.total_fare_usd.toFixed(2)}`;
  const legs = summariseLegs(plan);
  const hasWalk = plan.total_walking_minutes > 0;

  return (
    <div
      className="pt-1 pb-2"
      data-testid="trip-preview-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="svika-meta uppercase"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Trip preview
          </p>
          <p
            className="svika-headline mt-1 truncate"
            style={{ color: "var(--color-ink)" }}
          >
            {plan.label}
          </p>
          <p
            className="svika-meta mt-0.5"
            style={{ textTransform: "none", color: "var(--color-ink-soft)" }}
          >
            {plan.total_duration_minutes} min
            {hasWalk
              ? ` · includes ${plan.total_walking_minutes} min walk at Lomagundi`
              : " · direct"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            color: "var(--color-ink-mute)",
          }}
        >
          ×
        </button>
      </div>

      <div
        className="svika-glass mt-3 flex items-center gap-2 px-3 py-2"
        style={{ borderRadius: 14 }}
      >
        {legs.map((leg, idx) => (
          <span key={idx} className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{
                backgroundColor:
                  leg.kind === "kombi"
                    ? "rgba(0, 122, 255, 0.16)"
                    : "rgba(255, 255, 255, 0.08)",
                color:
                  leg.kind === "kombi"
                    ? "var(--color-action)"
                    : "var(--color-ink-soft)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.3px",
              }}
            >
              {leg.kind === "kombi" ? "🚐" : "🚶"} {leg.duration}m
              {leg.fare !== null ? ` · $${leg.fare.toFixed(2)}` : ""}
            </span>
            {idx < legs.length - 1 ? (
              <span
                aria-hidden
                style={{ color: "var(--color-ink-mute)", fontSize: "12px" }}
              >
                →
              </span>
            ) : null}
          </span>
        ))}
      </div>

      {plan.notes ? (
        <p
          className="svika-meta mt-3 px-1"
          style={{
            textTransform: "none",
            color: "var(--color-ink-mute)",
            lineHeight: 1.5,
          }}
        >
          {plan.notes}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        data-testid="trip-preview-buy"
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-white shadow-lg transition-opacity disabled:opacity-60"
        style={{
          backgroundColor: "var(--color-action)",
          boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
        }}
      >
        <span className="svika-body font-semibold">
          {busy ? "Loading…" : `Buy ${fareLabel}`}
        </span>
      </button>
    </div>
  );
}
```

> Substitute the 🚐 / 🚶 glyphs with inline SVG icons if the project already has a kombi/walker SVG path nearby (`public/brand/kombi.svg` for kombi). Emoji is fine for the rehearsal.

---

## Step 3 — `components/passenger/JourneySheetContent.tsx`

Three small extensions:

1. Add `"trip-preview"` to the `SheetState` union.
2. Add three new props: `quickPickPreview: TripPlan | null`, `onConfirmQuickPick: () => void`, `onCancelQuickPick: () => void`.
3. Insert a new dispatch case for `"trip-preview"` above the `"plans-returned"` case.

```tsx
// In the SheetState union, add the new state:
export type SheetState =
  | "idle"
  | "searching"
  | "trip-preview"          // NEW
  | "plans-returned"
  | "choosing-payment"
  | "topping-up"
  | "walk-to-board"
  | "in-transit"
  | "walking-transfer"
  | "boarding-leg-2"
  | "arrived"
  | "parcel"
  | "wallet";

// In JourneySheetContentProps, add three new props near the
// plans-returned cluster:
interface JourneySheetContentProps {
  // …existing…
  quickPickPreview: TripPlan | null;
  onConfirmQuickPick: () => void;
  onCancelQuickPick: () => void;
  // …rest unchanged…
}

// Inside the component body, add a new dispatch case ABOVE the
// "plans-returned" branch:
import TripPreviewCard from "./TripPreviewCard";

if (state === "trip-preview" && props.quickPickPreview) {
  return (
    <div data-testid="journey-sheet-content" data-state="trip-preview">
      <TripPreviewCard
        plan={props.quickPickPreview}
        busy={props.searchBusy}
        onConfirm={props.onConfirmQuickPick}
        onClose={props.onCancelQuickPick}
      />
    </div>
  );
}
```

Also pipe `onPickPreview` through to `IdleSheetContent` in the default branch:

```tsx
<IdleSheetContent
  personaName={props.personaName}
  nextHeightsMinutes={props.nextHeightsMinutes}
  onSubmit={props.onSearch}
  onPickPreview={props.onPickPreviewFromIdle}    // NEW
  busy={props.searchBusy}
/>
```

Add `onPickPreviewFromIdle: (plan: TripPlan) => void` to the props interface.

---

## Step 4 — `components/passenger/PassengerShell.tsx`

Five surgical additions:

**A.** Add the `quickPickPreview` state next to the existing booking-flow state cluster:

```ts
const [quickPickPreview, setQuickPickPreview] = useState<TripPlan | null>(null);
```

**B.** Add the handler set:

```ts
const handlePickPreview = useCallback((plan: TripPlan) => {
  setQuickPickPreview(plan);
  setSearchError(null);
}, []);

const handleConfirmQuickPick = useCallback(() => {
  if (quickPickPreview === null) return;
  // Promote preview → pickedOption. The sheetState ladder will land on
  // "choosing-payment" on the next render, mounting PaymentChoiceSheet.
  setPickedOption(quickPickPreview);
  setQuickPickPreview(null);
}, [quickPickPreview]);

const handleCancelQuickPick = useCallback(() => {
  setQuickPickPreview(null);
}, []);
```

**C.** Update the `sheetState` ladder to include the new state above `"plans-returned"`:

```ts
const sheetState: SheetState = useMemo(() => {
  if (walletOpen) return "wallet";
  if (parcelOpen) return "parcel";
  if (topUpOpen) return "topping-up";
  if (pickedOption !== null) return "choosing-payment";
  if (quickPickPreview !== null) return "trip-preview";   // NEW
  if (plans !== null) return "plans-returned";
  if (searchBusy) return "searching";
  if (journey) {
    /* …existing… */
  }
  return "idle";
}, [
  walletOpen,
  parcelOpen,
  topUpOpen,
  pickedOption,
  quickPickPreview,    // NEW dep
  plans,
  searchBusy,
  journey,
  stage,
]);
```

**D.** Update auto-snap rules: `"trip-preview"` snaps to `"half"` (same as `"plans-returned"`):

```ts
case "plans-returned":
case "trip-preview":      // NEW
case "choosing-payment":
case "topping-up":
case "parcel":
case "arrived":
case "searching":
  desired = "half";
  break;
```

**E.** Pass the new props through to `<JourneySheetContent>`:

```tsx
<JourneySheetContent
  /* …existing props… */
  quickPickPreview={quickPickPreview}
  onConfirmQuickPick={handleConfirmQuickPick}
  onCancelQuickPick={handleCancelQuickPick}
  onPickPreviewFromIdle={handlePickPreview}
  /* …rest… */
/>
```

**F.** When the user dismisses an active journey or hits "Plan another", also clear `quickPickPreview`:

```ts
const handlePlanAnother = useCallback(() => {
  if (initialJourney) setDismissedTripId(initialJourney.trip_id);
  setStage(null);
  setBookingFlash(null);
  setSearchError(null);
  setQuickPickPreview(null);   // NEW
  router.refresh();
}, [initialJourney, router]);
```

---

## Step 5 — `components/PassengerMap.tsx` — fitBounds for preview

Find the existing fitBounds-on-trip-change `useEffect` (added in Phase 3.6 — keyed off `journey?.trip_id`). Add a parallel effect that also fits when `quickPickPreview` is set.

Add a new prop:

```ts
interface PassengerMapProps {
  /* …existing… */
  previewPlan?: TripPlan | null;   // NEW
}
```

Pull `previewPlan` from props. Add a new effect:

```ts
useEffect(() => {
  if (!mapRef.current) return;
  if (!previewPlan) return;
  const map = mapRef.current;
  const stops = networkRef.current.stops;
  const stopById = new Map(stops.map((s) => [s.id, s] as const));
  const points: [number, number][] = [];
  // Always include the user dot so the preview frames "you → destination"
  points.push([USER_LOCATION.lng, USER_LOCATION.lat]);
  for (const leg of previewPlan.legs) {
    if (leg.type === "kombi") {
      const board = stopById.get(leg.board_at_stop_id);
      const alight = stopById.get(leg.alight_at_stop_id);
      if (board) points.push([board.lng, board.lat]);
      if (alight) points.push([alight.lng, alight.lat]);
    } else {
      const from = stopById.get(leg.from_stop_id);
      const to = stopById.get(leg.to_stop_id);
      if (from) points.push([from.lng, from.lat]);
      if (to) points.push([to.lng, to.lat]);
    }
  }
  if (points.length < 2) return;
  let west = points[0][0], east = points[0][0];
  let south = points[0][1], north = points[0][1];
  for (const [lng, lat] of points) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: { top: 80, right: 60, bottom: 320, left: 60 }, // reserve space for the half-snap sheet
      duration: 700,
      maxZoom: 14.5,
    },
  );
}, [previewPlan]);
```

> The existing journey-active fitBounds effect should NOT also fire on `previewPlan` change (no double fits). Leave its dep array alone — it's keyed off `journey?.trip_id`, which doesn't change for previews.

In `PassengerShell.tsx`, pass `previewPlan={quickPickPreview}` to `<PassengerMap>`.

---

## Step 6 — `components/passenger/PaymentChoiceSheet.tsx` restyle

Three changes:

1. Replace `bg-svika-rust` (legacy alias to `--color-action`) with explicit `style={{ backgroundColor: "var(--color-action)" }}` so the intent is unambiguous and the shadow gets the matching tint.
2. Replace the cash button's `border-svika-teal bg-white/60` with `.svika-glass` + `border-color: var(--color-action)` + ink text.
3. Restyle the close button to match dark glass.

```tsx
// Wallet primary CTA — Apple-blue, Apple-blue shadow:
<button
  type="button"
  onClick={onWallet}
  disabled={busyMethod !== null}
  data-testid="payment-wallet"
  className="flex h-14 w-full items-center justify-between rounded-2xl px-4 text-white transition-opacity disabled:opacity-60"
  style={{
    backgroundColor: "var(--color-action)",
    boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
  }}
>
  <span className="svika-body font-semibold">
    {busyMethod === "wallet"
      ? "Charging wallet…"
      : `Pay ${fareLabel} from wallet`}
  </span>
  <span className="svika-mono-code opacity-90" style={{ fontSize: "13px" }}>
    you have {balanceLabel}
  </span>
</button>

// (and similarly for the top-up branch — same Apple-blue + shadow)

// Cash secondary CTA — dark-glass with Apple-blue ring:
<button
  type="button"
  onClick={onCash}
  disabled={busyMethod !== null}
  data-testid="payment-cash"
  className="svika-glass flex h-14 w-full items-center justify-between rounded-2xl px-4 transition-opacity disabled:opacity-60"
  style={{
    borderColor: "var(--color-action)",
    color: "var(--color-ink)",
  }}
>
  <span className="svika-body font-semibold">
    {busyMethod === "cash"
      ? "Reserving seat…"
      : `Pay ${fareLabel} cash on board`}
  </span>
  <span
    className="svika-mono-code"
    style={{ fontSize: "13px", color: "var(--color-ink-mute)" }}
  >
    {seats} of {capacity} seats today
  </span>
</button>

// Close button:
<button
  type="button"
  onClick={onClose}
  aria-label="Close"
  className="flex h-8 w-8 items-center justify-center rounded-full"
  style={{
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "var(--color-ink-mute)",
  }}
>
  ×
</button>
```

Update the header copy too — replace `text-svika-teal` / `text-svika-mute` with `var(--color-ink)` / `var(--color-ink-mute)` inline styles for consistency with the rest of R3.

---

## Step 7 — `components/passenger/PlanList.tsx` restyle

Smaller pass since it's only used in the typed-search path. Replace:

- `bg-white` on the plan card → `.svika-glass` (dark glass)
- `border-svika-teal-100` → `border-[var(--color-hairline)]`
- `text-svika-teal` headers → `color: var(--color-ink)` inline
- `text-svika-mute` body → `color: var(--color-ink-mute)`
- The kombi/walk pill row inside each card: kombi pill uses `rgba(0,122,255,0.16)` background with `var(--color-action)` text; walk pill uses `rgba(255,255,255,0.08)` background with `var(--color-ink-soft)` text.
- Buy button: `bg-svika-rust` → `var(--color-action)` with the matching Apple-blue shadow.

The "no plans yet" empty-state message and the dismiss button get the same dark-glass treatment.

---

## Step 8 — validate

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Self-correct any errors. If `TripPlan`'s shape doesn't match the brief's hardcoded presets, the typecheck will catch it; mirror the actual shape.

In two terminals:

```bash
pnpm dev
pnpm sim:start
```

Drive `http://localhost:3000/?as=takunda` at 390×844. Capture five rehearsal screenshots in `scripts/phase-R3-rehearsal-{1..5}.png`:

1. **Idle, dark map, two quick picks** — sheet at peek showing "Where to, Takunda?" + Rezende Rank + Avondale Shops cards. No UZ, no Sam Levy's.
2. **Avondale quick pick → trip preview** — sheet at half, map fits the trip corridor (user dot at top, Bannockburn → Second/Lomagundi → walk → King George → Avondale Shops in frame), TripPreviewCard visible with the kombi/walk/kombi chip strip.
3. **Tap Buy → PaymentChoiceSheet** — Apple-blue primary "Pay $1.50 from wallet" CTA visible at the top, dark-glass cash secondary below it with Apple-blue ring.
4. **Pay from wallet → walk-to-board (sanity check existing flow not broken)** — Journey card mounts, code visible, sheet at full snap.
5. **Typed search → PlanList** — type "I want to go to UZ from Heights" in the search bar, hit Enter, capture the PlanList card with restyled dark-glass cards. (UZ is no longer a quick pick but the planner still serves it via the seed's UZ trip_plan.)

Surface the five screenshot paths in your reply.

---

## Step 9 — commit + push (only after Cowork greenlights)

Narrow staging — do NOT use `git add -A`:

```bash
git add \
  components/passenger/IdleSheetContent.tsx \
  components/passenger/TripPreviewCard.tsx \
  components/passenger/JourneySheetContent.tsx \
  components/passenger/PassengerShell.tsx \
  components/PassengerMap.tsx \
  components/passenger/PaymentChoiceSheet.tsx \
  components/passenger/PlanList.tsx \
  scripts/phase-R3-rehearsal.ts \
  docs/rebuild/R3-brief.md \
  docs/BUILD-LOG.md

git status      # verify no drift
git commit -m "feat(R3): two quick picks + trip preview + payment-choice restyle"
git push origin main
```

PNGs stay local (gitignored, same pattern as R1/R2).

## Step 10 — append to `docs/BUILD-LOG.md`

```
2026-04-28 | R3 | Quick picks reduced to 2 (Rezende Rank direct $1.50 38min, Avondale Shops via Lomagundi walk $1.50 31min); UZ + Sam Levy's tiles dropped (UZ remains reachable via typed search through the seed trip_plan); new components/passenger/TripPreviewCard.tsx + new "trip-preview" SheetState bridge between quick-pick tap and PaymentChoiceSheet; PassengerMap fits the trip corridor when previewPlan is set with bottom padding reserved for the half-snap sheet; PaymentChoiceSheet primary CTA flipped to Apple-blue with matching shadow, cash secondary now dark-glass with Apple-blue ring; PlanList card surfaces converted from white to .svika-glass for typed-search readability on dark | <NEW_SHA> | local-rehearsal
```

## Stop conditions

- `lib/trip-planner.ts` `TripPlan` shape diverges from the brief's hardcoded presets in a way that can't be trivially aligned — surface and ask.
- `bookTripAction` in `lib/passenger/actions.ts` has additional required fields per leg (e.g. a synthesized leg id) — surface and ask.
- The map preview fitBounds collides with the journey-active fitBounds (double-fits, jitter) — describe the conflict and stop.
- Otherwise run all the way through to commit + push + BUILD-LOG.

End of brief.
