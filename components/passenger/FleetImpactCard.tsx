"use client";

import { useState } from "react";

import {
  fetchFleetImpactTodayAction,
  type FleetImpactStats,
} from "@/lib/passenger/fleet-impact";

interface FleetImpactCardProps {
  fareUsd: number;
}

interface LoadedState {
  stats: FleetImpactStats | null;
  error: string | null;
  loading: boolean;
}

/**
 * Trip-complete fleet impact moment. Renders inside the "You've arrived"
 * collapse sheet to show Takunda where his $1.50 went, without forcing him
 * to leave the passenger surface for /fleet.
 */
export default function FleetImpactCard({ fareUsd }: FleetImpactCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<LoadedState>({
    stats: null,
    error: null,
    loading: false,
  });

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (state.stats || state.loading) return;
    setState({ stats: null, error: null, loading: true });
    const result = await fetchFleetImpactTodayAction();
    if (result.ok) {
      setState({ stats: result, error: null, loading: false });
    } else {
      setState({ stats: null, error: result.error, loading: false });
    }
  }

  return (
    <div className="mt-2" data-testid="fleet-impact">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-svika-teal-100 bg-white px-3 py-2 text-left text-xs text-svika-teal hover:bg-svika-stone-dark"
      >
        <span>
          Your ${fareUsd.toFixed(2)} just landed in Baba Tino&apos;s ledger
        </span>
        <span
          aria-hidden
          className="text-svika-rust"
          style={{
            fontSize: "14px",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
          }}
        >
          ›
        </span>
      </button>
      {expanded ? (
        <div className="mt-2 rounded-md border border-svika-teal-100 bg-svika-stone px-3 py-2 text-xs text-svika-teal">
          {state.loading ? (
            <p className="text-svika-mute">Loading…</p>
          ) : state.error ? (
            <p className="text-svika-rust">{state.error}</p>
          ) : state.stats ? (
            <>
              <p>
                <span className="font-mono text-base text-svika-rust">
                  ${state.stats.total_today_usd.toFixed(2)}
                </span>{" "}
                today · {state.stats.digital_count} digital fares ·{" "}
                {state.stats.cash_count} cash boardings
              </p>
              <a
                href="/fleet?as=baba_tino"
                target="_blank"
                rel="noopener"
                className="mt-1 inline-block text-[11px] text-svika-rust underline"
              >
                See full fleet dashboard →
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
