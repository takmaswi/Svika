"use client";

import { useMemo, useState } from "react";

import type { WalletTicket } from "@/lib/passenger/wallet";

const RECIPIENTS = [
  { slug: "rudo", label: "Rudo" },
  { slug: "takunda", label: "Takunda" },
] as const;

/**
 * Pure content component — must be rendered inside the JourneySheet's
 * content slot at the full snap. Drops its own right-edge drawer wrapper.
 */
interface WalletProps {
  tickets: WalletTicket[];
  personaSlug: string;
  onClose: () => void;
  onTransfer: (
    ticketId: string,
    recipientSlug: string,
  ) => Promise<{
    ok: boolean;
    share_url?: string;
    recipient_name?: string;
    error?: string;
  }>;
}

function statusLabel(t: WalletTicket): string {
  if (t.is_outgoing_transfer) {
    return t.status === "transferred_pending"
      ? "Sent — waiting to be claimed"
      : "Sent";
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

export default function Wallet({
  tickets,
  personaSlug,
  onClose,
  onTransfer,
}: WalletProps) {
  const recipients = useMemo(
    () => RECIPIENTS.filter((r) => r.slug !== personaSlug),
    [personaSlug],
  );

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
    share_url?: string;
  } | null>(null);

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
    const navWithShare = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof navWithShare.share === "function") {
      try {
        await navWithShare.share({
          title: "Svika ticket",
          text: "Claim your kombi ticket",
          url: absolute,
        });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    try {
      await window.navigator.clipboard.writeText(absolute);
      setFeedback({
        kind: "ok",
        text: "Claim link copied. Paste into WhatsApp.",
        share_url: url,
      });
    } catch {
      setFeedback({
        kind: "err",
        text: `Copy this link: ${absolute}`,
        share_url: url,
      });
    }
  }

  return (
    <div className="pt-1" data-testid="wallet-content">
      <header className="flex items-center justify-between pb-2">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          Wallet
        </h2>
        <button
          type="button"
          onClick={() => {
            setActiveTicketId(null);
            setFeedback(null);
            onClose();
          }}
          aria-label="Close wallet"
          style={{ color: "var(--color-ink-mute)" }}
        >
          ×
        </button>
      </header>

      {feedback ? (
        <div
          className="mt-1 rounded-md px-3 py-2 text-xs"
          style={{
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "var(--color-hairline)",
            backgroundColor: "var(--color-surface)",
            color:
              feedback.kind === "ok"
                ? "var(--color-ink)"
                : "var(--color-action)",
          }}
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

      <div className="mt-2 space-y-2">
        {tickets.length === 0 ? (
          <p
            className="px-1 text-sm"
            style={{ color: "var(--color-ink-mute)" }}
          >
            No active tickets. Plan a trip to buy your first ride.
          </p>
        ) : (
          tickets.map((t) => {
            const expanded = activeTicketId === t.id;
            const dimmed = t.is_outgoing_transfer;
            return (
              <article
                key={t.id}
                className="svika-glass p-3 text-sm transition-opacity"
                style={{
                  opacity: dimmed ? 0.7 : 1,
                  borderRadius: 14,
                }}
              >
                <header className="flex items-baseline justify-between gap-2">
                  <h3
                    className="text-sm font-medium"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {t.board_at_stop_name} → {t.alight_at_stop_name}
                  </h3>
                  <span
                    className="font-mono text-2xl"
                    style={{ color: "var(--color-action)" }}
                  >
                    {t.access_code}
                  </span>
                </header>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--color-ink-mute)" }}
                >
                  {t.route_name}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span style={{ color: "var(--color-ink-mute)" }}>
                    ${t.fare_usd.toFixed(2)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: dimmed
                        ? "var(--color-hairline)"
                        : "var(--color-action-soft)",
                      color: dimmed
                        ? "var(--color-ink-mute)"
                        : "var(--color-action)",
                    }}
                  >
                    {statusLabel(t)}
                  </span>
                </div>

                {!dimmed && (t.status === "issued" || t.status === "held") ? (
                  <div className="mt-3">
                    {expanded ? (
                      <div className="space-y-1.5">
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-ink-mute)" }}
                        >
                          Send to:
                        </p>
                        {recipients.map((r) => (
                          <button
                            key={r.slug}
                            type="button"
                            disabled={busy}
                            onClick={() => handleTransfer(t.id, r.slug)}
                            className="w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50"
                            style={{
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderColor: "var(--color-hairline)",
                              backgroundColor: "var(--color-surface)",
                              color: "var(--color-ink)",
                            }}
                          >
                            Transfer to {r.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setActiveTicketId(null)}
                          className="w-full text-center text-xs"
                          style={{ color: "var(--color-ink-mute)" }}
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
                        className="w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          borderWidth: "1px",
                          borderStyle: "solid",
                          borderColor: "var(--color-action)",
                          color: "var(--color-action)",
                          backgroundColor: "transparent",
                        }}
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
    </div>
  );
}
