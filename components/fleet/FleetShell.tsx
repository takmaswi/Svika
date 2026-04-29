"use client";

import { useMemo, useState } from "react";

import type { AuditNarrativeView } from "@/lib/fleet/audit";
import type { FleetState } from "@/lib/fleet/state";
import type { Persona } from "@/lib/personas";

import AuditPanel from "./AuditPanel";
import EmergencyContactsCard from "./EmergencyContactsCard";
import VehicleCard from "./VehicleCard";
import ZimraCard from "./ZimraCard";

interface FleetShellProps {
  persona: Persona;
  state: FleetState;
  narratives: AuditNarrativeView[];
}

export default function FleetShell({ persona, state, narratives }: FleetShellProps) {
  const initialId = state.vehicles[0]?.vehicle_id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  const selectedStats = useMemo(
    () => state.vehicles.find((v) => v.vehicle_id === selectedId) ?? null,
    [state.vehicles, selectedId],
  );
  const selectedNarrative = useMemo(
    () => narratives.find((n) => n.vehicle_id === selectedId) ?? null,
    [narratives, selectedId],
  );

  const cardStyle: React.CSSProperties = {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--color-hairline)",
    backgroundColor: "var(--color-bg)",
  };
  const inverseHeaderStyle: React.CSSProperties = {
    backgroundColor: "var(--color-surface-dark)",
    color: "#ffffff",
  };

  return (
    <main className="min-h-dvh">
      <header className="px-6 py-4" style={inverseHeaderStyle}>
        <h1 className="svika-display">Fleet · {persona.name}</h1>
        <p className="svika-meta opacity-80">
          {state.for_date} · {state.vehicles.length} kombi
          {state.vehicles.length === 1 ? "" : "s"}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        <article className="rounded-lg p-5 shadow-sm" style={cardStyle}>
          <h2
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Today&apos;s revenue
          </h2>
          <p
            className="svika-display mt-2 font-mono"
            style={{ color: "var(--color-ink)" }}
            data-testid="fleet-revenue"
          >
            ${state.totals.revenue_usd.toFixed(2)}
          </p>
          <p
            className="svika-meta mt-1"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Digital {state.totals.digital_fares_logged} · Cash {state.totals.cash_walkons_logged}
          </p>
        </article>
        <article className="rounded-lg p-5 shadow-sm" style={cardStyle}>
          <h2
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Stops vs fares logged
          </h2>
          <p
            className="svika-display mt-2 font-mono"
            style={{ color: "var(--color-ink)" }}
          >
            {state.totals.stops_made}
            <span
              className="text-base"
              style={{ color: "var(--color-ink-mute)" }}
            >
              {" "}
              / {state.totals.digital_fares_logged + state.totals.cash_walkons_logged}
            </span>
          </p>
          <p
            className="svika-meta mt-1"
            style={{
              fontWeight: state.totals.revenue_gap_usd > 5 ? 500 : undefined,
              color:
                state.totals.revenue_gap_usd > 5
                  ? "var(--color-action)"
                  : "var(--color-ink-mute)",
            }}
            data-testid="fleet-gap"
          >
            Estimated gap ${state.totals.revenue_gap_usd.toFixed(2)}
          </p>
        </article>
        <ZimraCard
          monthlyEstimateUsd={state.totals.zimra_liability_usd}
          dailyRevenueUsd={state.totals.revenue_usd}
        />
      </section>

      <section className="px-6 pb-2">
        <h2 className="svika-headline" style={{ color: "var(--color-ink)" }}>
          Per-kombi
        </h2>
        <p className="svika-meta" style={{ color: "var(--color-ink-mute)" }}>
          Tap a kombi to see its bilingual audit narrative.
        </p>
        <div
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
          data-testid="fleet-vehicle-grid"
        >
          {state.vehicles.length === 0 ? (
            <p
              className="rounded-md p-4 text-sm"
              style={{ ...cardStyle, color: "var(--color-ink-mute)" }}
            >
              No vehicles for this owner. Run the seed loader.
            </p>
          ) : (
            state.vehicles.map((v) => (
              <VehicleCard
                key={v.vehicle_id}
                stats={v}
                selected={v.vehicle_id === selectedId}
                onSelect={setSelectedId}
              />
            ))
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {selectedStats && selectedNarrative ? (
            <AuditPanel
              narrative={selectedNarrative}
              vehicleId={selectedStats.vehicle_id}
              routeName={selectedStats.route_name}
            />
          ) : (
            <article
              className="rounded-lg p-5 text-sm"
              style={{
                borderWidth: "1px",
                borderStyle: "dashed",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-ink-mute)",
              }}
            >
              Select a kombi to load its audit narrative.
            </article>
          )}
        </div>
        <div className="space-y-4">
          {selectedStats ? (
            <ZimraCard
              monthlyEstimateUsd={selectedStats.zimra_liability_estimate_usd}
              dailyRevenueUsd={selectedStats.total_logged_revenue_usd}
            />
          ) : null}
          <EmergencyContactsCard />
        </div>
      </section>
    </main>
  );
}
