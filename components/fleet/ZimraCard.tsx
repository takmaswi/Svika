interface ZimraCardProps {
  monthlyEstimateUsd: number;
  dailyRevenueUsd: number;
}

export default function ZimraCard({ monthlyEstimateUsd, dailyRevenueUsd }: ZimraCardProps) {
  return (
    <article
      className="rounded-lg border-2 border-svika-rust bg-white p-5 shadow-sm"
      data-testid="fleet-zimra-card"
    >
      <header>
        <h3 className="text-sm font-medium text-svika-mute">ZIMRA liability (estimate)</h3>
        <p className="text-[11px] text-svika-mute">
          10% of monthly revenue, extrapolated from today.
        </p>
      </header>
      <p
        className="mt-3 font-mono text-4xl font-semibold text-svika-rust"
        data-testid="fleet-zimra-amount"
      >
        ${monthlyEstimateUsd.toFixed(2)}
      </p>
      <p className="mt-1 text-xs text-svika-mute">
        Today logged ${dailyRevenueUsd.toFixed(2)} → 30-day projection ×10%.
      </p>
    </article>
  );
}
