interface ZimraCardProps {
  monthlyEstimateUsd: number;
  dailyRevenueUsd: number;
}

export default function ZimraCard({ monthlyEstimateUsd, dailyRevenueUsd }: ZimraCardProps) {
  return (
    <article
      className="rounded-lg p-5 shadow-sm"
      style={{
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "var(--color-action)",
        backgroundColor: "var(--color-bg)",
      }}
      data-testid="fleet-zimra-card"
    >
      <header>
        <h3
          className="svika-meta"
          style={{ color: "var(--color-ink-mute)" }}
        >
          ZIMRA liability (estimate)
        </h3>
        <p className="svika-meta" style={{ color: "var(--color-ink-mute)" }}>
          10% of monthly revenue, extrapolated from today.
        </p>
      </header>
      <p
        className="svika-display mt-3 font-mono"
        style={{ color: "var(--color-action)" }}
        data-testid="fleet-zimra-amount"
      >
        ${monthlyEstimateUsd.toFixed(2)}
      </p>
      <p
        className="mt-1 text-xs"
        style={{ color: "var(--color-ink-mute)" }}
      >
        Today logged ${dailyRevenueUsd.toFixed(2)} → 30-day projection ×10%.
      </p>
    </article>
  );
}
