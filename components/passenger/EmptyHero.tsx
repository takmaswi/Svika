"use client";

import * as React from "react";
import { useState } from "react";

import SearchBar from "./SearchBar";

/**
 * Phase 3.7 passenger empty state.
 *
 * - Glass hero with a "Where to, X?" headline + Plan input.
 * - Bento grid: one large featured tile (Avondale Shops via Lomagundi walk)
 *   plus two small tiles (UZ Direct, Sam Levy's via rank).
 *
 * Replaces the older 1-column SearchHero card. The featured tile is the
 * keystone of the demo because it carries the walking-transfer story.
 */

interface EmptyHeroProps {
  personaName: string;
  walletBalanceUsd: number;
  nextHeightsMinutes: number;
  onSubmit: (text: string) => Promise<void>;
  busy: boolean;
}

interface BentoPreset {
  query: string;
  destination: string;
  via: string;
  duration_minutes: number;
  fare_usd: number;
  badge: string;
}

const FEATURED: BentoPreset = {
  query: "Heights to Avondale",
  destination: "Avondale Shops",
  via: "via Lomagundi walk",
  duration_minutes: 31,
  fare_usd: 1.5,
  badge: "FEATURED",
};

const SMALL_PRESETS: ReadonlyArray<BentoPreset> = [
  {
    query: "I want to go to UZ from Heights",
    destination: "University of Zimbabwe",
    via: "Direct mid-route drop",
    duration_minutes: 15,
    fare_usd: 1.0,
    badge: "Direct",
  },
  {
    query: "Heights kuenda kuSam Levy's",
    destination: "Sam Levy's Village",
    via: "via Rezende rank",
    duration_minutes: 73,
    fare_usd: 3.0,
    badge: "Via Rank",
  },
];

function GradCapIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 9.5 12 5l10 4.5L12 14 2 9.5z" />
      <path d="M6 11.5V16c2 1.6 4 2.4 6 2.4s4-.8 6-2.4v-4.5" />
      <path d="M22 9.5v6" />
    </svg>
  );
}

function CompassIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2z" />
    </svg>
  );
}

function FeaturedRoutePreview(): React.ReactElement {
  // Boarding stop · transfer · destination — solid teal arc, dashed rust walk,
  // solid teal arc again. Gives the Lomagundi-walk story a glance-readable shape.
  return (
    <svg
      viewBox="0 0 220 36"
      preserveAspectRatio="none"
      className="mt-3 h-9 w-full"
      aria-hidden
    >
      <path
        d="M8 22 C 30 4, 60 4, 90 22"
        fill="none"
        stroke="var(--color-svika-teal)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M90 22 L 130 22"
        fill="none"
        stroke="var(--color-svika-rust)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="3 4"
      />
      <path
        d="M130 22 C 160 4, 190 4, 212 22"
        fill="none"
        stroke="var(--color-svika-teal)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="22" r="3.5" fill="var(--color-svika-teal)" />
      <circle cx="110" cy="22" r="3.5" fill="var(--color-svika-rust)" />
      <circle cx="212" cy="22" r="3.5" fill="var(--color-svika-teal)" />
    </svg>
  );
}

export default function EmptyHero({
  personaName,
  walletBalanceUsd,
  nextHeightsMinutes,
  onSubmit,
  busy,
}: EmptyHeroProps) {
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);
  void walletBalanceUsd; // surfaced through the header chip; reserved for future copy.

  async function handlePreset(preset: BentoPreset) {
    if (busy) return;
    setPickedPreset(preset.query);
    await onSubmit(preset.query);
  }

  const firstName = personaName.split(" ")[0];

  return (
    <section
      className="px-4 pb-3 pt-3"
      aria-label="Plan a trip"
      data-testid="passenger-empty-hero"
    >
      <div className="svika-glass svika-animate-glass-rise p-4">
        <h2
          className="text-svika-teal"
          style={{
            fontSize: "26px",
            fontWeight: 600,
            letterSpacing: "-0.4px",
            lineHeight: 1.15,
          }}
        >
          Where to, {firstName}?
        </h2>
        <p className="mt-1 text-[11px] text-svika-mute">
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
      </div>

      <p className="mt-4 px-1 text-[10px] font-medium uppercase tracking-[0.5px] text-svika-mute">
        Quick picks
      </p>
      <div
        className="mt-2 grid gap-2"
        style={{
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "auto auto",
        }}
      >
        {/* Featured tile — spans both rows of the right side. */}
        <button
          type="button"
          onClick={() => void handlePreset(FEATURED)}
          disabled={busy}
          className="svika-glass relative flex flex-col px-3 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ gridRow: "1 / span 2" }}
          data-testid={`bento-featured`}
        >
          <span
            className="absolute right-0 top-0 rounded-bl-2xl rounded-tr-[22px] bg-svika-salmon px-2 py-1 text-[10px] font-medium uppercase tracking-[0.5px] text-white"
          >
            {FEATURED.badge}
          </span>
          <span
            className="mt-1 block max-w-[85%] text-svika-teal"
            style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.2 }}
          >
            {FEATURED.destination}
          </span>
          <span className="mt-1 block text-[10px] text-svika-mute">
            {FEATURED.via}
          </span>
          <FeaturedRoutePreview />
          <span className="mt-auto flex items-baseline justify-between pt-3">
            <span className="text-[12px] text-svika-mute">
              {FEATURED.duration_minutes} min
            </span>
            <span
              className="font-mono text-svika-teal"
              style={{ fontSize: "16px", fontWeight: 600 }}
            >
              ${FEATURED.fare_usd.toFixed(2)}
            </span>
          </span>
          {busy && pickedPreset === FEATURED.query ? (
            <span className="absolute bottom-2 left-3 text-[10px] text-svika-rust">…</span>
          ) : null}
        </button>

        {SMALL_PRESETS.map((preset, idx) => (
          <button
            key={preset.query}
            type="button"
            onClick={() => void handlePreset(preset)}
            disabled={busy}
            className="svika-glass relative flex flex-col px-3 py-3 text-left transition-transform active:scale-[0.99] disabled:opacity-60"
            data-testid={`bento-small-${idx}`}
          >
            <span className="flex items-center justify-between">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-svika-teal"
              >
                {idx === 0 ? (
                  <GradCapIcon className="h-4 w-4" />
                ) : (
                  <CompassIcon className="h-4 w-4" />
                )}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-svika-salmon">
                {preset.badge}
              </span>
            </span>
            <span
              className="mt-2 block text-svika-teal"
              style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.2 }}
            >
              {preset.destination}
            </span>
            <span className="mt-auto flex items-baseline justify-between pt-3">
              <span className="text-[11px] text-svika-mute">
                {preset.duration_minutes} min
              </span>
              <span
                className="font-mono text-svika-teal"
                style={{ fontSize: "13px", fontWeight: 600 }}
              >
                ${preset.fare_usd.toFixed(2)}
              </span>
            </span>
            {busy && pickedPreset === preset.query ? (
              <span className="absolute bottom-2 left-3 text-[10px] text-svika-rust">
                …
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
