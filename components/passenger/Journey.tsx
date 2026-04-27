"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  SIM_CHANNEL,
  SIM_EVENT,
  TICKET_REDEEMED_EVENT,
  type KombiTickPayload,
  type TicketRedeemedPayload,
} from "@/lib/sim/simRunner";
import {
  deriveJourneyStage,
  type VehicleSnapshot,
} from "@/lib/passenger/journey-stage";
import type {
  ActiveJourney,
  JourneyKombiLeg,
  JourneyStage,
} from "@/lib/passenger/journey-types";

interface JourneyProps {
  journey: ActiveJourney;
  /** Called when the passenger taps "Plan another" after arriving. */
  onPlanAnother: () => void;
  /**
   * Called whenever a redeem broadcast arrives or the local stage flips to
   * `arrived`, so the parent can refresh the journey snapshot from the server.
   */
  onLifecycleEvent: (event: "redeemed" | "arrived") => void;
  /**
   * Called whenever the active journey snapshot changes so the map can recolor
   * the active leg, dim other vehicles, and aim the ETA chip at the right stop.
   */
  onStageChange?: (stage: JourneyStage) => void;
}

const RUST = "#d9622a";

function activeKombiLeg(journey: ActiveJourney, stage: JourneyStage): JourneyKombiLeg | null {
  if (stage.active_kombi_leg_index === null) return null;
  const leg = journey.legs[stage.active_kombi_leg_index];
  return leg && leg.kind === "kombi" ? leg : null;
}

function stageIcon(stage: JourneyStage): string {
  switch (stage.kind) {
    case "walk-to-board":
    case "walking-transfer":
      return "→";
    case "boarding":
    case "boarding-leg-2":
      return "✓";
    case "in-transit":
      return "•";
    case "arrived":
      return "★";
    default:
      return "•";
  }
}

function formatEta(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds <= 0) return "now";
  if (seconds < 60) return seconds + "s";
  const mins = Math.round(seconds / 60);
  return mins + " min";
}

export default function Journey({
  journey,
  onPlanAnother,
  onLifecycleEvent,
  onStageChange,
}: JourneyProps) {
  const [expanded, setExpanded] = useState(false);
  const [vehicles, setVehicles] = useState<Map<string, VehicleSnapshot>>(
    () => new Map(),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const lastBroadcastRef = useRef<{ id: string; at: number } | null>(null);

  // Subscribe once. Every kombi tick triggers a recompute via state update.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(SIM_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on("broadcast", { event: SIM_EVENT }, (msg) => {
      const ticks = (msg.payload as { ticks?: KombiTickPayload[] } | undefined)?.ticks;
      if (!Array.isArray(ticks)) return;
      setVehicles((prev) => {
        const next = new Map(prev);
        for (const t of ticks) {
          next.set(t.vehicle_id, {
            vehicle_id: t.vehicle_id,
            route_id: t.route_id,
            lat: t.lat,
            lng: t.lng,
          });
        }
        return next;
      });
      setNow(Date.now());
    });

    channel.on("broadcast", { event: TICKET_REDEEMED_EVENT }, (msg) => {
      const payload = msg.payload as TicketRedeemedPayload | undefined;
      if (!payload) return;
      const ours = journey.legs.some(
        (l) => l.kind === "kombi" && l.ticket_id === payload.ticket_id,
      );
      if (!ours) return;
      const sig = payload.ticket_id + "@" + payload.redeemed_at;
      if (lastBroadcastRef.current?.id === sig) return;
      lastBroadcastRef.current = { id: sig, at: Date.now() };
      // Force a re-render so the boarding flash window starts now even if a
      // tick is not coming for another second.
      setNow(Date.now());
      onLifecycleEvent("redeemed");
    });

    channel.subscribe();

    // Heartbeat so the boarding-flash window expires on its own when no
    // broadcast is currently arriving (e.g., the sim runner is paused).
    const heartbeat = setInterval(() => setNow(Date.now()), 750);

    return () => {
      clearInterval(heartbeat);
      void supabase.removeChannel(channel);
    };
  }, [journey, onLifecycleEvent]);

  const stage = useMemo(() => {
    const list = Array.from(vehicles.values());
    return deriveJourneyStage({ journey, vehiclesById: vehicles, vehicles: list, nowMs: now });
  }, [journey, vehicles, now]);

  const arrived = stage.kind === "arrived";
  const currentLeg = activeKombiLeg(journey, stage);

  // Notify parent when stage changes (and on arrival, so the parent can
  // refresh the journey snapshot from the server).
  const arrivedFiredRef = useRef(false);
  useEffect(() => {
    onStageChange?.(stage);
    if (arrived && !arrivedFiredRef.current) {
      arrivedFiredRef.current = true;
      onLifecycleEvent("arrived");
    }
  }, [stage, arrived, onLifecycleEvent, onStageChange]);

  const eta = currentLeg ? formatEta(stage.eta_seconds) : null;

  const totalSpent = journey.total_fare_usd.toFixed(2);

  // ---- Arrived collapsed summary ----
  if (arrived) {
    return (
      <div
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-svika-teal-100 bg-svika-stone"
        data-testid="journey-arrived"
        data-stage="arrived"
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <p className="text-base font-semibold text-svika-teal">
              You&apos;ve arrived
            </p>
            <p className="truncate text-xs text-svika-mute">
              {journey.total_duration_minutes} min · ${totalSpent}
            </p>
          </div>
          <button
            type="button"
            onClick={onPlanAnother}
            className="shrink-0 rounded-md border border-svika-rust px-3 py-1.5 text-xs font-medium text-svika-rust hover:bg-svika-rust hover:text-white"
          >
            Plan another
          </button>
        </div>
      </div>
    );
  }

  // ---- Active journey ----
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-svika-teal-100 bg-svika-stone"
      data-testid="journey-sheet"
      data-stage={stage.kind}
      data-stage-index={stage.index}
    >
      <div className="mx-auto max-w-md px-4 pb-3 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full flex-col gap-0.5 text-left"
          aria-expanded={expanded}
        >
          <span className="truncate text-xs font-medium text-svika-mute">
            {journey.origin.name} <span aria-hidden>→</span> {journey.destination.name}
          </span>
        </button>

        <div className="mt-2 flex items-start gap-3">
          <span
            className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md text-base font-bold text-white transition-transform duration-300 ${
              stage.flashing ? "scale-110" : "scale-100"
            }`}
            style={{ background: RUST }}
            aria-hidden
          >
            {stageIcon(stage)}
          </span>
          <div className="min-w-0 flex-1">
            <FadingText className="text-sm font-semibold text-svika-teal" text={stage.title} />
            <FadingText className="mt-0.5 text-xs text-svika-mute" text={stage.detail} />
          </div>
          {eta ? (
            <span className="shrink-0 rounded-full border border-svika-teal-100 bg-white px-2 py-0.5 text-[11px] font-medium text-svika-teal">
              ETA {eta}
            </span>
          ) : null}
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-svika-teal-50">
          <div
            className="h-full rounded-full"
            style={{
              width: Math.round(stage.progress * 100) + "%",
              background: RUST,
              transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>

        {currentLeg ? (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-mono text-base text-svika-rust">
              {currentLeg.access_code}
            </span>
            <span className="text-svika-mute">
              ${currentLeg.fare_usd.toFixed(2)} this kombi · ${totalSpent} trip total
            </span>
          </div>
        ) : null}

        {expanded ? (
          <div className="mt-3 border-t border-svika-teal-100 pt-3">
            <ol className="space-y-2 text-xs">
              {journey.legs.map((leg, idx) => {
                const active = stage.active_kombi_leg_index === idx;
                if (leg.kind === "kombi") {
                  return (
                    <li
                      key={"k-" + idx}
                      className={`flex items-baseline gap-2 ${
                        active ? "text-svika-teal" : "text-svika-mute"
                      }`}
                    >
                      <span className="font-mono text-svika-rust">
                        {leg.access_code}
                      </span>
                      <span className="flex-1">
                        {leg.board_stop.name} → {leg.alight_stop.name}
                      </span>
                      <span>${leg.fare_usd.toFixed(2)}</span>
                    </li>
                  );
                }
                return (
                  <li
                    key={"w-" + idx}
                    className="flex items-baseline gap-2 text-svika-mute"
                  >
                    <span className="font-mono">·</span>
                    <span className="flex-1">
                      Walk {leg.from_stop.name} → {leg.to_stop.name}
                    </span>
                    <span>{leg.duration_minutes} min</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface FadingTextProps {
  text: string;
  className?: string;
}

/**
 * Cross-fade between text values without ever leaving the viewport empty:
 * when the new value differs, fade the old one out while the new one fades
 * in. Both span elements live in the same flex slot so layout doesn't jump.
 */
function FadingText({ text, className }: FadingTextProps) {
  return (
    <span
      key={text}
      className={className}
      style={{
        display: "block",
        animation: "svika-journey-fade 200ms ease both",
      }}
    >
      {text}
    </span>
  );
}
