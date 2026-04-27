"use client";

import { useMemo, useState } from "react";

import type { WalletTicket } from "@/lib/passenger/wallet";

const RECIPIENTS = [
  { slug: "rudo", label: "Rudo" },
  { slug: "tendai", label: "Tendai" },
] as const;

interface WalletProps {
  open: boolean;
  onClose: () => void;
  tickets: WalletTicket[];
  personaSlug: string;
  onTransfer: (ticketId: string, recipientSlug: string) => Promise<{ ok: boolean; share_url?: string; recipient_name?: string; error?: string }>;
}

function statusLabel(t: WalletTicket): string {
  if (t.is_outgoing_transfer) {
    return t.status === "transferred_pending" ? "Sent — waiting to be claimed" : "Sent";
  }
  switch (t.status) {
    case "issued":
      return "Ready to ride";
    case "held":
      return "Ready to ride";
    case "transferred_pending":
      return "Waiting to be claimed";
    case "redeemed":
      return "On board";
    default:
      return t.status;
  }
}

export default function Wallet({ open, onClose, tickets, personaSlug, onTransfer }: WalletProps) {
  const recipients = useMemo(
    () => RECIPIENTS.filter((r) => r.slug !== personaSlug),
    [personaSlug],
  );

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string; share_url?: string } | null>(null);

  if (!open) return null;

  async function handleTransfer(ticketId: string, recipientSlug: string) {
    setBusy(true);
    setFeedback(null);
    const result = await onTransfer(ticketId, recipientSlug);
    setBusy(false);
    if (result.ok && result.share_url) {
      setFeedback({
        kind: "ok",
        text: `Sent to ${result.recipient_name}. Share the claim link below.`,
        share_url: result.share_url,
      });
      setActiveTicketId(null);
    } else {
      setFeedback({ kind: "err", text: result.error ?? "Transfer failed." });
    }
  }

  async function shareViaSystem(url: string) {
    if (typeof window === "undefined") return;
    const absolute = `${window.location.origin}${url}`;
    const navWithShare = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof navWithShare.share === "function") {
      try {
        await navWithShare.share({ title: "Svika ticket", text: "Claim your kombi ticket", url: absolute });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    try {
      await window.navigator.clipboard.writeText(absolute);
      setFeedback({ kind: "ok", text: "Claim link copied. Paste into WhatsApp.", share_url: url });
    } catch {
      setFeedback({ kind: "err", text: `Copy this link: ${absolute}`, share_url: url });
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30">
      <button
        type="button"
        aria-label="Close wallet"
        className="flex-1"
        onClick={() => {
          setActiveTicketId(null);
          setFeedback(null);
          onClose();
        }}
      />
      <aside className="flex h-full w-full max-w-sm flex-col overflow-y-auto bg-svika-stone shadow-lg">
        <header className="flex items-center justify-between border-b border-svika-teal-100 bg-white px-4 py-3">
          <h2 className="text-base font-semibold text-svika-teal">Wallet</h2>
          <button
            type="button"
            onClick={() => {
              setActiveTicketId(null);
              setFeedback(null);
              onClose();
            }}
            aria-label="Close wallet"
            className="text-svika-mute hover:text-svika-teal"
          >
            ×
          </button>
        </header>

        {feedback ? (
          <div
            className={`mx-3 mt-3 rounded-md px-3 py-2 text-xs ${
              feedback.kind === "ok"
                ? "border border-svika-teal-100 bg-white text-svika-teal"
                : "border border-svika-rust bg-white text-svika-rust"
            }`}
          >
            <p>{feedback.text}</p>
            {feedback.share_url ? (
              <button
                type="button"
                onClick={() => feedback.share_url && shareViaSystem(feedback.share_url)}
                className="mt-1 text-xs underline"
              >
                Share again
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 space-y-2 px-3 py-3">
          {tickets.length === 0 ? (
            <p className="px-1 text-sm text-svika-mute">
              No active tickets. Plan a trip to buy your first ride.
            </p>
          ) : (
            tickets.map((t) => {
              const expanded = activeTicketId === t.id;
              const dimmed = t.is_outgoing_transfer;
              return (
                <article
                  key={t.id}
                  className={`rounded-md border bg-white p-3 shadow-sm transition-opacity ${
                    dimmed ? "border-svika-stone-dark opacity-70" : "border-svika-teal-100"
                  }`}
                >
                  <header className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-svika-teal">
                      {t.board_at_stop_name} → {t.alight_at_stop_name}
                    </h3>
                    <span className="font-mono text-2xl text-svika-rust">{t.access_code}</span>
                  </header>
                  <p className="mt-0.5 text-xs text-svika-mute">{t.route_name}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-svika-mute">${t.fare_usd.toFixed(2)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        dimmed
                          ? "bg-svika-stone-dark text-svika-mute"
                          : "bg-svika-teal-50 text-svika-teal"
                      }`}
                    >
                      {statusLabel(t)}
                    </span>
                  </div>

                  {!dimmed && (t.status === "issued" || t.status === "held") ? (
                    <div className="mt-3">
                      {expanded ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-svika-mute">Send to:</p>
                          {recipients.map((r) => (
                            <button
                              key={r.slug}
                              type="button"
                              disabled={busy}
                              onClick={() => handleTransfer(t.id, r.slug)}
                              className="w-full rounded-md border border-svika-teal-100 bg-svika-stone px-2.5 py-1.5 text-left text-xs text-svika-teal hover:bg-svika-stone-dark disabled:opacity-50"
                            >
                              Transfer to {r.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setActiveTicketId(null)}
                            className="w-full text-center text-xs text-svika-mute hover:text-svika-teal"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTicketId(t.id);
                            setFeedback(null);
                          }}
                          className="w-full rounded-md border border-svika-rust px-3 py-1.5 text-xs font-medium text-svika-rust hover:bg-svika-rust hover:text-white"
                        >
                          Share / transfer
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
