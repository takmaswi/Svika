"use client";

import Image from "next/image";
import { useState } from "react";

interface Suburb {
  name: string;
  lat: number;
  lng: number;
}

const DEMO_SUBURBS: ReadonlyArray<Suburb> = [
  { name: "Mount Pleasant Heights", lat: -17.7498, lng: 31.0425 },
  { name: "Avondale", lat: -17.7811, lng: 31.0388 },
  { name: "Mbare", lat: -17.8514, lng: 31.0367 },
  { name: "Glen View", lat: -17.8847, lng: 31.0036 },
  { name: "Borrowdale", lat: -17.7400, lng: 31.0900 },
  { name: "Harare CBD", lat: -17.8278, lng: 31.0500 },
];

/**
 * V1 brand landing — location-first.
 *
 * Hero shows the v2 logo glyph, lowercase wordmark, tagline, and a single
 * Forest CTA "Find kombis near me." Tapping the CTA asks the browser for
 * geolocation. On success we forward to /?as=takunda&lat=…&lng=… so the
 * passenger surface filters the kombi feed to a 5 km bbox around the user.
 * On denial / failure / unsupported, the suburb picker modal opens with a
 * hardcoded list of six demo centroids so the rehearsal still has a path
 * forward.
 *
 * The persona system stays wired in the URL (`?as=takunda` keeps every
 * other surface deep-link working) but is not surfaced in the user UI.
 */
export default function LandingHero() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function pickSuburb(s: Suburb) {
    if (typeof window === "undefined") return;
    setBusy(true);
    window.location.href = `/?as=takunda&lat=${s.lat}&lng=${s.lng}`;
  }

  function handleFindKombis() {
    if (busy) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPickerOpen(true);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        window.location.href = `/?as=takunda&lat=${latitude}&lng=${longitude}`;
      },
      () => {
        setBusy(false);
        setPickerOpen(true);
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }

  return (
    <main
      className="flex min-h-dvh flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <section
        className="flex flex-1 flex-col items-center justify-center px-6 pb-10 pt-12"
        aria-labelledby="svika-landing-heading"
      >
        <div className="svika-animate-fade-up flex flex-col items-center gap-6">
          <Image
            src="/brand/v2/logo.svg"
            alt=""
            width={120}
            height={120}
            priority
            style={{ display: "block" }}
          />
          <h1
            id="svika-landing-heading"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "72px",
              lineHeight: 0.9,
              letterSpacing: "-0.035em",
              color: "var(--color-forest)",
              margin: 0,
            }}
          >
            svika
          </h1>
          <p
            className="svika-body"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "20px",
              fontWeight: 500,
              color: "var(--color-char)",
              textAlign: "center",
              margin: 0,
            }}
          >
            Find your kombi.
          </p>
        </div>

        <div className="mt-10 flex w-full max-w-sm flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleFindKombis}
            disabled={busy}
            data-testid="landing-find-kombis"
            className="svika-animate-fade-up w-full rounded-full transition-transform active:scale-[0.99]"
            style={{
              minHeight: "56px",
              padding: "0 28px",
              backgroundColor: "var(--color-forest)",
              color: "var(--color-bone)",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: "17px",
              letterSpacing: "-0.01em",
              border: "none",
              boxShadow: "0 8px 24px rgba(31, 77, 46, 0.28)",
              animationDelay: "120ms",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.8 : 1,
            }}
          >
            {busy ? "Finding kombis…" : "Find kombis near me"}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid="landing-pick-suburb"
            className="svika-animate-fade-up"
            style={{
              background: "transparent",
              border: "none",
              padding: "8px 12px",
              color: "var(--color-moss)",
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              fontWeight: 500,
              textDecoration: "underline",
              textUnderlineOffset: "4px",
              cursor: "pointer",
              animationDelay: "200ms",
            }}
          >
            or pick a suburb
          </button>
        </div>
      </section>

      <footer className="px-5 pb-6 pt-2">
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12px",
            fontWeight: 400,
            color: "var(--color-moss)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Built in Harare. 2026.
        </p>
      </footer>

      {pickerOpen ? (
        <SuburbPicker
          onPick={pickSuburb}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </main>
  );
}

interface SuburbPickerProps {
  onPick: (s: Suburb) => void;
  onClose: () => void;
}

function SuburbPicker({ onPick, onClose }: SuburbPickerProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="svika-suburb-picker-heading"
      data-testid="landing-suburb-picker"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(14, 26, 18, 0.45)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="svika-animate-sheet-rise"
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--color-bone)",
          borderRadius: "22px",
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 24px 64px rgba(14, 26, 18, 0.25)",
          padding: "20px",
        }}
      >
        <header className="mb-3 flex items-center justify-between">
          <h2
            id="svika-suburb-picker-heading"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "20px",
              color: "var(--color-char)",
              margin: 0,
            }}
          >
            Pick a suburb
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suburb picker"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "20px",
              color: "var(--color-moss)",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </header>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {DEMO_SUBURBS.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => onPick(s)}
                data-testid={`landing-suburb-${s.name.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--color-hairline)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-char)",
                  textAlign: "left",
                }}
              >
                <span>{s.name}</span>
                <span aria-hidden style={{ color: "var(--color-forest)" }}>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
