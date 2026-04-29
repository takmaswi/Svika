"use client";

import { useEffect } from "react";

interface PinKeypadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "submit"] as const;

export default function PinKeypad({ value, onChange, onSubmit, disabled }: PinKeypadProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return;
      if (/^\d$/.test(e.key) && value.length < 3) onChange((value + e.key).slice(0, 3));
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter" && value.length === 3) onSubmit();
      else if (e.key === "Escape") onChange("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, disabled, onChange, onSubmit]);

  function handlePress(k: (typeof KEYS)[number]) {
    if (disabled) return;
    if (k === "clear") {
      onChange("");
      return;
    }
    if (k === "submit") {
      if (value.length === 3) onSubmit();
      return;
    }
    if (value.length < 3) onChange((value + k).slice(0, 3));
  }

  const filled = value.padEnd(3, "•").slice(0, 3).split("");

  return (
    <div className="space-y-4">
      <div
        className="flex justify-center gap-3"
        aria-label={`Access code: ${value || "empty"}`}
        role="status"
      >
        {filled.map((c, i) => {
          const hasDigit = i < value.length;
          return (
            <span
              key={i}
              className="flex h-16 w-12 items-center justify-center rounded-md border-2 font-mono text-3xl"
              style={{
                borderColor: hasDigit
                  ? "var(--color-action)"
                  : "var(--color-hairline)",
                backgroundColor: "var(--color-bg)",
                color: hasDigit
                  ? "var(--color-action)"
                  : "var(--color-ink-mute)",
              }}
            >
              {hasDigit ? c : "•"}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => {
          const isClear = k === "clear";
          const isSubmit = k === "submit";
          const label = isClear ? "Clear" : isSubmit ? "Enter" : k;
          const enabled =
            !disabled &&
            (isClear
              ? value.length > 0
              : isSubmit
                ? value.length === 3
                : value.length < 3);
          const baseStyle: React.CSSProperties = isSubmit
            ? {
                backgroundColor: "var(--color-action)",
                color: "white",
              }
            : {
                borderWidth: "1px",
                borderStyle: "solid",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-ink)",
              };
          return (
            <button
              key={k}
              type="button"
              onClick={() => handlePress(k)}
              disabled={!enabled}
              className="touch-target rounded-md text-2xl font-semibold disabled:opacity-40"
              style={baseStyle}
              aria-label={isSubmit ? "Submit code" : isClear ? "Clear code" : `Digit ${k}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
