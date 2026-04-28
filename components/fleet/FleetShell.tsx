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

  return (
    <main className="min-h-dvh">
      <header className="border-b border-svika-teal-100 bg-svika-teal px-6 py-4 text-svika-stone">
        <h1 className="svika-display">Fleet · {persona.name}</h1>
        <p className="svika-meta opacity-80">
          {state.for_date} · {state.vehicles.length} kombi
          {state.vehicles.length === 1 ? "" : "s"}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        <article className="rounded-lg border border-svika-teal-100 bg-white p-5 shadow-sm">
          <h2 className="svika-meta text-svika-mute">Today&apos;s revenue</h2>
          <p
            className="svika-display mt-2 font-mono text-svika-teal"
            data-testid="fleet-revenue"
          >
            ${state.totals.revenue_usd.toFixed(2)}
          </p>
          <p className="svika-meta mt-1 text-svika-mute">
            Digital {state.totals.digital_fares_logged} · Cash {state.totals.cash_walkons_logged}
          </p>
        </article>
        <article className="rounded-lg border border-svika-teal-100 bg-white p-5 shadow-sm">
          <h2 className="svika-meta text-svika-mute">Stops vs fares logged</h2>
          <p className="svika-display mt-2 font-mono text-svika-teal">
            {state.totals.stops_made}
            <span className="text-base text-svika-mute">
              {" "}
              / {state.totals.digital_fares_logged + state.totals.cash_walkons_logged}
            </span>
          </p>
          <p
            className={`svika-meta mt-1 ${
              // Phase D: only escalate to rust when the gap crosses the $5
              // threshold; below that, mute teal keeps the card calm.
              state.totals.revenue_gap_usd > 5 ? "font-medium text-svika-rust" : "text-svika-mute"
            }`}
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
        <h2 className="svika-headline text-svika-teal">Per-kombi</h2>
        <p className="svika-meta text-svika-mute">
          Tap a kombi to see its bilingual audit narrative.
        </p>
        <div
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
          data-testid="fleet-vehicle-grid"
        >
          {state.vehicles.length === 0 ? (
            <p className="rounded-md border border-svika-teal-100 bg-white p-4 text-sm text-svika-mute">
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
            <article className="rounded-lg border border-dashed border-svika-teal-100 bg-white p-5 text-sm text-svika-mute">
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
