"use client";

import { PERSONA_META } from "@/lib/personas-meta";

interface PersonaActionSheetProps {
  open: boolean;
  currentSlug: string;
  onPick: (slug: string, url: string) => void;
  onClose: () => void;
}

/**
 * Glass action sheet that replaces the Phase 2 <select> persona dropdown.
 * Shows all four demo personas as full-width tiles with their typical
 * surface URL — tapping a tile navigates the parent there.
 */
export default function PersonaActionSheet({
  open,
  currentSlug,
  onPick,
  onClose,
}: PersonaActionSheetProps) {
  if (!open) return null;
  const current = PERSONA_META.find((p) => p.slug === currentSlug);
  const stayLabel = `Stay as ${current?.name ?? "this persona"}`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/35"
      data-testid="persona-action-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Switch persona"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="svika-glass-strong svika-animate-sheet-rise mx-3 mb-3 w-full max-w-md p-4">
        <p
          className="mb-3 px-1 text-[10px] font-medium uppercase tracking-[0.5px]"
          style={{ color: "var(--color-ink-mute)" }}
        >
          Switch persona
        </p>

        <ul className="space-y-2">
          {PERSONA_META.map((persona) => {
            const isCurrent = persona.slug === currentSlug;
            return (
              <li key={persona.slug}>
                <button
                  type="button"
                  onClick={() => onPick(persona.slug, persona.surface_url)}
                  disabled={isCurrent}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors disabled:opacity-60"
                  style={{
                    minHeight: "56px",
                    backgroundColor: "var(--color-surface)",
                  }}
                  data-testid={`persona-action-${persona.slug}`}
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                    style={{
                      fontSize: "16px",
                      fontWeight: 500,
                      backgroundColor: "var(--color-action)",
                    }}
                  >
                    {persona.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate"
                      style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink)" }}
                    >
                      {persona.name}
                    </span>
                    <span
                      className="block truncate text-[11px]"
                      style={{ color: "var(--color-ink-mute)" }}
                    >
                      {persona.role_label} · {persona.surface_label}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span
                      className="text-[10px] font-medium uppercase tracking-[0.5px]"
                      style={{ color: "var(--color-action)" }}
                    >
                      Current
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      style={{ fontSize: "16px", color: "var(--color-action)" }}
                    >
                      →
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-2xl py-3"
          style={{
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "var(--color-action)",
            backgroundColor: "transparent",
            color: "var(--color-action)",
            fontSize: "14px",
            fontWeight: 500,
          }}
          data-testid="persona-action-cancel"
        >
          {stayLabel}
        </button>
      </div>
    </div>
  );
}
