"use client";

import { useState } from "react";

const AMOUNTS = [2, 5, 10, 20] as const;

interface TopUpSheetProps {
  open: boolean;
  walletBalance: number;
  fareUsd: number;
  busy: boolean;
  onTopUp: (amount: number) => Promise<void>;
  onClose: () => void;
}

/**
 * Mocked wallet top-up sheet. No real fintech is touched — see actions.ts →
 * topUpAction. The 2x2 grid hints at the new balance after each option.
 */
export default function TopUpSheet({
  open,
  walletBalance,
  fareUsd,
  busy,
  onTopUp,
  onClose,
}: TopUpSheetProps) {
  const [picked, setPicked] = useState<number | null>(null);
  if (!open) return null;

  async function handle(amount: number) {
    setPicked(amount);
    await onTopUp(amount);
    setPicked(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35"
      data-testid="top-up-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Top up your wallet"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="svika-glass-strong svika-animate-sheet-rise mx-3 mb-3 w-full max-w-md p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-svika-mute">
              Top up your wallet
            </p>
            <p
              className="mt-1 truncate text-svika-teal"
              style={{ fontSize: "16px", fontWeight: 600 }}
            >
              ${walletBalance.toFixed(2)} in wallet · need ${fareUsd.toFixed(2)} for this trip
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-svika-mute hover:text-svika-teal disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {AMOUNTS.map((amount) => {
            const newBalance = walletBalance + amount;
            const isPicked = picked === amount && busy;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => void handle(amount)}
                disabled={busy}
                className="rounded-2xl border border-svika-line bg-white/70 px-4 py-4 text-left transition-opacity disabled:opacity-60"
                data-testid={`topup-${amount}`}
              >
                <p
                  className="font-mono text-svika-teal"
                  style={{ fontSize: "22px", fontWeight: 600 }}
                >
                  ${amount}
                </p>
                <p className="mt-1 text-[11px] text-svika-mute">
                  {isPicked ? "Adding…" : `New balance $${newBalance.toFixed(2)}`}
                </p>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] text-svika-mute">
          Top-up via EcoCash · roadmap. This is mocked for the demo.
        </p>
      </div>
    </div>
  );
}
