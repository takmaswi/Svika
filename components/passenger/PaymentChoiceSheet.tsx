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
          <p
            className="svika-meta uppercase"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Choose how to pay
          </p>
          <p
            className="svika-headline mt-1 truncate"
            style={{ color: "var(--color-ink)" }}
          >
            {routeLabel}
          </p>
          <p
            className="svika-meta mt-0.5"
            style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
          >
            {option.total_duration_minutes} min · {fareLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            color: "var(--color-ink-mute)",
          }}
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
            className="flex h-14 w-full items-center justify-between rounded-2xl px-4 text-white transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-action)",
              boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
            }}
            data-testid="payment-wallet"
          >
            <span className="svika-body font-semibold">
              {busyMethod === "wallet"
                ? "Charging wallet…"
                : `Pay ${fareLabel} from wallet`}
            </span>
            <span
              className="svika-mono-code opacity-90"
              style={{ fontSize: "13px" }}
            >
              you have {balanceLabel}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onTopUp}
            disabled={busyMethod !== null}
            className="flex h-14 w-full items-center justify-between rounded-2xl px-4 text-white transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-action)",
              boxShadow: "0 8px 24px rgba(0, 122, 255, 0.32)",
            }}
            data-testid="payment-topup"
          >
            <span className="svika-body font-semibold">
              Top up — you have {balanceLabel}
            </span>
            <span
              className="svika-mono-code opacity-90"
              style={{ fontSize: "13px" }}
            >
              need {fareLabel}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onCash}
          disabled={busyMethod !== null}
          className="svika-glass flex h-14 w-full items-center justify-between rounded-2xl px-4 transition-opacity disabled:opacity-60"
          style={{
            borderColor: "var(--color-action)",
            color: "var(--color-ink)",
          }}
          data-testid="payment-cash"
        >
          <span className="svika-body font-semibold">
            {busyMethod === "cash"
              ? "Reserving seat…"
              : `Pay ${fareLabel} cash on board`}
          </span>
          <span
            className="svika-mono-code"
            style={{ fontSize: "13px", color: "var(--color-ink-mute)" }}
          >
            {seats} of {capacity} seats today
          </span>
        </button>
      </div>

      <p
        className="svika-meta mt-3"
        style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
      >
        Cash boarding still uses a 3-digit code.
      </p>
    </div>
  );
}
