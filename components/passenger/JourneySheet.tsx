"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type SheetSnap = "peek" | "half" | "full";

interface JourneySheetProps {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  children: ReactNode;
}

const ORDER: SheetSnap[] = ["peek", "half", "full"];

function nextSnap(current: SheetSnap): SheetSnap {
  const idx = ORDER.indexOf(current);
  return ORDER[(idx + 1) % ORDER.length];
}

function snapHeight(snap: SheetSnap): string {
  switch (snap) {
    case "peek":
      return "var(--sheet-peek)";
    case "half":
      return "var(--sheet-half)";
    case "full":
      return "var(--sheet-full)";
  }
}

/**
 * Hand-rolled bottom-sheet primitive with three snap points (peek / half /
 * full). The sheet is permanently mounted on the passenger surface; the map
 * remains interactive at peek and half. A scrim appears at full snap and
 * tapping it returns to half.
 *
 * Drag-to-snap is implemented on the handle row only — body scroll stays
 * intact for long content. `prefers-reduced-motion` disables the height
 * transition via globals.css.
 */
export default function JourneySheet({
  snap,
  onSnapChange,
  children,
}: JourneySheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ y: number; startSnap: SheetSnap } | null>(null);

  // Touch / pointer drag on the handle row — small movement falls back to
  // the cycle behaviour, larger drags map to the closest snap.
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStartRef.current = { y: e.clientY, startSnap: snap };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    const viewport = window.innerHeight || 800;
    // Threshold: 12% of viewport for one-step snap, 28% for two-step.
    const oneStep = viewport * 0.12;
    const twoStep = viewport * 0.28;
    if (Math.abs(dy) < 8) {
      // Pure tap — cycle to next snap.
      onSnapChange(nextSnap(start.startSnap));
      return;
    }
    if (dy < -twoStep) {
      onSnapChange("full");
      return;
    }
    if (dy < -oneStep) {
      onSnapChange(start.startSnap === "peek" ? "half" : "full");
      return;
    }
    if (dy > twoStep) {
      onSnapChange("peek");
      return;
    }
    if (dy > oneStep) {
      onSnapChange(start.startSnap === "full" ? "half" : "peek");
      return;
    }
    // No-op for sub-threshold drag.
  }

  useEffect(() => {
    // Keep the sheet height variable updated whenever the snap changes —
    // CSS does the actual transition. This effect just makes the snap a
    // reactive value the rest of the layout can listen to via DOM.
    const el = sheetRef.current;
    if (!el) return;
    el.dataset.snap = snap;
  }, [snap]);

  const showScrim = snap === "full";

  return (
    <>
      <div
        className="svika-sheet-scrim"
        data-open={showScrim ? "true" : "false"}
        aria-hidden={!showScrim}
        onClick={() => {
          if (showScrim) onSnapChange("half");
        }}
      />
      <div
        ref={sheetRef}
        className="svika-sheet"
        style={{ height: snapHeight(snap) }}
        data-testid="journey-sheet"
        data-snap={snap}
        role="dialog"
        aria-label="Journey controls"
      >
        <div
          className="svika-sheet-handle-row"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          role="button"
          aria-label={`Sheet handle — ${snap}. Tap to expand.`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSnapChange(nextSnap(snap));
            }
          }}
        >
          <span aria-hidden className="svika-sheet-handle" />
        </div>
        <div className="svika-sheet-body">{children}</div>
      </div>
    </>
  );
}
