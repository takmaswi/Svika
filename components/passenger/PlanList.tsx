"use client";

import type { TripPlan } from "@/lib/trip-planner";

/**
 * Pure content component — must be rendered inside the JourneySheet's
 * content slot. The sheet provides the surface; this component owns the
 * cards and CTAs only.
 */
interface PlanListProps {
  options: TripPlan[];
  busyOption: string | null;
  onChoose: (option: TripPlan) => void;
  onClose: () => void;
}

export default function PlanList({
  options,
  busyOption,
  onChoose,
  onClose,
}: PlanListProps) {
  if (options.length === 0) {
    return (
      <div
        className="svika-glass p-3 text-sm"
        style={{ color: "var(--color-ink-mute)", borderRadius: 14 }}
      >
        No plans yet for that route. Try Heights to Avondale, Heights to UZ, or
        Heights to Sam Levy&apos;s.
        <button
          type="button"
          onClick={onClose}
          className="ml-2 underline"
          style={{ color: "var(--color-action)" }}
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--color-ink-mute)" }}
        >
          {options.length === 1
            ? "1 way to get there"
            : `${options.length} ways to get there`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs"
          style={{ color: "var(--color-ink-mute)" }}
        >
          Clear
        </button>
      </div>
      {options.map((option) => {
        const busy = busyOption === option.label;
        return (
          <article
            key={option.label}
            className="svika-glass p-3 text-sm"
            style={{
              borderColor: "var(--color-hairline)",
              borderRadius: 14,
            }}
          >
            <header className="mb-2 flex items-baseline justify-between gap-2">
              <h4
                className="font-medium"
                style={{ color: "var(--color-ink)" }}
              >
                {option.label}
              </h4>
              <span
                className="font-mono"
                style={{ color: "var(--color-ink)" }}
              >
                ${option.total_fare_usd.toFixed(2)}
              </span>
            </header>
            <p
              className="mb-2 text-xs"
              style={{ color: "var(--color-ink-mute)" }}
            >
              {option.total_duration_minutes} min total
              {option.total_walking_minutes > 0
                ? ` · ${option.total_walking_minutes} min walking`
                : " · no walking"}
            </p>
            <ol
              className="mb-3 space-y-1 text-xs"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {option.legs.map((leg, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span
                    className="inline-block w-14 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase"
                    style={{
                      backgroundColor:
                        leg.type === "kombi"
                          ? "rgba(0, 122, 255, 0.16)"
                          : "rgba(255, 255, 255, 0.08)",
                      color:
                        leg.type === "kombi"
                          ? "var(--color-action)"
                          : "var(--color-ink-soft)",
                    }}
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
              <p
                className="mb-3 rounded px-2 py-1 text-[11px]"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  color: "var(--color-ink-mute)",
                }}
              >
                {option.notes}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onChoose(option)}
              disabled={busy || busyOption !== null}
              className="w-full rounded-2xl px-3 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-action)",
                boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
              }}
            >
              {busy
                ? "Buying..."
                : `Buy for $${option.total_fare_usd.toFixed(2)}`}
            </button>
          </article>
        );
      })}
    </div>
  );
}
