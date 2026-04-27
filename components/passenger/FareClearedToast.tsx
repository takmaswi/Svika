"use client";

export interface FareClearedToastState {
  conductor_name: string;
  vehicle_id: string;
  seat: number;
  capacity: number;
  shown_at: number;
}

interface FareClearedToastProps {
  state: FareClearedToastState | null;
  onDismiss: () => void;
}

/**
 * Glass top-toast that fires on the passenger surface when a conductor clears
 * Takunda's access code. Listens to the same `ticket-redeemed` broadcast that
 * the Journey sheet uses, but lives at the surface level so it appears even
 * when the journey sheet is hidden (e.g., the rider hasn't yet boarded the
 * second leg, or the demo is on the empty hero).
 *
 * Auto-dismisses after 4 seconds; the parent owns the timer.
 */
export default function FareClearedToast({ state, onDismiss }: FareClearedToastProps) {
  if (!state) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-3 z-40 flex justify-center px-4"
      role="status"
      aria-live="polite"
      data-testid="fare-cleared-toast"
    >
      <div
        className="svika-glass-strong svika-animate-sheet-rise flex w-full max-w-md items-center gap-3 px-4 py-3 shadow-md"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-svika-rust text-white"
          style={{ fontSize: "14px", fontWeight: 700 }}
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-svika-teal"
            style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.2 }}
          >
            Fare cleared by {state.conductor_name}
          </p>
          <p className="mt-0.5 text-[11px] text-svika-mute">
            {state.vehicle_id} · seat {state.seat} of {state.capacity}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-svika-mute hover:text-svika-teal"
          style={{ fontSize: "16px" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
