"use client";

import type { TripPlan } from "@/lib/trip-planner";

interface PlanListProps {
  options: TripPlan[];
  busyOption: string | null;
  onChoose: (option: TripPlan) => Promise<void>;
  onClose: () => void;
}

export default function PlanList({ options, busyOption, onChoose, onClose }: PlanListProps) {
  if (options.length === 0) {
    return (
      <div className="rounded-md bg-white p-3 text-sm text-svika-mute shadow-sm">
        No plans yet for that route. Try Heights to Avondale, Heights to UZ, or Heights to Sam Levy&apos;s.
        <button type="button" onClick={onClose} className="ml-2 text-svika-teal underline">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-svika-mute">
          {options.length === 1 ? "1 way to get there" : `${options.length} ways to get there`}
        </h3>
        <button type="button" onClick={onClose} className="text-xs text-svika-mute hover:text-svika-teal">
          Clear
        </button>
      </div>
      {options.map((option) => {
        const busy = busyOption === option.label;
        return (
          <article
            key={option.label}
            className="rounded-md border border-svika-teal-100 bg-white p-3 text-sm shadow-sm"
          >
            <header className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="font-medium text-svika-teal">{option.label}</h4>
              <span className="font-mono text-svika-ink">${option.total_fare_usd.toFixed(2)}</span>
            </header>
            <p className="mb-2 text-xs text-svika-mute">
              {option.total_duration_minutes} min total
              {option.total_walking_minutes > 0
                ? ` · ${option.total_walking_minutes} min walking`
                : " · no walking"}
            </p>
            <ol className="mb-3 space-y-1 text-xs text-svika-ink">
              {option.legs.map((leg, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span
                    className={`inline-block w-14 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase ${
                      leg.type === "kombi"
                        ? "bg-svika-teal text-svika-stone"
                        : "bg-svika-stone-dark text-svika-teal"
                    }`}
                  >
                    {leg.type === "kombi" ? "kombi" : "walk"}
                  </span>
                  <span className="flex-1">
                    {leg.type === "kombi"
                      ? `${leg.duration_minutes} min · $${(leg.fare_usd ?? 0).toFixed(2)}`
                      : `${leg.duration_minutes} min walk`}
                  </span>
                </li>
              ))}
            </ol>
            {option.notes ? (
              <p className="mb-3 rounded bg-svika-stone px-2 py-1 text-[11px] text-svika-mute">
                {option.notes}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onChoose(option)}
              disabled={busy || busyOption !== null}
              className="w-full rounded-md bg-svika-rust px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-50"
            >
              {busy ? "Buying..." : `Buy for $${option.total_fare_usd.toFixed(2)}`}
            </button>
          </article>
        );
      })}
    </div>
  );
}
