"use client";

import type { TripPlan } from "@/lib/trip-planner";

/**
 * Pure content component — must be rendered inside the JourneySheet's
 * content slot. Drops its own modal wrapper and `open` gate (the parent
 * router decides when to show it).
 */
interface PaymentChoiceSheetProps {
  option: TripPlan;
  routeLabel: string;
  walletBalance: number;
  /** Live seat snapshot for the assigned vehicle. Falls back to capacity if unknown. */
  seatsTaken: number | null;
  capacity: number;
  busyMethod: "wallet" | "cash" | null;
  onWallet: () => void;
  onCash: () => void;
  onTopUp: () => void;
  onClose: () => void;
}

export default function PaymentChoiceSheet({
  option,
  routeLabel,
  walletBalance,
  seatsTaken,
  capacity,
  busyMethod,
  onWallet,
  onCash,
  onTopUp,
  onClose,
}: PaymentChoiceSheetProps) {
  const fare = option.total_fare_usd;
  const fareLabel = `$${fare.toFixed(2)}`;
  const balanceLabel = `$${walletBalance.toFixed(2)}`;
  const canPayWallet = walletBalance >= fare;
  const seats =
    seatsTaken !== null
      ? Math.min(capacity, Math.max(0, seatsTaken))
      : capacity - 1;

  return (
    <div className="pt-1">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="svika-meta uppercase text-svika-mute">
            Choose how to pay
          </p>
          <p className="svika-headline mt-1 truncate text-svika-teal">
            {routeLabel}
          </p>
          <p className="svika-meta mt-0.5 text-svika-mute" style={{ textTransform: "none" }}>
            {option.total_duration_minutes} min · {fareLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-svika-mute hover:text-svika-teal"
        >
          ×
        </button>
      </div>

      <div className="space-y-2">
        {canPayWallet ? (
          <button
            type="button"
            onClick={onWallet}
            disabled={busyMethod !== null}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-svika-rust px-4 text-white shadow-[0_4px_16px_rgba(217,98,42,0.25)] transition-opacity disabled:opacity-60"
            data-testid="payment-wallet"
          >
            <span className="svika-body font-semibold">
              {busyMethod === "wallet"
                ? "Charging wallet…"
                : `Pay ${fareLabel} from wallet`}
            </span>
            <span className="svika-mono-code opacity-90" style={{ fontSize: "13px" }}>
              you have {balanceLabel}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onTopUp}
            disabled={busyMethod !== null}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-svika-rust px-4 text-white shadow-[0_4px_16px_rgba(217,98,42,0.25)] transition-opacity disabled:opacity-60"
            data-testid="payment-topup"
          >
            <span className="svika-body font-semibold">
              Top up — you have {balanceLabel}
            </span>
            <span className="svika-mono-code opacity-90" style={{ fontSize: "13px" }}>
              need {fareLabel}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onCash}
          disabled={busyMethod !== null}
          className="flex h-14 w-full items-center justify-between rounded-2xl border-2 border-svika-teal bg-white/60 px-4 text-svika-teal transition-opacity disabled:opacity-60"
          data-testid="payment-cash"
        >
          <span className="svika-body font-semibold">
            {busyMethod === "cash"
              ? "Reserving seat…"
              : `Pay ${fareLabel} cash on board`}
          </span>
          <span className="svika-mono-code text-svika-mute" style={{ fontSize: "13px" }}>
            {seats} of {capacity} seats today
          </span>
        </button>
      </div>

      <p className="svika-meta mt-3 text-svika-mute" style={{ textTransform: "none" }}>
        Cash boarding still uses a 3-digit code.
      </p>
    </div>
  );
}
