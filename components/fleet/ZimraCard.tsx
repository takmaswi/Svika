interface ZimraCardProps {
  monthlyEstimateUsd: number;
  dailyRevenueUsd: number;
}

export default function ZimraCard({ monthlyEstimateUsd, dailyRevenueUsd }: ZimraCardProps) {
  return (
    <article
      className="rounded-lg border border-svika-teal-700 bg-white p-5 shadow-sm"
      data-testid="fleet-zimra-card"
    >
      <header>
        <h3 className="svika-meta text-svika-mute">ZIMRA liability (estimate)</h3>
        <p className="svika-meta text-svika-mute">
          10% of monthly revenue, extrapolated from today.
        </p>
      </header>
      <p
        className="svika-display mt-3 font-mono text-svika-teal-700"
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
