"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  assignVehicleAction,
  cashWalkonAction,
  redeemParcelAction,
  redeemTicketAction,
} from "@/lib/conductor/actions";
import type { ConductorState } from "@/lib/conductor/state";
import type { Persona } from "@/lib/personas";

import PinKeypad from "./PinKeypad";
import RouteHeaderMap from "./RouteHeaderMap";

type Feedback = {
  kind: "ok" | "err" | "info";
  text: string;
  meta?: string;
  payment_method?: "wallet" | "cash";
  fare_usd?: number;
};

type Mode = "passenger" | "parcel";

interface ConductorShellProps {
  persona: Persona;
  personaSlug: string;
  state: ConductorState;
  mapboxToken: string;
}

function prettyTime(iso: string | null): string {
  // Server renders in UTC and the client may render in a different locale,
  // which trips React hydration (error #418). Slice HH:MM straight off the
  // ISO string so the same characters land on both sides.
  if (!iso) return "";
  return iso.slice(11, 16);
}

export default function ConductorShell({
  persona,
  personaSlug,
  state,
  mapboxToken,
}: ConductorShellProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("passenger");

  const activeVehicle = useMemo(
    () => state.vehicles.find((v) => v.id === state.active_vehicle_id) ?? null,
    [state.vehicles, state.active_vehicle_id],
  );

  function handleAssign(vehicleId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await assignVehicleAction({
        persona_slug: personaSlug,
        vehicle_id: vehicleId,
      });
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.error });
        return;
      }
      setFeedback({ kind: "ok", text: `Assigned to ${vehicleId}.` });
      router.refresh();
    });
  }

  function handleSubmitCode() {
    if (!activeVehicle) {
      setFeedback({ kind: "err", text: "Pick a kombi before clearing fares." });
      return;
    }
    if (code.length !== 3) {
      setFeedback({ kind: "err", text: "Code must be three digits." });
      return;
    }
    setFeedback(null);
    if (mode === "parcel") {
      startTransition(async () => {
        const result = await redeemParcelAction({
          persona_slug: personaSlug,
          vehicle_id: activeVehicle.id,
          access_code: code,
        });
        if (!result.ok) {
          setFeedback({ kind: "err", text: result.error });
          return;
        }
        setFeedback({
          kind: "ok",
          text: `Parcel ${result.access_code} accepted · $${result.fare_usd.toFixed(2)}`,
          meta: `For ${result.receiver_phone} · ${result.description}`,
        });
        setCode("");
        setMode("passenger");
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      const result = await redeemTicketAction({
        persona_slug: personaSlug,
        vehicle_id: activeVehicle.id,
        access_code: code,
      });
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.error });
        return;
      }
      setFeedback({
        kind: "ok",
        text: `Cleared ${result.access_code} · $${result.fare_usd.toFixed(2)}`,
        meta: `Now ${result.passenger_count}/${activeVehicle.capacity_seats} on board.`,
        payment_method: result.payment_method,
        fare_usd: result.fare_usd,
      });
      setCode("");
      router.refresh();
    });
  }

  function handleCash() {
    if (!activeVehicle) {
      setFeedback({ kind: "err", text: "Pick a kombi first." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await cashWalkonAction({
        persona_slug: personaSlug,
        vehicle_id: activeVehicle.id,
      });
      if (!result.ok) {
        setFeedback({ kind: "err", text: result.error });
        return;
      }
      setFeedback({
        kind: "ok",
        text: `Cash walk-on +$${result.fare_usd.toFixed(2)}`,
        meta: `Now ${result.passenger_count}/${activeVehicle.capacity_seats} on board.`,
      });
      router.refresh();
    });
  }

  function handleParcel() {
    if (!activeVehicle) {
      setFeedback({ kind: "err", text: "Pick a kombi first." });
      return;
    }
    if (mode === "parcel") {
      setMode("passenger");
      setCode("");
      setFeedback(null);
      return;
    }
    setMode("parcel");
    setCode("");
    setFeedback({
      kind: "info",
      text: "Parcel mode — type the 3-digit code from the sender.",
    });
  }

  return (
    <main
      className="min-h-dvh"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      <header
        className="px-4 py-3 text-white"
        style={{ backgroundColor: "var(--color-action)" }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="svika-headline">Hwindi · {persona.name}</h1>
          <span className="svika-meta opacity-80" style={{ textTransform: "none" }}>
            {activeVehicle
              ? `${activeVehicle.id} · ${activeVehicle.current_passenger_count}/${activeVehicle.capacity_seats}`
              : "No kombi assigned"}
          </span>
        </div>
        {activeVehicle ? (
          <p className="svika-meta opacity-80" style={{ textTransform: "none" }}>{activeVehicle.route_name}</p>
        ) : (
          <p className="svika-meta opacity-80" style={{ textTransform: "none" }}>Pick your kombi to start clearing fares.</p>
        )}
      </header>

      {activeVehicle ? (
        <RouteHeaderMap
          routeGeometry={activeVehicle.route_geometry}
          position={activeVehicle.position}
          mapboxToken={mapboxToken}
        />
      ) : null}

      {!activeVehicle ? (
        <section className="px-4 pt-4">
          <h2
            className="text-sm font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            Pick your kombi
          </h2>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Choose the plate you are working on today. You can re-claim it tomorrow.
          </p>
          <ul className="mt-3 space-y-2" aria-label="Available kombis">
            {state.vehicles.length === 0 ? (
              <li
                className="rounded-md p-3 text-sm"
                style={{
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "var(--color-hairline)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-ink-mute)",
                }}
              >
                No kombis available. Run the seed loader first.
              </li>
            ) : (
              state.vehicles.map((v) => {
                const blocked = v.is_taken_by_other;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={blocked || pending}
                      onClick={() => handleAssign(v.id)}
                      className="flex w-full items-center justify-between rounded-md p-3 text-left transition-colors"
                      style={{
                        borderWidth: "1px",
                        borderStyle: "solid",
                        borderColor: "var(--color-hairline)",
                        backgroundColor: blocked
                          ? "var(--color-surface)"
                          : "var(--color-bg)",
                        color: blocked
                          ? "var(--color-ink-mute)"
                          : "var(--color-ink)",
                      }}
                      data-testid={`hwindi-vehicle-${v.id.replace(/\s+/g, "-")}`}
                    >
                      <span>
                        <span className="font-mono text-base">{v.id}</span>
                        <span
                          className="ml-3 text-xs"
                          style={{ color: "var(--color-ink-mute)" }}
                        >
                          {v.route_name}
                        </span>
                      </span>
                      <span className="text-xs">
                        {blocked
                          ? "Taken"
                          : `${v.current_passenger_count}/${v.capacity_seats}`}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      ) : (
        <>
          <section className="px-4 pt-4">
            {feedback ? (
              <div
                role="status"
                className="rounded-md p-3 text-sm"
                style={{
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor:
                    feedback.kind === "info"
                      ? "var(--color-hairline)"
                      : "var(--color-action)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-ink)",
                }}
                data-testid="hwindi-feedback"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{feedback.text}</p>
                  {feedback.payment_method === "cash" ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white"
                      style={{ backgroundColor: "var(--color-amber)" }}
                      data-testid="hwindi-cash-badge"
                    >
                      $ Cash
                    </span>
                  ) : feedback.payment_method === "wallet" ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white"
                      style={{ backgroundColor: "var(--color-action)" }}
                    >
                      Cleared
                    </span>
                  ) : null}
                </div>
                {feedback.meta ? <p className="text-xs opacity-80">{feedback.meta}</p> : null}
                {feedback.payment_method === "cash" && typeof feedback.fare_usd === "number" ? (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--color-ink-mute)" }}
                    data-testid="hwindi-cash-collect"
                  >
                    Collect ${feedback.fare_usd.toFixed(2)} from passenger
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            className="px-4 pt-4"
            data-testid="hwindi-pin-keypad"
            data-mode={mode}
          >
            <h2 className="svika-headline" style={{ color: "var(--color-ink)" }}>
              {mode === "parcel" ? "Parcel code" : "Code"}
            </h2>
            <p
              className="svika-meta mt-1"
              style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
            >
              {mode === "parcel"
                ? "Type the sender's 3-digit parcel code. Tap Enter to accept."
                : "Type the passenger's 3-digit code. Tap Enter when full."}
            </p>
            <div
              className="mt-3 rounded-lg p-3"
              style={{
                borderWidth: "1px",
                borderStyle: "solid",
                borderColor:
                  mode === "parcel"
                    ? "var(--color-action)"
                    : "var(--color-hairline)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              <PinKeypad value={code} onChange={setCode} onSubmit={handleSubmitCode} disabled={pending} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 p-4">
            <button
              type="button"
              onClick={handleCash}
              disabled={pending || mode === "parcel"}
              className="touch-target rounded-md px-4 py-6 text-lg font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-action)" }}
              data-testid="hwindi-cash"
            >
              + Cash $1
            </button>
            <button
              type="button"
              onClick={handleParcel}
              disabled={pending}
              className="touch-target rounded-md px-4 py-6 text-lg font-semibold text-white disabled:opacity-50"
              style={{
                backgroundColor:
                  mode === "parcel"
                    ? "var(--color-action)"
                    : "var(--color-action-hover)",
              }}
              data-testid="hwindi-parcel"
            >
              {mode === "parcel" ? "Cancel parcel" : "Parcel"}
            </button>
          </section>

          <section className="px-4 pb-6" data-testid="hwindi-activity">
            <h2 className="svika-headline" style={{ color: "var(--color-ink)" }}>
              Today&apos;s clears
            </h2>
            {state.recent_activity.length === 0 ? (
              <p
                className="svika-meta mt-2"
                style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
              >
                No fares cleared yet today on {activeVehicle.id}.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {state.recent_activity.map((a) => (
                  <li
                    key={a.ticket_id}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-xs"
                    style={{
                      borderWidth: "1px",
                      borderStyle: "solid",
                      borderColor: "var(--color-hairline)",
                      backgroundColor: "var(--color-bg)",
                    }}
                  >
                    <span
                      className="svika-mono-code"
                      style={{ fontSize: "13px", color: "var(--color-action)" }}
                    >
                      {a.access_code}
                    </span>
                    <span style={{ color: "var(--color-ink)" }}>
                      {a.board_at_stop_name} → {a.alight_at_stop_name}
                    </span>
                    <span style={{ color: "var(--color-ink-mute)" }}>
                      ${a.fare_usd.toFixed(2)}
                    </span>
                    <span style={{ color: "var(--color-ink-mute)" }}>
                      {prettyTime(a.redeemed_at ?? a.completed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
