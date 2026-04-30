"use client";

import { useState } from "react";

import type { Persona } from "@/lib/personas";

interface PersonaDrawerProps {
  open: boolean;
  onClose: () => void;
  persona: Persona;
  personaSlug: string;
  walletBalance: number;
  activeTicketCount: number;
  onOpenWallet: () => void;
  onOpenTopUp: () => void;
  onOpenParcel: () => void;
}

interface TileButtonProps {
  label: string;
  detail?: string;
  testid?: string;
  onClick: () => void;
  external?: boolean;
}

function TileButton({
  label,
  detail,
  testid,
  onClick,
  external,
}: TileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="svika-glass flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span
          className="svika-body block font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {label}
        </span>
        {detail ? (
          <span
            className="svika-meta mt-0.5 block"
            style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        style={{ fontSize: "16px", color: "var(--color-action)" }}
      >
        {external ? "↗" : "›"}
      </span>
    </button>
  );
}

interface TileLinkProps {
  label: string;
  detail?: string;
  href: string;
  testid?: string;
}

function TileLink({ label, detail, href, testid }: TileLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      data-testid={testid}
      className="svika-glass flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span
          className="svika-body block font-semibold"
          style={{ color: "var(--color-ink)" }}
        >
          {label}
        </span>
        {detail ? (
          <span
            className="svika-meta mt-0.5 block"
            style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
          >
            {detail}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        style={{ fontSize: "16px", color: "var(--color-action)" }}
      >
        ↗
      </span>
    </a>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="svika-meta mt-5 px-1 uppercase"
      style={{ color: "var(--color-ink-mute)" }}
    >
      {children}
    </p>
  );
}

/**
 * Right-edge slide-in drawer that opens on persona-chip tap. Houses the
 * wallet/top-up shortcuts, the send-a-parcel action, and the "Behind the
 * scenes" demonstration deep links to /hwindi, /fleet, and /wa. Honours the
 * Phase 3.8 single-user pivot: secondary surfaces open in a new tab framed
 * as demonstrations, not personas the user switches into.
 */
export default function PersonaDrawer({
  open,
  onClose,
  persona,
  personaSlug,
  walletBalance,
  activeTicketCount,
  onOpenWallet,
  onOpenTopUp,
  onOpenParcel,
}: PersonaDrawerProps) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Close persona drawer"
        className="svika-sheet-scrim"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        style={{ zIndex: 49 }}
      />
      <aside
        className="svika-persona-drawer"
        data-open={open ? "true" : "false"}
        data-testid="persona-drawer"
        aria-hidden={!open}
        aria-label="Persona menu"
      >
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: "var(--color-hairline)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "var(--color-action)",
                color: "var(--color-bone)",
              }}
            >
              {persona.name.charAt(0).toUpperCase()}
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className="svika-headline"
                style={{ color: "var(--color-ink)" }}
              >
                {persona.name}
              </span>
              <span
                className="svika-meta"
                style={{
                  textTransform: "none",
                  fontSize: "10px",
                  color: "var(--color-ink-mute)",
                }}
              >
                signed in as {personaSlug}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ fontSize: "18px", color: "var(--color-ink-mute)" }}
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-24">
          <SectionHeader>Wallet</SectionHeader>
          <div className="mt-2 space-y-2">
            <TileButton
              label={`Wallet · $${walletBalance.toFixed(2)}`}
              detail={`${activeTicketCount} active ticket${activeTicketCount === 1 ? "" : "s"}`}
              testid="persona-drawer-wallet"
              onClick={() => {
                onOpenWallet();
                onClose();
              }}
            />
            <TileButton
              label="Top up"
              detail="Add credit · mocked for the demo"
              testid="persona-drawer-topup"
              onClick={() => {
                onOpenTopUp();
                onClose();
              }}
            />
          </div>

          <SectionHeader>Actions</SectionHeader>
          <div className="mt-2 space-y-2">
            <TileButton
              label="Send a parcel"
              detail="Same kombi · same code"
              testid="persona-drawer-parcel"
              onClick={() => {
                onOpenParcel();
                onClose();
              }}
            />
          </div>

          <SectionHeader>Behind the scenes</SectionHeader>
          <p
            className="mt-1 px-1 text-[11px]"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Demonstration surfaces — not personas you switch into.
          </p>
          <div className="mt-2 space-y-2">
            <TileLink
              label="Companion in WhatsApp"
              detail="Three commands · balance, kombi near me, transfer"
              href="/wa?as=takunda"
              testid="persona-drawer-wa"
            />
            <TileLink
              label="Conductor view (Farai)"
              detail="3-digit access code keypad"
              href="/hwindi?as=farai"
              testid="persona-drawer-hwindi"
            />
            <TileLink
              label="Fleet dashboard (Baba Tino)"
              detail="Revenue ledger · ghost-trip audit"
              href="/fleet?as=baba_tino"
              testid="persona-drawer-fleet"
            />
          </div>

          <SectionHeader>About</SectionHeader>
          <div className="mt-2 space-y-2">
            <TileButton
              label="How Svika works"
              detail={aboutOpen ? "Tap to collapse" : "Tap to expand"}
              testid="persona-drawer-about"
              onClick={() => setAboutOpen((v) => !v)}
            />
            {aboutOpen ? (
              <div
                className="rounded-2xl px-3 py-3 text-[12px] leading-relaxed"
                style={{
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "var(--color-hairline)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-ink)",
                }}
              >
                Built for Harare. Same kombi, same hwindi — only the ticket
                changes. Tickets transfer between users. Balances do not. The
                three-digit code is the only thing the conductor needs to
                clear a fare.
              </div>
            ) : null}
            <TileLink
              label="GitHub"
              detail="Public repo · honest tier-labelled README"
              href="https://github.com/takmaswi/Svika"
              testid="persona-drawer-github"
            />
          </div>
        </div>
      </aside>
    </>
  );
}
