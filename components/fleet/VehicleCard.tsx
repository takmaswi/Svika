"use client";

import type { FleetVehicleStats } from "@/lib/fleet/state";

interface VehicleCardProps {
  stats: FleetVehicleStats;
  selected: boolean;
  onSelect: (vehicleId: string) => void;
}

export default function VehicleCard({ stats, selected, onSelect }: VehicleCardProps) {
  const ratio = stats.capacity_seats > 0
    ? Math.round((stats.current_passenger_count / stats.capacity_seats) * 100)
    : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(stats.vehicle_id)}
      aria-pressed={selected}
      data-testid={`fleet-vehicle-${stats.vehicle_id.replace(/\s+/g, "-")}`}
      className="flex w-full flex-col gap-2 rounded-lg p-4 text-left shadow-sm transition"
      style={{
        borderWidth: selected ? "2px" : "1px",
        borderStyle: "solid",
        borderColor: selected
          ? "var(--color-action)"
          : "var(--color-hairline)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <header className="flex items-baseline justify-between">
        <h4
          className="svika-headline font-mono"
          style={{ color: "var(--color-ink)" }}
        >
          {stats.vehicle_id}
        </h4>
        <span className="svika-meta" style={{ color: "var(--color-ink-mute)" }}>
          {stats.route_name}
        </span>
      </header>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Revenue
          </dt>
          <dd
            className="font-mono text-sm"
            style={{ color: "var(--color-ink)" }}
          >
            ${stats.total_logged_revenue_usd.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            Stops
          </dt>
          <dd
            className="font-mono text-sm"
            style={{ color: "var(--color-ink)" }}
          >
            {stats.stops_made}
          </dd>
        </div>
        <div>
          <dt
            className="svika-meta"
            style={{ color: "var(--color-ink-mute)" }}
          >
            On board
          </dt>
          <dd
            className="font-mono text-sm"
            style={{ color: "var(--color-ink)" }}
          >
            {stats.current_passenger_count}/{stats.capacity_seats}
            <span
              className="ml-1 text-[10px]"
              style={{ color: "var(--color-ink-mute)" }}
            >
              ({ratio}%)
            </span>
          </dd>
        </div>
      </dl>
      <footer
        className="flex items-center justify-between text-[11px]"
        style={{ color: "var(--color-ink-mute)" }}
      >
        <span>
          Digital {stats.digital_fares_logged} · Cash {stats.cash_walkons_logged}
          {stats.parcels_delivered > 0 ? ` · Parcels ${stats.parcels_delivered}` : ""}
        </span>
        <span
          style={{
            fontWeight: stats.revenue_gap_estimate_usd > 5 ? 500 : undefined,
            color:
              stats.revenue_gap_estimate_usd > 5
                ? "var(--color-action)"
                : "var(--color-ink-mute)",
          }}
        >
          Gap ${stats.revenue_gap_estimate_usd.toFixed(2)}
        </span>
      </footer>
    </button>
  );
}
