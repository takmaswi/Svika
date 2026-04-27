"use client";

import { useState } from "react";

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

  const inputCls =
    size === "hero"
      ? "flex-1 rounded-lg border border-svika-teal-100 bg-white px-4 py-3 text-base text-svika-ink shadow-sm placeholder:text-svika-mute focus:border-svika-teal focus:outline-none focus:ring-2 focus:ring-svika-rust/30"
      : "flex-1 rounded-md border border-svika-teal-100 bg-white px-3 py-2 text-sm text-svika-ink shadow-sm placeholder:text-svika-mute focus:border-svika-teal focus:outline-none";

  const buttonCls =
    size === "hero"
      ? "rounded-lg bg-svika-rust px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-50"
      : "rounded-md bg-svika-teal px-4 py-2 text-sm font-medium text-svika-stone shadow-sm transition-opacity disabled:opacity-50";

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="trip-search" className="sr-only">
        Where do you want to go?
      </label>
      <input
        id="trip-search"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? "Where to? Try 'Heights to Avondale'"}
        className={inputCls}
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className={buttonCls}
      >
        {disabled ? "..." : "Plan"}
      </button>
    </form>
  );
}
