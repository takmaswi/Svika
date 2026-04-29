/**
 * Phase 4 stretch 3 — static emergency-contacts card.
 *
 * Hardcoded fixture data. Pitch slide rendered as a card so Baba Tino's
 * dashboard answers "what happens if a kombi is in an accident" without
 * promising a real notification engine. Roadmap reference: medical manifest
 * webhook in docs/ROADMAP.md.
 */

interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  preferred_language: string;
}

const FIXTURE: { vehicle_id: string; route_label: string; contacts: EmergencyContact[] } = {
  vehicle_id: "ZH 4821",
  route_label: "Heights → Rezende",
  contacts: [
    {
      name: "Mai Farai",
      relation: "Conductor's wife",
      phone: "+263 77 200 0033",
      preferred_language: "Shona",
    },
    {
      name: "Tendai Moyo",
      relation: "Operations partner",
      phone: "+263 77 200 0044",
      preferred_language: "English",
    },
  ],
};

export default function EmergencyContactsCard() {
  return (
    <article
      className="rounded-lg p-5 shadow-sm"
      style={{
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "var(--color-hairline)",
        backgroundColor: "var(--color-bg)",
      }}
      data-testid="emergency-contacts-card"
    >
      <header className="flex items-baseline justify-between">
        <h2
          className="text-sm font-medium"
          style={{ color: "var(--color-ink-mute)" }}
        >
          Emergency contacts
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px]"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-ink-mute)",
          }}
        >
          Static · roadmap
        </span>
      </header>
      <p
        className="mt-1 text-xs"
        style={{ color: "var(--color-ink-mute)" }}
      >
        Active trip · {FIXTURE.vehicle_id} · {FIXTURE.route_label}
      </p>
      <ul className="mt-3 space-y-2">
        {FIXTURE.contacts.map((c) => (
          <li
            key={c.phone}
            className="flex items-center justify-between rounded-md px-3 py-2 text-xs"
            style={{
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "var(--color-hairline)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <span className="flex flex-col">
              <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>
                {c.name}
              </span>
              <span style={{ color: "var(--color-ink-mute)" }}>
                {c.relation} · {c.preferred_language}
              </span>
            </span>
            <span
              className="font-mono"
              style={{ color: "var(--color-action)" }}
            >
              {c.phone}
            </span>
          </li>
        ))}
      </ul>
      <p
        className="mt-3 text-[11px]"
        style={{ color: "var(--color-ink-mute)" }}
      >
        Designed to fire on speeding events or panic-button presses. Real wiring
        is roadmap.
      </p>
    </article>
  );
}
