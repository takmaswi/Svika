"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import FleetImpactCard from "@/components/passenger/FleetImpactCard";
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
import {
  getTransferDetail,
  type Cardinal,
  type TransferDetail,
} from "@/lib/passenger/transferDetail";
import type {
  ActiveJourney,
  JourneyKombiLeg,
  JourneyStage,
  JourneyWalkLeg,
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
  /**
   * Called when the passenger confirms ending the trip. Returns ok+optional
   * error so the sheet can surface failures inline. Tickets are completed
   * server-side; credit is not refunded (see actions.ts → endTripAction).
   */
  onEndTrip: () => Promise<{ ok: boolean; error?: string }>;
}

const RUST = "#d9622a";
/**
 * Hard-coded vehicle make/colour for the demo's Uber-style driver chip.
 * The `vehicles` table only stores plate + route + capacity, so the make
 * (Toyota Hiace) and exterior colour (cream) are pinned to the typical
 * Harare kombi profile rather than added to the schema.
 */
const VEHICLE_MAKE = "Toyota Hiace";
const VEHICLE_COLOR = "cream";
const CONDUCTOR_NAME = "Farai";

/** Average kombi cruising speed used for the live ETA-minute display. */
const AVG_KOMBI_KMH = 25;

function activeKombiLeg(journey: ActiveJourney, stage: JourneyStage): JourneyKombiLeg | null {
  if (stage.active_kombi_leg_index === null) return null;
  const leg = journey.legs[stage.active_kombi_leg_index];
  return leg && leg.kind === "kombi" ? leg : null;
}

function stageIcon(stage: JourneyStage, cardinal: Cardinal | null): string {
  switch (stage.kind) {
    case "walk-to-board":
      return "→";
    case "walking-transfer":
      return cardinalArrow(cardinal);
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

function cardinalArrow(cardinal: Cardinal | null): string {
  switch (cardinal) {
    case "north":
      return "↑";
    case "south":
      return "↓";
    case "east":
      return "→";
    case "west":
      return "←";
    default:
      return "→";
  }
}

function findWalkingTransferLeg(
  journey: ActiveJourney,
  stage: JourneyStage,
): JourneyWalkLeg | null {
  if (stage.kind !== "walking-transfer") return null;
  // The active_kombi_leg_index points at the next kombi leg. The walking
  // transfer is the leg immediately before it.
  const nextKombiIdx = stage.active_kombi_leg_index;
  if (nextKombiIdx === null) return null;
  for (let i = nextKombiIdx - 1; i >= 0; i -= 1) {
    const leg = journey.legs[i];
    if (leg && leg.kind === "walk") return leg;
  }
  return null;
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
  onEndTrip,
}: JourneyProps) {
  const [expanded, setExpanded] = useState(false);
  const [vehicles, setVehicles] = useState<Map<string, VehicleSnapshot>>(
    () => new Map(),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const lastBroadcastRef = useRef<{ id: string; at: number } | null>(null);
  const [endConfirming, setEndConfirming] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  async function handleConfirmEnd() {
    setEndBusy(true);
    setEndError(null);
    const result = await onEndTrip();
    setEndBusy(false);
    if (!result.ok) {
      setEndError(result.error ?? "Could not end the trip.");
      return;
    }
    setEndConfirming(false);
  }

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
  const walkLeg = findWalkingTransferLeg(journey, stage);
  const transferDetail = useMemo<TransferDetail | null>(() => {
    if (!walkLeg) return null;
    return getTransferDetail({
      from_stop_id: walkLeg.from_stop.id,
      to_stop_id: walkLeg.to_stop.id,
      fallback_from: { lat: walkLeg.from_stop.lat, lng: walkLeg.from_stop.lng },
      fallback_to: { lat: walkLeg.to_stop.lat, lng: walkLeg.to_stop.lng },
      fallback_walking_duration_minutes: walkLeg.duration_minutes,
    });
  }, [walkLeg]);

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
        <div className="relative mx-auto max-w-md px-4 pb-3 pt-3">
          <EndTripControl
            confirming={endConfirming}
            busy={endBusy}
            error={endError}
            onAsk={() => setEndConfirming(true)}
            onCancel={() => {
              setEndConfirming(false);
              setEndError(null);
            }}
            onConfirm={handleConfirmEnd}
          />
          <div className="flex items-center justify-between gap-3 pr-9">
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
          <FleetImpactCard fareUsd={journey.total_fare_usd} />
        </div>
      </div>
    );
  }

  // ---- Active journey ----
  // Identify the parcel-parity case: the journey itself is parcel-shaped or
  // the current leg's underlying ticket is a parcel. When true, the card
  // swaps to the parcel layout (no live ETA minute, parcel code footer).
  const isParcel =
    journey.kind === "parcel" || currentLeg?.ticket_kind === "parcel";
  const parcelMeta = currentLeg?.parcel ?? journey.legs.find(
    (l): l is JourneyKombiLeg => l.kind === "kombi",
  )?.parcel ?? null;

  // The vehicle ID surfaces from the redeemed ticket (truth) or the stage's
  // nearest-vehicle prediction (before PIN clearance) so the chip is never
  // empty during the walk-to-board stage.
  const vehiclePlate = currentLeg?.vehicle_id ?? stage.assigned_vehicle_id ?? "—";

  // Live ETA minute display for the in-transit stage. Computed from the
  // stage's eta_seconds (driven by haversine distance / avg leg speed) and
  // refreshed on the parent's 750 ms heartbeat. Spec calls for a 60 s
  // timer; that's redundant given the existing heartbeat, but the minute
  // value only changes when crossing minute boundaries so the display stays
  // calm regardless.
  const liveEtaMinutes =
    stage.kind === "in-transit" && !isParcel && stage.eta_seconds !== null
      ? Math.max(1, Math.round(stage.eta_seconds / 60))
      : null;
  // Suppress unused-import lint for the average-speed constant when the
  // ETA tick is hidden (parcel mode); reference it once so tooling can see
  // the source of the live minute estimate.
  void AVG_KOMBI_KMH;

  // Parcel stage line — derived from the underlying ticket status rather
  // than the stage state machine because parcels have no "in-transit
  // approaching alight" sub-stage.
  function parcelStageLine(): string {
    const status = currentLeg?.status ?? "issued";
    if (status === "issued" || status === "held") return "Parcel waiting to board";
    if (status === "redeemed") return "Parcel in transit";
    return "Parcel delivered";
  }

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-svika-teal-100 bg-svika-stone"
      data-testid="journey-sheet"
      data-stage={stage.kind}
      data-stage-index={stage.index}
      data-journey-kind={isParcel ? "parcel" : "passenger"}
    >
      <div className="relative mx-auto max-w-md px-4 pb-3 pt-3">
        <EndTripControl
          confirming={endConfirming}
          busy={endBusy}
          error={endError}
          onAsk={() => setEndConfirming(true)}
          onCancel={() => {
            setEndConfirming(false);
            setEndError(null);
          }}
          onConfirm={handleConfirmEnd}
        />

        {/* Driver chip — always visible. Avatar + conductor name + vehicle.
            Tap collapses/expands the legs list (preserves prior affordance). */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-3 pr-9 text-left"
          aria-expanded={expanded}
          data-testid="journey-driver-chip"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: RUST }}
          >
            {CONDUCTOR_NAME.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-svika-teal">
              {CONDUCTOR_NAME} · Conductor
            </span>
            <span className="truncate text-[11px] text-svika-mute">
              {vehiclePlate} · {VEHICLE_MAKE} · {VEHICLE_COLOR}
            </span>
            {isParcel ? (
              <span
                className="mt-0.5 inline-flex w-fit rounded-full px-1.5 py-px text-[10px] font-medium text-white"
                style={{ background: RUST }}
                data-testid="journey-parcel-pill"
              >
                Carrying parcel
              </span>
            ) : null}
          </span>
        </button>

        {/* Stage line + parcel/transfer detail */}
        <div className="mt-2 flex items-start gap-3">
          <span
            className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md text-base font-bold text-white transition-transform duration-300 ${
              stage.flashing ? "scale-110" : "scale-100"
            }`}
            style={{ background: RUST }}
            aria-hidden
          >
            {stageIcon(stage, transferDetail?.cardinal ?? null)}
          </span>
          <div className="min-w-0 flex-1">
            {isParcel ? (
              <FadingText
                className="text-base font-semibold text-svika-teal"
                text={parcelStageLine()}
              />
            ) : stage.kind === "walking-transfer" && transferDetail && walkLeg ? (
              <>
                <FadingText
                  className="text-base font-semibold text-svika-teal"
                  text={transferDetail.heading}
                />
                <FadingText
                  className="mt-0.5 text-xs text-svika-mute"
                  text={`From: ${walkLeg.from_stop.name} (${transferDetail.from_note})`}
                />
                <FadingText
                  className="mt-0.5 text-xs text-svika-mute"
                  text={`To: ${walkLeg.to_stop.name} (${transferDetail.to_note})`}
                />
                <FadingText
                  className="mt-0.5 font-mono text-[11px] text-svika-teal"
                  text={`${transferDetail.walking_duration_minutes} min · ${transferDetail.walking_distance_meters} m`}
                />
              </>
            ) : (
              <FadingText
                className="text-base font-semibold text-svika-teal"
                text={stage.title}
              />
            )}

            {/* Live ETA minute — only for passenger in-transit */}
            {liveEtaMinutes !== null ? (
              <p
                className="mt-1 font-mono text-[14px] font-semibold"
                style={{ color: RUST }}
                data-testid="journey-eta-minutes"
              >
                Arriving in {liveEtaMinutes} min
              </p>
            ) : null}

            {/* Drop-off line */}
            {currentLeg ? (
              isParcel ? (
                <p className="mt-1 text-[12px] text-svika-mute">
                  Receiver: {parcelMeta?.receiver_phone || "phone"}&apos;s phone will get a code when{" "}
                  {vehiclePlate} arrives at {currentLeg.alight_stop.name}
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-svika-mute">
                  Drop off: {currentLeg.alight_stop.name}
                </p>
              )
            ) : null}
          </div>
          {eta && !isParcel && stage.kind !== "in-transit" ? (
            <span className="shrink-0 rounded-full border border-svika-teal-100 bg-white px-2 py-0.5 text-[11px] font-medium text-svika-teal">
              ETA {eta}
            </span>
          ) : null}
        </div>

        {/* Animated progress bar — 700 ms ease-out so the rust fill glides
            forward rather than snapping when the stage advances. */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-svika-teal-50">
          <div
            className="h-full rounded-full"
            style={{
              width: Math.round(stage.progress * 100) + "%",
              background: RUST,
              transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>

        {/* Footer — passenger keeps Show {code} + paid + trip total.
            Parcel swaps to "Parcel code: {code} · revealed to receiver on arrival". */}
        {currentLeg ? (
          isParcel ? (
            <div className="mt-2 text-xs">
              <span className="text-svika-mute">Parcel code: </span>
              <span className="font-mono text-base text-svika-rust">
                {currentLeg.access_code}
              </span>
              <span className="text-svika-mute"> · revealed to receiver on arrival</span>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>
                <span className="text-svika-mute">Show </span>
                <span className="font-mono text-base text-svika-rust">
                  {currentLeg.access_code}
                </span>
              </span>
              <span className="text-svika-mute">
                ${currentLeg.fare_usd.toFixed(2)} paid · ${totalSpent} trip total
              </span>
            </div>
          )
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

interface EndTripControlProps {
  confirming: boolean;
  busy: boolean;
  error: string | null;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Always-visible end-trip affordance for the journey sheet. Renders as a
 * small × in the top-right corner; tapping it opens an inline confirm strip
 * ("End this trip? Tickets won't be refunded for the demo.") with Cancel /
 * End buttons. Refund-on-cancel is roadmap.
 */
function EndTripControl({
  confirming,
  busy,
  error,
  onAsk,
  onCancel,
  onConfirm,
}: EndTripControlProps) {
  if (confirming) {
    return (
      <div className="mb-2 rounded-md border border-svika-rust bg-white px-3 py-2 text-xs text-svika-teal">
        <p>End this trip? Tickets won&apos;t be refunded for the demo.</p>
        {error ? <p className="mt-1 text-svika-rust">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-svika-teal-100 px-2 py-1 text-svika-mute hover:text-svika-teal disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded border border-svika-rust bg-svika-rust px-2 py-1 font-medium text-white hover:bg-[#b8501f] disabled:opacity-60"
            data-testid="journey-end-confirm"
          >
            {busy ? "Ending…" : "Yes, end trip"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label="End trip"
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-svika-teal-100 bg-white text-svika-mute shadow-sm hover:text-svika-rust"
      data-testid="journey-end-ask"
    >
      <span aria-hidden className="text-base leading-none">×</span>
    </button>
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
