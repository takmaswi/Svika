"use client";

import { useState } from "react";

const AMOUNTS = [2, 5, 10, 20] as const;

/**
 * Pure content component — must be rendered inside the JourneySheet's
 * content slot. Mocked wallet top-up: see actions.ts → topUpAction.
 */
interface TopUpSheetProps {
  walletBalance: number;
  fareUsd: number;
  busy: boolean;
  onTopUp: (amount: number) => Promise<void>;
  onClose: () => void;
}

export default function TopUpSheet({
  walletBalance,
  fareUsd,
  busy,
  onTopUp,
  onClose,
}: TopUpSheetProps) {
  const [picked, setPicked] = useState<number | null>(null);

  async function handle(amount: number) {
    setPicked(amount);
    await onTopUp(amount);
    setPicked(null);
  }

  return (
    <div className="pt-1" data-testid="top-up-sheet">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-svika-mute">
            Top up your wallet
          </p>
          <p
            className="mt-1 truncate text-svika-teal"
            style={{ fontSize: "16px", fontWeight: 600 }}
          >
            ${walletBalance.toFixed(2)} in wallet · need ${fareUsd.toFixed(2)} for
            this trip
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
  );
}
