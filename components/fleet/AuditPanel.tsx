"use client";

import { useState } from "react";

import type { AuditNarrativeView } from "@/lib/fleet/audit";

interface AuditPanelProps {
  narrative: AuditNarrativeView;
  vehicleId: string;
  routeName: string;
}

export default function AuditPanel({ narrative, vehicleId, routeName }: AuditPanelProps) {
  const [lang, setLang] = useState<"en" | "sn">("en");
  const text = lang === "en" ? narrative.english_text : narrative.shona_text;

  return (
    <article
      className="rounded-lg p-5 shadow-sm"
      style={{
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "var(--color-hairline)",
        backgroundColor: "var(--color-bg)",
      }}
      data-testid="fleet-audit-panel"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3
            className="svika-headline"
            style={{ color: "var(--color-ink)" }}
          >
            Ghost Trip audit · {vehicleId}
          </h3>
          <p
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            {routeName} · {narrative.for_date} · {narrative.generated_by}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Audit narrative language"
          className="inline-flex overflow-hidden rounded-md text-xs"
          style={{
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "var(--color-hairline)",
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={lang === "en"}
            onClick={() => setLang("en")}
            className="px-3 py-1"
            style={{
              backgroundColor:
                lang === "en"
                  ? "var(--color-action-soft)"
                  : "var(--color-bg)",
              color:
                lang === "en" ? "var(--color-action)" : "var(--color-ink)",
              fontWeight: lang === "en" ? 600 : 400,
            }}
            data-testid="audit-tab-english"
          >
            English
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lang === "sn"}
            onClick={() => setLang("sn")}
            className="px-3 py-1"
            style={{
              backgroundColor:
                lang === "sn"
                  ? "var(--color-action-soft)"
                  : "var(--color-bg)",
              color:
                lang === "sn" ? "var(--color-action)" : "var(--color-ink)",
              fontWeight: lang === "sn" ? 600 : 400,
            }}
            data-testid="audit-tab-shona"
          >
            Shona
          </button>
        </div>
      </header>

      <p
        className="svika-body mt-3 whitespace-pre-line"
        style={{ color: "var(--color-ink)" }}
        data-testid={`audit-text-${lang}`}
      >
        {text}
      </p>
    </article>
  );
}
