"use client";

import * as React from "react";
import { useState } from "react";

import SearchBar from "./SearchBar";

/**
 * Pre-trip hero — shown when no journey is active and no plans are loaded.
 * Big "Where to, Tendai?" headline + a single search input + three preset
 * destination cards. Tapping a preset bypasses the search and loads its plan
 * directly via the same `findPlansAction` path that handles typed queries.
 */

interface SearchHeroProps {
  personaName: string;
  onSubmit: (text: string) => Promise<void>;
  busy: boolean;
}

interface Preset {
  query: string;
  destination: string;
  via: string;
  duration_minutes: number;
  fare_usd: number;
  Icon: (props: { className?: string }) => React.ReactElement;
}

function ShopBagIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8L5 8z" />
      <path d="M9 8V6a3 3 0 1 1 6 0v2" />
    </svg>
  );
}

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

function StorefrontIcon({ className }: { className?: string }): React.ReactElement {
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
      <path d="M3 9.5 4.5 5h15L21 9.5" />
      <path d="M4 9.5h16V20H4z" />
      <path d="M9 20v-5h6v5" />
      <path d="M3 9.5a3 3 0 0 0 6 0" />
      <path d="M9 9.5a3 3 0 0 0 6 0" />
      <path d="M15 9.5a3 3 0 0 0 6 0" />
    </svg>
  );
}

const PRESETS: Preset[] = [
  {
    query: "Heights to Avondale",
    destination: "Avondale Shops",
    via: "via Lomagundi walk",
    duration_minutes: 31,
    fare_usd: 1.5,
    Icon: ShopBagIcon,
  },
  {
    query: "I want to go to UZ from Heights",
    destination: "University of Zimbabwe",
    via: "Direct, mid-route drop",
    duration_minutes: 15,
    fare_usd: 1.0,
    Icon: GradCapIcon,
  },
  {
    query: "Heights kuenda kuSam Levy's",
    destination: "Sam Levy's Village",
    via: "via Rezende rank",
    duration_minutes: 73,
    fare_usd: 3.0,
    Icon: StorefrontIcon,
  },
];

export default function SearchHero({ personaName, onSubmit, busy }: SearchHeroProps) {
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);

  async function handlePreset(p: Preset) {
    if (busy) return;
    setPickedPreset(p.query);
    await onSubmit(p.query);
  }

  return (
    <section className="px-4 pb-3 pt-4" aria-label="Plan a trip">
      <div className="rounded-2xl border border-svika-teal-100 bg-white p-4 shadow-sm">
        <h2 className="text-[22px] font-semibold leading-snug text-svika-teal">
          Where to, {personaName}?
        </h2>
        <p className="mt-1 text-[11px] text-svika-mute">Type in Shona or English.</p>

        <div className="mt-3">
          <SearchBar
            onSubmit={onSubmit}
            disabled={busy}
            size="hero"
            placeholder="Avondale, UZ, Sam Levy's…"
          />
        </div>

        <p className="mt-4 text-[10px] font-medium uppercase tracking-wide text-svika-mute">
          Quick picks
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {PRESETS.map((p) => {
            const loading = busy && pickedPreset === p.query;
            return (
              <button
                key={p.query}
                type="button"
                onClick={() => void handlePreset(p)}
                disabled={busy}
                className="flex items-center gap-3 rounded-xl border border-svika-stone-dark bg-svika-stone px-3 py-3 text-left transition-colors hover:border-svika-rust disabled:opacity-60"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-svika-teal"
                  aria-hidden
                >
                  <p.Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-svika-teal">
                    {p.destination}
                  </span>
                  <span className="block truncate text-[11px] text-svika-mute">
                    {p.via} · {p.duration_minutes} min · ${p.fare_usd.toFixed(2)}
                  </span>
                </span>
                <span className="text-svika-rust" aria-hidden>
                  {loading ? "…" : "→"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
