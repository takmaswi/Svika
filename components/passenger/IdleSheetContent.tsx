"use client";

import { useState } from "react";

import SearchBar from "./SearchBar";
import type { TripPlan } from "@/lib/trip-planner";

interface IdleSheetContentProps {
  personaName: string;
  nextHeightsMinutes: number;
  onSubmit: (text: string) => Promise<void>;
  onPickPreview: (plan: TripPlan) => void;
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
// Quick-pick presets — TripPlan shape mirrors lib/trip-planner's
// TripPlanLeg interface. Walks carry `transfer_id` only (no from/to
// stop ids on the leg itself); kombi legs carry `board_at_stop_id` and
// `alight_at_stop_id`. Durations and fares mirror the live seed
// trip_plans entry for Heights → Avondale so bookTripAction sees the
// same shape it does on the typed-search path.
//
// `plan.label` for Avondale matches the seed's "Lomagundi walking
// transfer (fastest)" exactly — that's the lookup key
// loadActiveJourney uses against seed/network.json after the booking
// commits. Mismatched labels would book a trip but render an empty
// journey on next refresh. Rezende has no seed entry at all
// (`(sp_heights_start_north, sp_rezende_rank)` is not in trip_plans),
// so a Rezende quick-pick books cleanly through bookTripAction but
// won't mount an active journey — Avondale is the canonical demo
// path; Rezende is a presentation-tier polish preset.
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
    label: "Lomagundi walking transfer (fastest)",
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
        duration_minutes: 20,
      },
      {
        type: "walk",
        transfer_id: "transfer_lomagundi_walk",
        duration_minutes: 6,
      },
      {
        type: "kombi",
        route_id: "route_westgate_copa_segment",
        board_at_stop_id: "sp_lomagundi_kinggeorge_pickup",
        alight_at_stop_id: "sp_avondale_shops",
        fare_usd: 0.5,
        duration_minutes: 5,
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
