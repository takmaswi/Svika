"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/**
 * Subscribe to <html data-theme> changes via MutationObserver. Used as the
 * `subscribe` arg of useSyncExternalStore so the toggle re-renders the moment
 * the bootstrap script (or another tab via storage event in a future iteration)
 * flips the attribute.
 */
function subscribeToTheme(callback: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function getThemeServerSnapshot(): Theme {
  // Match app/layout.tsx's static SSR default; the bootstrap script overrides
  // on first paint client-side, then useSyncExternalStore picks up the change.
  return "light";
}

function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("svika-theme", t);
  } catch {
    // ignore — quota / private mode
  }
}

interface ThemeToggleProps {
  /** Visual variant. "row" = full-width tile (drawer), "icon" = small button (header). */
  variant?: "row" | "icon";
}

export default function ThemeToggle({ variant = "row" }: ThemeToggleProps) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const isDark = theme === "dark";
  const next: Theme = isDark ? "light" : "dark";

  const handleClick = (): void => {
    applyTheme(next);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Switch to ${next} theme`}
        data-testid="svika-theme-toggle"
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        {isDark ? "☀" : "☾"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="svika-theme-toggle"
      className="svika-glass flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-ink)",
          }}
        >
          {isDark ? "Dark theme" : "Light theme"}
        </span>
        <span
          className="svika-meta mt-0.5 block"
          style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
        >
          Tap to switch to {next}
        </span>
      </span>
      <span aria-hidden style={{ fontSize: "18px", color: "var(--color-action)" }}>
        {isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
