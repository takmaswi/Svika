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
      className={`flex w-full flex-col gap-2 rounded-lg border bg-white p-4 text-left shadow-sm transition ${
        selected
          ? "border-svika-teal ring-2 ring-svika-teal-100"
          : "border-svika-teal-100 hover:border-svika-teal"
      }`}
    >
      <header className="flex items-baseline justify-between">
        <h4 className="font-mono text-base font-semibold text-svika-teal">{stats.vehicle_id}</h4>
        <span className="text-xs text-svika-mute">{stats.route_name}</span>
      </header>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-svika-mute">Revenue</dt>
          <dd className="font-mono text-sm text-svika-teal">
            ${stats.total_logged_revenue_usd.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-svika-mute">Stops</dt>
          <dd className="font-mono text-sm text-svika-teal">{stats.stops_made}</dd>
        </div>
        <div>
          <dt className="text-svika-mute">On board</dt>
          <dd className="font-mono text-sm text-svika-teal">
            {stats.current_passenger_count}/{stats.capacity_seats}
            <span className="ml-1 text-[10px] text-svika-mute">({ratio}%)</span>
          </dd>
        </div>
      </dl>
      <footer className="flex items-center justify-between text-[11px] text-svika-mute">
        <span>
          Digital {stats.digital_fares_logged} · Cash {stats.cash_walkons_logged}
          {stats.parcels_delivered > 0 ? ` · Parcels ${stats.parcels_delivered}` : ""}
        </span>
        <span
          className={
            stats.revenue_gap_estimate_usd > 0 ? "font-medium text-svika-rust" : "text-svika-mute"
          }
        >
          Gap ${stats.revenue_gap_estimate_usd.toFixed(2)}
        </span>
      </footer>
    </button>
  );
}
