"use client";

import { useState } from "react";

interface SearchBarProps {
  onSubmit: (text: string) => Promise<void>;
  disabled: boolean;
}

const PRESET_QUERIES = [
  "Heights to Avondale",
  "I want to go to UZ from Heights",
  "Heights kuenda kuSam Levy's",
];

export default function SearchBar({ onSubmit, disabled }: SearchBarProps) {
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    await onSubmit(text.trim());
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="trip-search" className="sr-only">
          Where do you want to go?
        </label>
        <input
          id="trip-search"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Where to? Try 'Heights to Avondale'"
          className="flex-1 rounded-md border border-svika-teal-100 bg-white px-3 py-2 text-sm text-svika-ink shadow-sm placeholder:text-svika-mute focus:border-svika-teal focus:outline-none"
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-md bg-svika-teal px-4 py-2 text-sm font-medium text-svika-stone shadow-sm transition-opacity disabled:opacity-50"
        >
          {disabled ? "..." : "Plan"}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_QUERIES.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setText(preset);
              if (!disabled) void onSubmit(preset);
            }}
            disabled={disabled}
            className="rounded-full border border-svika-teal-100 bg-svika-stone px-2.5 py-1 text-xs text-svika-teal transition-opacity hover:bg-svika-stone-dark disabled:opacity-50"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
