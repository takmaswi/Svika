import { resolvePersona } from "@/lib/personas";

/**
 * Mocked WhatsApp companion. Three commands: balance, kombi near me, transfer.
 * Phase 4 work.
 */
export default async function WaHome({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const persona = await resolvePersona(params.as, "passenger");

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-[#ece5dd]">
      <header className="bg-[#075e54] px-4 py-3 text-white">
        <p className="text-xs opacity-80">Svika · WhatsApp Business</p>
        <p className="text-base font-medium">+263 77 X SVIKA</p>
      </header>

      <div className="space-y-2 p-4">
        <div className="wa-bubble">
          <p className="text-sm">Hi {persona.name}. Try one of:</p>
          <ul className="mt-1 list-inside list-disc text-xs text-svika-mute">
            <li>balance</li>
            <li>kombi near me</li>
            <li>transfer 482 to +263772XXXXXX</li>
          </ul>
        </div>
        <p className="text-center text-xs text-svika-mute">Phase 4 wires real responses.</p>
      </div>
    </main>
  );
}
