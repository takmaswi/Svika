"use client";

import type { ReactNode } from "react";

export type TabKey = "home" | "rides" | "account";

interface TabBarProps {
  active: TabKey;
  onChange: (next: TabKey) => void;
  ridesBadge?: number;
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const TABS: TabConfig[] = [
  {
    key: "home",
    label: "Home",
    icon: (active) => (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden
        focusable="false"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    key: "rides",
    label: "Rides",
    icon: (active) => (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden
        focusable="false"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "account",
    label: "Account",
    icon: (active) => (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden
        focusable="false"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
];

export default function TabBar({ active, onChange, ridesBadge }: TabBarProps) {
  return (
    <nav
      data-testid="svika-tab-bar"
      aria-label="Primary"
      className="svika-glass-tab flex h-16 items-center justify-around"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 60,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            data-testid={`svika-tab-${tab.key}`}
            aria-current={isActive ? "page" : undefined}
            className="relative flex h-full flex-1 flex-col items-center justify-center gap-1 transition-opacity active:opacity-80"
            style={{
              color: isActive ? "var(--color-action)" : "var(--color-ink-mute)",
            }}
          >
            {tab.icon(isActive)}
            <span
              style={{
                fontSize: "10px",
                fontWeight: isActive ? 600 : 500,
                letterSpacing: "0.3px",
              }}
            >
              {tab.label}
            </span>
            {tab.key === "rides" && ridesBadge && ridesBadge > 0 ? (
              <span
                aria-label={`${ridesBadge} active tickets`}
                className="absolute right-[28%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1"
                style={{
                  backgroundColor: "var(--color-action)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                {ridesBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
