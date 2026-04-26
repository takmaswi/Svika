"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import PassengerMap from "@/components/PassengerMap";
import PlanList from "@/components/passenger/PlanList";
import SearchBar from "@/components/passenger/SearchBar";
import Wallet from "@/components/passenger/Wallet";
import {
  bookTripAction,
  claimTicketAction,
  findPlansAction,
  transferTicketAction,
} from "@/lib/passenger/actions";
import type { NetworkPayload } from "@/lib/network/loadNetwork";
import type { WalletTicket } from "@/lib/passenger/wallet";
import type { Persona } from "@/lib/personas";
import type { TripPlan } from "@/lib/trip-planner";

interface PassengerShellProps {
  persona: Persona;
  personaSlug: string;
  network: NetworkPayload;
  mapboxToken: string;
  initialTickets: WalletTicket[];
  pendingClaim: string | null;
}

interface PlansState {
  origin_stop_id: string;
  destination_stop_id: string;
  options: TripPlan[];
  intent_summary: string | null;
}

interface BookingFlash {
  kind: "ok" | "err";
  message: string;
  access_codes?: string[];
}

interface ClaimFlash {
  kind: "ok" | "err";
  message: string;
}

export default function PassengerShell({
  persona,
  personaSlug,
  network,
  mapboxToken,
  initialTickets,
  pendingClaim,
}: PassengerShellProps) {
  const router = useRouter();
  const tickets = initialTickets;
  const [walletOpen, setWalletOpen] = useState(false);
  const [plans, setPlans] = useState<PlansState | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bookingFlash, setBookingFlash] = useState<BookingFlash | null>(null);
  const [busyOption, setBusyOption] = useState<string | null>(null);
  const [claimFlash, setClaimFlash] = useState<ClaimFlash | null>(null);
  const claimedRef = useRef<string | null>(null);

  // Auto-claim when arriving via /?as=<recipient>&claim=<id>.
  useEffect(() => {
    if (!pendingClaim || claimedRef.current === pendingClaim) return;
    claimedRef.current = pendingClaim;
    void (async () => {
      const result = await claimTicketAction({
        persona_slug: personaSlug,
        ticket_id: pendingClaim,
      });
      if (result.ok) {
        setClaimFlash({
          kind: "ok",
          message: result.already_claimed
            ? "You already hold this ticket."
            : `Claimed. The ticket is in ${persona.name}'s wallet.`,
        });
        setWalletOpen(true);
        router.replace(`/?as=${personaSlug}`);
        router.refresh();
      } else {
        setClaimFlash({ kind: "err", message: result.error });
      }
    })();
  }, [pendingClaim, personaSlug, persona.name, router]);

  async function handleSearch(text: string) {
    setSearchBusy(true);
    setSearchError(null);
    setBookingFlash(null);
    const formData = new FormData();
    formData.set("text", text);
    const result = await findPlansAction(formData);
    setSearchBusy(false);
    if (!result.ok) {
      setSearchError(result.error);
      setPlans(null);
      return;
    }
    setPlans({
      origin_stop_id: result.origin_stop_id ?? "",
      destination_stop_id: result.destination_stop_id ?? "",
      options: result.options,
      intent_summary: result.intent.notes ?? null,
    });
  }

  async function handleChoose(option: TripPlan) {
    if (!plans) return;
    setBusyOption(option.label);
    setBookingFlash(null);
    const result = await bookTripAction({
      persona_slug: personaSlug,
      origin_stop_id: plans.origin_stop_id,
      destination_stop_id: plans.destination_stop_id,
      option,
    });
    setBusyOption(null);
    if (!result.ok) {
      setBookingFlash({ kind: "err", message: result.error });
      return;
    }
    setBookingFlash({
      kind: "ok",
      message:
        result.access_codes.length === 1
          ? "Ticket minted. Show the code to your hwindi."
          : `${result.access_codes.length} tickets minted, one per leg.`,
      access_codes: result.access_codes,
    });
    setPlans(null);
    setWalletOpen(true);
    router.refresh();
  }

  async function handleTransfer(ticketId: string, recipientSlug: string) {
    const result = await transferTicketAction({
      persona_slug: personaSlug,
      ticket_id: ticketId,
      recipient_slug: recipientSlug,
    });
    router.refresh();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      share_url: result.share_url,
      recipient_name: result.recipient_name,
    };
  }

  const balance = persona.credit_balance_usd.toFixed(2);
  const activeCount = tickets.filter((t) => !t.is_outgoing_transfer).length;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="z-20 border-b border-svika-teal-100 bg-svika-stone/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-svika-teal">Svika</h1>
            <p className="text-xs text-svika-mute">
              {persona.name} · ${balance}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWalletOpen(true)}
            className="rounded-md border border-svika-teal-100 bg-white px-3 py-1.5 text-sm font-medium text-svika-teal shadow-sm"
          >
            Wallet
            {activeCount > 0 ? (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-svika-rust px-1.5 text-xs font-semibold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>
        </div>
        <div className="mt-3">
          <SearchBar onSubmit={handleSearch} disabled={searchBusy} />
        </div>
        {searchError ? (
          <p className="mt-2 rounded bg-white px-2 py-1 text-xs text-svika-rust">{searchError}</p>
        ) : null}
        {bookingFlash ? (
          <div
            className={`mt-2 rounded px-2 py-1 text-xs ${
              bookingFlash.kind === "ok"
                ? "bg-white text-svika-teal"
                : "bg-white text-svika-rust"
            }`}
          >
            <p>{bookingFlash.message}</p>
            {bookingFlash.access_codes ? (
              <p className="mt-0.5 font-mono text-svika-rust">
                {bookingFlash.access_codes.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
        {claimFlash ? (
          <div
            className={`mt-2 rounded px-2 py-1 text-xs ${
              claimFlash.kind === "ok"
                ? "bg-white text-svika-teal"
                : "bg-white text-svika-rust"
            }`}
          >
            {claimFlash.message}
            <button
              type="button"
              onClick={() => setClaimFlash(null)}
              className="ml-2 text-svika-mute hover:text-svika-teal"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ) : null}
      </header>

      <section className="relative flex-1">
        {mapboxToken ? (
          <PassengerMap network={network} mapboxToken={mapboxToken} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-svika-mute">
            NEXT_PUBLIC_MAPBOX_TOKEN missing — set it in .env.local to render the map.
          </div>
        )}

        {plans ? (
          <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 max-h-[60vh] overflow-y-auto rounded-lg bg-svika-stone/95 p-3 shadow-lg backdrop-blur">
            <PlanList
              options={plans.options}
              busyOption={busyOption}
              onChoose={handleChoose}
              onClose={() => setPlans(null)}
            />
          </div>
        ) : null}
      </section>

      <Wallet
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        tickets={tickets}
        personaSlug={personaSlug}
        onTransfer={handleTransfer}
      />
    </main>
  );
}
