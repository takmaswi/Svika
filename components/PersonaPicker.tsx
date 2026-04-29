import Link from "next/link";

import { PERSONA_META } from "@/lib/personas-meta";

/**
 * 2x2 grid of persona tiles for the brand landing. Each tile is a server-rendered
 * link straight to the relevant surface — no JS required to navigate.
 */
export default function PersonaPicker() {
  return (
    <section className="px-5 pb-6 pt-2" aria-labelledby="svika-persona-heading">
      <p
        id="svika-persona-heading"
        className="mb-2 text-[10px] font-medium uppercase tracking-[0.5px]"
        style={{ color: "var(--color-ink-mute)" }}
      >
        Try the demo
      </p>

      <div className="grid grid-cols-2 gap-2">
        {PERSONA_META.map((persona, index) => (
          <Link
            key={persona.slug}
            href={persona.surface_url}
            className="svika-glass svika-animate-fade-up flex items-center gap-3 px-3 py-3 transition-transform active:scale-[0.99]"
            style={{
              minHeight: "100px",
              animationDelay: `${200 + index * 100}ms`,
            }}
            data-testid={`landing-persona-${persona.slug}`}
            prefetch={false}
          >
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                fontSize: "18px",
                fontWeight: 500,
                backgroundColor: "var(--color-action)",
              }}
            >
              {persona.initial}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate"
                style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-ink)" }}
              >
                {persona.name}
              </span>
              <span
                className="block truncate"
                style={{ fontSize: "12px", color: "var(--color-ink-mute)" }}
              >
                {persona.role_label}
              </span>
            </span>
            <span
              aria-hidden
              style={{ fontSize: "18px", color: "var(--color-action)" }}
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
