"use client";

import { useState } from "react";

import { bookParcelAction } from "@/lib/passenger/actions";

/**
 * Pure content component — must be rendered inside the JourneySheet's
 * content slot. Same-kombi parcel booking; see Phase 4 stretch.
 */
interface ParcelSheetProps {
  personaSlug: string;
  walletBalance: number;
  onClose: () => void;
  onBooked: (result: {
    access_code: string;
    fare_usd: number;
    alight_label: string;
  }) => void;
}

const DESTINATIONS: Array<{ id: string; label: string; fare_usd: number }> = [
  { id: "sp_uz_gate", label: "University of Zimbabwe", fare_usd: 1.0 },
  { id: "sp_second_lomagundi", label: "Second / Lomagundi", fare_usd: 1.0 },
  { id: "sp_rezende_rank", label: "Rezende Rank (CBD)", fare_usd: 1.5 },
];

const DEFAULT_DEST = DESTINATIONS[0];

export default function ParcelSheet({
  personaSlug,
  walletBalance,
  onClose,
  onBooked,
}: ParcelSheetProps) {
  const [alightId, setAlightId] = useState<string>(DEFAULT_DEST.id);
  const [phone, setPhone] = useState("+263772000002");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "cash">(
    "wallet",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dest = DESTINATIONS.find((d) => d.id === alightId) ?? DEFAULT_DEST;
  const cannotPayWallet =
    paymentMethod === "wallet" && walletBalance < dest.fare_usd;

  async function handleSend() {
    setError(null);
    setBusy(true);
    const result = await bookParcelAction({
      persona_slug: personaSlug,
      alight_at_stop_id: alightId,
      receiver_phone: phone,
      description,
      payment_method: paymentMethod,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onBooked({
      access_code: result.access_code,
      fare_usd: result.fare_usd,
      alight_label: dest.label,
    });
    setDescription("");
  }

  return (
    <div className="pt-1" data-testid="parcel-sheet">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-svika-teal">Send a parcel</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-svika-mute hover:text-svika-teal"
        >
          ×
        </button>
      </header>
      <p className="mt-1 text-xs text-svika-mute">
        Same kombi, same code. Hand it to the hwindi at Bannockburn Rd.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block text-xs">
          <span className="text-svika-mute">Drop at</span>
          <select
            value={alightId}
            onChange={(e) => setAlightId(e.target.value)}
            className="mt-1 w-full rounded-md border border-svika-line bg-white px-2 py-2 text-sm text-svika-teal"
            data-testid="parcel-alight"
          >
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · ${d.fare_usd.toFixed(2)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="text-svika-mute">Receiver phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+263772000002"
            className="mt-1 w-full rounded-md border border-svika-line bg-white px-2 py-2 text-sm text-svika-teal"
            data-testid="parcel-phone"
          />
        </label>

        <label className="block text-xs">
          <span className="text-svika-mute">What is in the parcel?</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="School books for Rudo"
            className="mt-1 w-full rounded-md border border-svika-line bg-white px-2 py-2 text-sm text-svika-teal"
            data-testid="parcel-desc"
            maxLength={120}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("wallet")}
            disabled={busy}
            className={`rounded-md border px-3 py-2 text-xs ${
              paymentMethod === "wallet"
                ? "border-svika-teal bg-svika-teal text-white"
                : "border-svika-line bg-white text-svika-teal"
            }`}
            data-testid="parcel-pay-wallet"
          >
            Wallet · ${walletBalance.toFixed(2)}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            disabled={busy}
            className={`rounded-md border px-3 py-2 text-xs ${
              paymentMethod === "cash"
                ? "border-svika-rust bg-svika-rust text-white"
                : "border-svika-line bg-white text-svika-rust"
            }`}
            data-testid="parcel-pay-cash"
          >
            Cash on board
          </button>
        </div>

        {cannotPayWallet ? (
          <p className="rounded-md bg-white/80 px-2 py-1.5 text-xs text-svika-rust">
            Wallet balance is below ${dest.fare_usd.toFixed(2)}. Switch to cash or
            top up.
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md bg-white/80 px-2 py-1.5 text-xs text-svika-rust"
            data-testid="parcel-error"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSend}
          disabled={busy || cannotPayWallet}
          className="w-full rounded-md bg-svika-rust px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="parcel-submit"
        >
          {busy ? "Sending…" : `Send parcel · $${dest.fare_usd.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
