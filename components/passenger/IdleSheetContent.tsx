"use client";

import { useState } from "react";

import SearchBar from "./SearchBar";

interface IdleSheetContentProps {
  personaName: string;
  nextHeightsMinutes: number;
  onSubmit: (text: string) => Promise<void>;
  busy: boolean;
}

interface QuickPick {
  testid: string;
  query: string;
  destination: string;
  via: string;
  duration_minutes: number;
  fare_usd: number;
  badge: string;
}

const FEATURED: QuickPick = {
  testid: "quick-pick-featured",
  query: "Heights to Avondale",
  destination: "Avondale Shops",
  via: "via Lomagundi walk",
  duration_minutes: 31,
  fare_usd: 1.5,
  badge: "FEATURED",
};

const SECONDARY: ReadonlyArray<QuickPick> = [
  {
    testid: "quick-pick-uz",
    query: "I want to go to UZ from Heights",
    destination: "UZ direct",
    via: "Direct mid-route drop",
    duration_minutes: 15,
    fare_usd: 1.0,
    badge: "Direct",
  },
  {
    testid: "quick-pick-samlevys",
    query: "Heights kuenda kuSam Levy's",
    destination: "Sam Levy's via rank",
    via: "via Rezende rank",
    duration_minutes: 73,
    fare_usd: 3.0,
    badge: "Via Rank",
  },
];

/**
 * Sheet content for the `idle` state. Replaces the previous EmptyHero bento
 * grid. Renders inline inside the JourneySheet — at peek the headline + input
 * are visible; at half the three quick picks slide into view below.
 */
export default function IdleSheetContent({
  personaName,
  nextHeightsMinutes,
  onSubmit,
  busy,
}: IdleSheetContentProps) {
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);
  const firstName = personaName.split(" ")[0];

  async function handlePreset(preset: QuickPick) {
    if (busy) return;
    setPickedPreset(preset.query);
    await onSubmit(preset.query);
  }

  return (
    <section
      className="pt-1"
      aria-label="Plan a trip"
      data-testid="idle-sheet-content"
    >
      <h2
        className="text-svika-teal"
        style={{
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "-0.4px",
          lineHeight: 1.15,
        }}
      >
        Where to, {firstName}?
      </h2>
      <p className="svika-meta mt-1 text-svika-mute" style={{ textTransform: "none" }}>
        Type in Shona or English · next Heights kombi {nextHeightsMinutes} min
      </p>

      <div className="mt-3">
        <SearchBar
          onSubmit={onSubmit}
          disabled={busy}
          size="hero"
          placeholder="Avondale, UZ, Sam Levy's…"
        />
      </div>

      <p className="svika-meta mt-4 px-1 uppercase text-svika-mute">
        Quick picks
      </p>

      <div className="mt-2 space-y-2">
        <button
          type="button"
          onClick={() => void handlePreset(FEATURED)}
          disabled={busy}
          className="svika-glass relative flex w-full items-center gap-3 px-3 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
          data-testid={FEATURED.testid}
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-svika-rust text-sm font-semibold text-white"
          >
            ★
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-svika-teal"
              style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.2 }}
            >
              {FEATURED.destination}
            </span>
            <span className="svika-meta mt-0.5 block text-svika-mute" style={{ textTransform: "none" }}>
              {FEATURED.via} · {FEATURED.duration_minutes} min
            </span>
          </span>
          <span className="svika-mono-code text-svika-teal">
            ${FEATURED.fare_usd.toFixed(2)}
          </span>
          {busy && pickedPreset === FEATURED.query ? (
            <span className="absolute right-3 bottom-1 text-[10px] text-svika-rust">
              …
            </span>
          ) : null}
        </button>

        {SECONDARY.map((preset) => (
          <button
            key={preset.testid}
            type="button"
            onClick={() => void handlePreset(preset)}
            disabled={busy}
            className="svika-glass relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
            data-testid={preset.testid}
          >
            <span className="min-w-0 flex-1">
              <span
                className="block text-svika-teal"
                style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.2 }}
              >
                {preset.destination}
              </span>
              <span className="svika-meta mt-0.5 block text-svika-mute" style={{ textTransform: "none" }}>
                {preset.via} · {preset.duration_minutes} min
              </span>
            </span>
            <span
              className="font-mono text-svika-teal"
              style={{ fontSize: "13px", fontWeight: 600 }}
            >
              ${preset.fare_usd.toFixed(2)}
            </span>
            {busy && pickedPreset === preset.query ? (
              <span className="absolute right-3 bottom-1 text-[10px] text-svika-rust">
                …
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
