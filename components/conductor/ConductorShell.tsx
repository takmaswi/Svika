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
    <main className="min-h-dvh bg-svika-stone-dark">
      <header className="bg-svika-teal px-4 py-3 text-svika-stone">
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
          <h2 className="text-sm font-medium text-svika-teal">Pick your kombi</h2>
          <p className="mt-1 text-xs text-svika-mute">
            Choose the plate you are working on today. You can re-claim it tomorrow.
          </p>
          <ul className="mt-3 space-y-2" aria-label="Available kombis">
            {state.vehicles.length === 0 ? (
              <li className="rounded-md border border-svika-teal-100 bg-white p-3 text-sm text-svika-mute">
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
                      className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${
                        blocked
                          ? "border-svika-stone-dark bg-svika-stone text-svika-mute"
                          : "border-svika-teal-100 bg-white text-svika-teal hover:bg-svika-stone"
                      }`}
                      data-testid={`hwindi-vehicle-${v.id.replace(/\s+/g, "-")}`}
                    >
                      <span>
                        <span className="font-mono text-base">{v.id}</span>
                        <span className="ml-3 text-xs text-svika-mute">{v.route_name}</span>
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
                className={`rounded-md border p-3 text-sm ${
                  feedback.kind === "ok"
                    ? "border-svika-rust bg-white text-svika-rust"
                    : feedback.kind === "info"
                      ? "border-svika-teal-100 bg-white text-svika-teal"
                      : "border-svika-rust bg-white text-svika-rust"
                }`}
                data-testid="hwindi-feedback"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{feedback.text}</p>
                  {feedback.payment_method === "cash" ? (
                    <span
                      className="rounded-full bg-svika-salmon px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white"
                      data-testid="hwindi-cash-badge"
                    >
                      $ Cash
                    </span>
                  ) : feedback.payment_method === "wallet" ? (
                    <span className="rounded-full bg-svika-teal px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white">
                      Cleared
                    </span>
                  ) : null}
                </div>
                {feedback.meta ? <p className="text-xs opacity-80">{feedback.meta}</p> : null}
                {feedback.payment_method === "cash" && typeof feedback.fare_usd === "number" ? (
                  <p
                    className="mt-1 text-xs text-svika-mute"
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
            <h2 className="svika-headline text-svika-teal">
              {mode === "parcel" ? "Parcel code" : "Code"}
            </h2>
            <p className="svika-meta mt-1 text-svika-mute" style={{ textTransform: "none" }}>
              {mode === "parcel"
                ? "Type the sender's 3-digit parcel code. Tap Enter to accept."
                : "Type the passenger's 3-digit code. Tap Enter when full."}
            </p>
            <div
              className={`mt-3 rounded-lg border p-3 ${
                mode === "parcel"
                  ? "border-svika-rust bg-white"
                  : "border-svika-teal-100 bg-svika-stone"
              }`}
            >
              <PinKeypad value={code} onChange={setCode} onSubmit={handleSubmitCode} disabled={pending} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 p-4">
            <button
              type="button"
              onClick={handleCash}
              disabled={pending || mode === "parcel"}
              className="touch-target rounded-md bg-svika-rust px-4 py-6 text-lg font-semibold text-white disabled:opacity-50"
              data-testid="hwindi-cash"
            >
              + Cash $1
            </button>
            <button
              type="button"
              onClick={handleParcel}
              disabled={pending}
              className={`touch-target rounded-md px-4 py-6 text-lg font-semibold text-white disabled:opacity-50 ${
                mode === "parcel" ? "bg-svika-rust" : "bg-svika-teal-600"
              }`}
              data-testid="hwindi-parcel"
            >
              {mode === "parcel" ? "Cancel parcel" : "Parcel"}
            </button>
          </section>

          <section className="px-4 pb-6" data-testid="hwindi-activity">
            <h2 className="svika-headline text-svika-teal">Today&apos;s clears</h2>
            {state.recent_activity.length === 0 ? (
              <p className="svika-meta mt-2 text-svika-mute" style={{ textTransform: "none" }}>
                No fares cleared yet today on {activeVehicle.id}.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {state.recent_activity.map((a) => (
                  <li
                    key={a.ticket_id}
                    className="flex items-center justify-between rounded-md border border-svika-teal-100 bg-white px-3 py-2 text-xs"
                  >
                    <span className="svika-mono-code text-svika-rust" style={{ fontSize: "13px" }}>{a.access_code}</span>
                    <span className="text-svika-teal">
                      {a.board_at_stop_name} → {a.alight_at_stop_name}
                    </span>
                    <span className="text-svika-mute">${a.fare_usd.toFixed(2)}</span>
                    <span className="text-svika-mute">
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
