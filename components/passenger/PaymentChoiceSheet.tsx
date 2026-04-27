"use client";

import type { TripPlan } from "@/lib/trip-planner";

interface PaymentChoiceSheetProps {
  open: boolean;
  option: TripPlan | null;
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

/**
 * Glass bottom sheet that asks the passenger how they want to pay for the
 * picked plan. Wallet uses pre-paid credit; cash defers payment to the kombi
 * and still mints a 3-digit code so the conductor flow is identical.
 */
export default function PaymentChoiceSheet({
  open,
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
  if (!open || !option) return null;
  const fare = option.total_fare_usd;
  const fareLabel = `$${fare.toFixed(2)}`;
  const balanceLabel = `$${walletBalance.toFixed(2)}`;
  const canPayWallet = walletBalance >= fare;
  const seats = seatsTaken !== null ? Math.min(capacity, Math.max(0, seatsTaken)) : capacity - 1;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/35"
      data-testid="payment-choice-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Choose how to pay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="svika-glass-strong svika-animate-sheet-rise mx-3 mb-3 w-full max-w-md p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-svika-mute">
              Choose how to pay
            </p>
            <p
              className="mt-1 truncate text-svika-teal"
              style={{ fontSize: "16px", fontWeight: 600 }}
            >
              {routeLabel}
            </p>
            <p className="mt-0.5 text-[12px] text-svika-mute">
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
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                {busyMethod === "wallet" ? "Charging wallet…" : `Pay ${fareLabel} from wallet`}
              </span>
              <span className="font-mono text-[13px] opacity-90">
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
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                Top up — you have {balanceLabel}
              </span>
              <span className="font-mono text-[13px] opacity-90">need {fareLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCash}
            disabled={busyMethod !== null}
            className="flex h-14 w-full items-center justify-between rounded-2xl border-2 border-svika-teal bg-white/60 px-4 text-svika-teal transition-opacity disabled:opacity-60"
            data-testid="payment-cash"
          >
            <span style={{ fontSize: "15px", fontWeight: 600 }}>
              {busyMethod === "cash"
                ? "Reserving seat…"
                : `Pay ${fareLabel} cash on board`}
            </span>
            <span className="font-mono text-[13px] text-svika-mute">
              {seats} of {capacity} seats today
            </span>
          </button>
        </div>

        <p className="mt-3 text-[10px] text-svika-mute">
          Cash boarding still uses a 3-digit code.
        </p>
      </div>
    </div>
  );
}
