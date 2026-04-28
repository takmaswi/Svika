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
      className="rounded-lg border border-svika-teal-100 bg-white p-5 shadow-sm"
      data-testid="fleet-audit-panel"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="svika-headline text-svika-teal">
            Ghost Trip audit · {vehicleId}
          </h3>
          <p className="svika-meta text-svika-mute">
            {routeName} · {narrative.for_date} · {narrative.generated_by}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Audit narrative language"
          className="inline-flex overflow-hidden rounded-md border border-svika-teal-100 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={lang === "en"}
            onClick={() => setLang("en")}
            className={`px-3 py-1 ${
              lang === "en" ? "bg-svika-teal text-svika-stone" : "bg-white text-svika-teal"
            }`}
            data-testid="audit-tab-english"
          >
            English
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lang === "sn"}
            onClick={() => setLang("sn")}
            className={`px-3 py-1 ${
              lang === "sn" ? "bg-svika-teal text-svika-stone" : "bg-white text-svika-teal"
            }`}
            data-testid="audit-tab-shona"
          >
            Shona
          </button>
        </div>
      </header>

      <p
        className="svika-body mt-3 whitespace-pre-line text-svika-ink"
        data-testid={`audit-text-${lang}`}
      >
        {text}
      </p>
    </article>
  );
}
