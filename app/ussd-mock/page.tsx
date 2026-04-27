/**
 * Phase 4 stretch 2 — static carrier-menu mock.
 *
 * No logic. Pitch slide rendered as a route so the demo can frame "designed to
 * integrate with the carrier USSD menu" without faking a working implementation.
 */
export default function UssdMockPage() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-[#1a1d22] p-6"
      data-testid="ussd-mock-shell"
    >
      <article
        className="relative w-[280px] overflow-hidden rounded-[36px] border-[6px] border-[#0f1115] bg-[#283037] shadow-2xl"
        style={{ aspectRatio: "9 / 16" }}
      >
        <header className="flex items-center justify-between bg-[#1a1d22] px-3 py-1 text-[10px] text-[#9da7b3]">
          <span>Econet</span>
          <span>15:42</span>
          <span>67%</span>
        </header>

        <div
          className="m-3 rounded-md bg-[#a4c34a] p-3 text-[#0e1a0a] shadow-inner"
          style={{
            fontFamily:
              "'Courier New', ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          <p className="text-[12px] uppercase tracking-wide">Svika</p>
          <p className="mt-1 text-[11px]">Pick an option:</p>
          <ol className="mt-2 list-inside text-[12px]" type="1">
            <li>1. Balance</li>
            <li>2. Plan trip</li>
            <li>3. Transfer ticket</li>
          </ol>
          <p className="mt-3 text-[10px]">0. Exit</p>
          <p className="mt-3 inline-block border-t border-[#5d7224] pt-1 text-[10px]">
            Reply with option number
          </p>
        </div>

        <section className="absolute inset-x-0 bottom-3 px-3 text-center text-[9px] text-[#5b646e]">
          <p>Mock interface · *123# pitch slide</p>
          <p className="mt-1">Real carrier integration is roadmap.</p>
        </section>
      </article>
    </main>
  );
}
