"use client";

import { useState, type CSSProperties } from "react";

interface SearchBarProps {
  onSubmit: (text: string) => Promise<void>;
  disabled: boolean;
  /** Bigger input + bolder button when used inside the pre-trip hero. */
  size?: "compact" | "hero";
  placeholder?: string;
}

export default function SearchBar({
  onSubmit,
  disabled,
  size = "compact",
  placeholder,
}: SearchBarProps) {
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    await onSubmit(text.trim());
  }

  const inputBase =
    size === "hero"
      ? "flex-1 rounded-lg px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2"
      : "flex-1 rounded-md px-3 py-2 text-sm shadow-sm focus:outline-none";
  const inputStyle: CSSProperties = {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--color-hairline)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-ink)",
  };

  const buttonBase =
    size === "hero"
      ? "w-full rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50"
      : "rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-50";
  const buttonStyle: CSSProperties = {
    backgroundColor: "var(--color-action)",
  };

  const formCls = size === "hero" ? "flex flex-col gap-2" : "flex gap-2";

  return (
    <form onSubmit={handleSubmit} className={formCls}>
      <label htmlFor="trip-search" className="sr-only">
        Where do you want to go?
      </label>
      <input
        id="trip-search"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? "Where to? Try 'Heights to Avondale'"}
        className={inputBase}
        style={inputStyle}
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className={buttonBase}
        style={buttonStyle}
      >
        {disabled ? "..." : "Plan"}
      </button>
    </form>
  );
}
