"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import PassengerMap from "@/components/PassengerMap";
import EmptyHero from "@/components/passenger/EmptyHero";
import FareClearedToast, {
  type FareClearedToastState,
} from "@/components/passenger/FareClearedToast";
import Journey from "@/components/passenger/Journey";
import ParcelSheet from "@/components/passenger/ParcelSheet";
import PaymentChoiceSheet from "@/components/passenger/PaymentChoiceSheet";
import PlanList from "@/components/passenger/PlanList";
import TopUpSheet from "@/components/passenger/TopUpSheet";
import Wallet from "@/components/passenger/Wallet";
import {
  bookTripAction,
  claimTicketAction,
  endTripAction,
  findPlansAction,
  topUpAction,
  transferTicketAction,
} from "@/lib/passenger/actions";
import type { ActiveJourney, JourneyStage } from "@/lib/passenger/journey-types";
import type { LiveStats } from "@/lib/passenger/liveStats";
import type { NetworkPayload } from "@/lib/network/loadNetwork";
import { findPersonaMeta } from "@/lib/personas-meta";
import { fetchFareClearedContextAction } from "@/lib/passenger/fare-cleared";
import type { WalletTicket } from "@/lib/passenger/wallet";
import type { Persona } from "@/lib/personas";
import type { PaymentMethod } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import {
  SIM_CHANNEL,
  TICKET_REDEEMED_EVENT,
  type TicketRedeemedPayload,
} from "@/lib/sim/simRunner";
import type { TripPlan } from "@/lib/trip-planner";

interface PassengerShellProps {
  persona: Persona;
  personaSlug: string;
  network: NetworkPayload;
  mapboxToken: string;
  initialTickets: WalletTicket[];
  initialJourney: ActiveJourney | null;
  pendingClaim: string | null;
  liveStats: LiveStats;
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

const DEFAULT_CAPACITY = 15;

export default function PassengerShell({
  persona,
  personaSlug,
  network,
  mapboxToken,
  initialTickets,
  initialJourney,
  pendingClaim,
  liveStats,
}: PassengerShellProps) {
  const router = useRouter();
  const tickets = initialTickets;
  const [walletOpen, setWalletOpen] = useState(false);
  const [plans, setPlans] = useState<PlansState | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bookingFlash, setBookingFlash] = useState<BookingFlash | null>(null);
  const [busyMethod, setBusyMethod] = useState<PaymentMethod | null>(null);
  const [pickedOption, setPickedOption] = useState<TripPlan | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [parcelOpen, setParcelOpen] = useState(false);
  const [claimFlash, setClaimFlash] = useState<ClaimFlash | null>(null);
  const [stage, setStage] = useState<JourneyStage | null>(null);
  const [dismissedTripId, setDismissedTripId] = useState<string | null>(null);
  const [fareClearedToast, setFareClearedToast] =
    useState<FareClearedToastState | null>(null);
  const claimedRef = useRef<string | null>(null);
  const lastToastSigRef = useRef<string | null>(null);

  // The server-rendered persona balance is the source of truth. After
  // bookTripAction or topUpAction call revalidatePath, router.refresh pulls
  // the new value through the persona prop on the next paint. No local
  // mirror needed.
  const walletBalance = persona.credit_balance_usd;

  const journey = useMemo<ActiveJourney | null>(() => {
    if (!initialJourney) return null;
    if (dismissedTripId === initialJourney.trip_id) return null;
    return initialJourney;
  }, [initialJourney, dismissedTripId]);

  // Listen for the conductor's redeem broadcast and surface a "Fare cleared
  // by Farai" glass toast on the passenger surface itself, so Takunda sees
  // the consequence of the conductor's keypad without having to navigate.
  // Only fires for tickets the persona currently holds.
  useEffect(() => {
    const personaId = persona.id;
    const supabase = createClient();
    const channel = supabase.channel(SIM_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    });
    channel.on("broadcast", { event: TICKET_REDEEMED_EVENT }, (msg) => {
      const payload = msg.payload as TicketRedeemedPayload | undefined;
      if (!payload) return;
      if (payload.current_holder_user_id !== personaId) return;
      const sig = `${payload.ticket_id}@${payload.redeemed_at}`;
      if (lastToastSigRef.current === sig) return;
      lastToastSigRef.current = sig;
      void (async () => {
        const ctx = await fetchFareClearedContextAction({
          vehicle_id: payload.vehicle_id,
        });
        if (!ctx.ok) return;
        setFareClearedToast({
          conductor_name: ctx.conductor_name,
          vehicle_id: ctx.vehicle_id,
          seat: ctx.passenger_count,
          capacity: ctx.capacity_seats,
          shown_at: Date.now(),
        });
      })();
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [persona.id]);

  // Dismiss the toast 4s after it appears.
  useEffect(() => {
    if (!fareClearedToast) return;
    const timer = setTimeout(() => setFareClearedToast(null), 4000);
    return () => clearTimeout(timer);
  }, [fareClearedToast]);

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

  function handleChoose(option: TripPlan) {
    setPickedOption(option);
    setBookingFlash(null);
  }

  async function handleBook(option: TripPlan, method: PaymentMethod) {
    if (!plans) return;
    setBusyMethod(method);
    setBookingFlash(null);
    const result = await bookTripAction({
      persona_slug: personaSlug,
      origin_stop_id: plans.origin_stop_id,
      destination_stop_id: plans.destination_stop_id,
      option,
      payment_method: method,
    });
    setBusyMethod(null);
    if (!result.ok) {
      setBookingFlash({ kind: "err", message: result.error });
      return;
    }
    const codeLabel = result.access_codes.join(" · ");
    const okMessage =
      method === "cash"
        ? `Seat reserved. Pay $${option.total_fare_usd.toFixed(2)} cash on board · code ${codeLabel}.`
        : result.access_codes.length === 1
          ? "Ticket purchased. Show the code to your hwindi."
          : `${result.access_codes.length} tickets purchased, one for each kombi.`;
    setBookingFlash({
      kind: "ok",
      message: okMessage,
      access_codes: result.access_codes,
    });
    setPlans(null);
    setPickedOption(null);
    setDismissedTripId(null);
    setWalletOpen(true);
    router.refresh();
  }

  async function handleTopUp(amount: number) {
    setTopUpBusy(true);
    const result = await topUpAction({
      persona_slug: personaSlug,
      amount_usd: amount,
    });
    setTopUpBusy(false);
    if (result.ok) {
      setTopUpOpen(false);
      router.refresh();
    } else {
      setBookingFlash({ kind: "err", message: result.error });
    }
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

  const handleLifecycleEvent = useCallback(
    (event: "redeemed" | "arrived") => {
      if (event === "redeemed") {
        router.refresh();
      }
    },
    [router],
  );

  const handleStageChange = useCallback((next: JourneyStage) => {
    setStage(next);
  }, []);

  const handlePlanAnother = useCallback(() => {
    if (initialJourney) {
      setDismissedTripId(initialJourney.trip_id);
    }
    setStage(null);
    setBookingFlash(null);
    setSearchError(null);
    router.refresh();
  }, [initialJourney, router]);

  const handleEndTrip = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!journey) return { ok: false, error: "No active trip." };
    const result = await endTripAction({
      persona_slug: personaSlug,
      trip_id: journey.trip_id,
    });
    if (!result.ok) return { ok: false, error: result.error };
    setDismissedTripId(journey.trip_id);
    setStage(null);
    setBookingFlash(null);
    setSearchError(null);
    router.refresh();
    return { ok: true };
  }, [journey, personaSlug, router]);

  const balanceLabel = walletBalance.toFixed(2);
  const activeCount = tickets.filter((t) => !t.is_outgoing_transfer).length;
  const showHero = !journey && !plans;
  const personaMeta = findPersonaMeta(personaSlug);
  const initial = personaMeta?.initial ?? persona.name.charAt(0).toUpperCase();

  // Surface a featured-tile route label when prompting for payment.
  const routeLabel = useMemo(() => {
    if (!pickedOption) return "";
    return pickedOption.label;
  }, [pickedOption]);

  return (
    <main className="flex min-h-dvh flex-col bg-svika-bg">
      <header className="z-20 border-b border-svika-line bg-svika-bg/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-2 rounded-full px-1 py-1"
            aria-label={`Signed in as ${persona.name}`}
            data-testid="persona-chip"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full bg-svika-teal text-white"
              style={{ fontSize: "12px", fontWeight: 600 }}
            >
              {initial}
            </span>
            <span className="flex flex-col leading-tight">
              <span
                className="text-svika-teal"
                style={{ fontSize: "13px", fontWeight: 500 }}
              >
                {persona.name}
              </span>
              <span
                className="text-svika-mute"
                style={{ fontSize: "10px" }}
              >
                ${balanceLabel} · wallet
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="svika-glass flex items-center gap-1.5 px-2.5 py-1"
              data-testid="live-pill"
              style={{ borderRadius: "999px" }}
            >
              <span aria-hidden className="svika-pulse-dot" />
              <span
                className="text-svika-teal"
                style={{ fontSize: "10px", fontWeight: 500 }}
              >
                {liveStats.active_vehicle_count} on the road
              </span>
            </span>
            <button
              type="button"
              onClick={() => setParcelOpen(true)}
              className="svika-glass px-3 py-1.5 text-sm text-svika-teal"
              style={{ borderRadius: "999px", fontWeight: 500 }}
              data-testid="parcel-open"
            >
              Parcel
            </button>
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              className="svika-glass relative px-3 py-1.5 text-sm text-svika-teal"
              style={{ borderRadius: "999px", fontWeight: 500 }}
              data-testid="wallet-open"
            >
              Wallet
              {activeCount > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-svika-rust px-1.5 text-[11px] font-semibold text-white">
                  {activeCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        {searchError ? (
          <p className="mt-2 rounded-2xl bg-white/80 px-3 py-2 text-xs text-svika-rust">
            {searchError}
          </p>
        ) : null}
        {bookingFlash ? (
          <div
            className={`mt-2 rounded-2xl px-3 py-2 text-xs ${
              bookingFlash.kind === "ok"
                ? "bg-white/80 text-svika-teal"
                : "bg-white/80 text-svika-rust"
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
            className={`mt-2 rounded-2xl px-3 py-2 text-xs ${
              claimFlash.kind === "ok"
                ? "bg-white/80 text-svika-teal"
                : "bg-white/80 text-svika-rust"
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

      {showHero ? (
        <EmptyHero
          personaName={persona.name}
          walletBalanceUsd={walletBalance}
          nextHeightsMinutes={liveStats.next_heights_minutes}
          onSubmit={handleSearch}
          busy={searchBusy}
        />
      ) : null}

      <section className="relative flex-1">
        {mapboxToken ? (
          <div
            className="relative h-full w-full"
            style={{ opacity: 0.92 }}
          >
            <PassengerMap
              network={network}
              mapboxToken={mapboxToken}
              journey={journey}
              stage={stage}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(250,250,249,0.4) 0%, rgba(250,250,249,0) 35%)",
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-svika-mute">
            NEXT_PUBLIC_MAPBOX_TOKEN missing — set it in .env.local to render the map.
          </div>
        )}

        {!journey && plans ? (
          <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 max-h-[60vh] overflow-y-auto svika-glass-strong p-3">
            <PlanList
              options={plans.options}
              busyOption={busyMethod ? pickedOption?.label ?? null : null}
              onChoose={handleChoose}
              onClose={() => {
                setPlans(null);
                setPickedOption(null);
              }}
            />
          </div>
        ) : null}
      </section>

      {journey ? (
        <Journey
          journey={journey}
          onPlanAnother={handlePlanAnother}
          onLifecycleEvent={handleLifecycleEvent}
          onStageChange={handleStageChange}
          onEndTrip={handleEndTrip}
        />
      ) : null}

      <PaymentChoiceSheet
        open={pickedOption !== null && !topUpOpen}
        option={pickedOption}
        routeLabel={routeLabel}
        walletBalance={walletBalance}
        seatsTaken={null}
        capacity={DEFAULT_CAPACITY}
        busyMethod={busyMethod}
        onWallet={() => pickedOption && handleBook(pickedOption, "wallet")}
        onCash={() => pickedOption && handleBook(pickedOption, "cash")}
        onTopUp={() => setTopUpOpen(true)}
        onClose={() => {
          if (busyMethod === null) setPickedOption(null);
        }}
      />

      <TopUpSheet
        open={topUpOpen}
        walletBalance={walletBalance}
        fareUsd={pickedOption?.total_fare_usd ?? 0}
        busy={topUpBusy}
        onTopUp={handleTopUp}
        onClose={() => setTopUpOpen(false)}
      />

      <FareClearedToast
        state={fareClearedToast}
        onDismiss={() => setFareClearedToast(null)}
      />

      <Wallet
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        tickets={tickets}
        personaSlug={personaSlug}
        onTransfer={handleTransfer}
      />

      <ParcelSheet
        open={parcelOpen}
        personaSlug={personaSlug}
        walletBalance={walletBalance}
        onClose={() => setParcelOpen(false)}
        onBooked={(result) => {
          setParcelOpen(false);
          setBookingFlash({
            kind: "ok",
            message: `Parcel booked for ${result.alight_label} · $${result.fare_usd.toFixed(2)}.`,
            access_codes: [result.access_code],
          });
          setWalletOpen(true);
          router.refresh();
        }}
      />
    </main>
  );
}
