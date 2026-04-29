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
    <div className="pt-1 pb-2" data-testid="trip-preview-card">
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
        className="svika-glass mt-3 flex flex-wrap items-center gap-2 px-3 py-2"
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
