"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import PassengerMap from "@/components/PassengerMap";
import FareClearedToast, {
  type FareClearedToastState,
} from "@/components/passenger/FareClearedToast";
import JourneySheet, {
  type SheetSnap,
} from "@/components/passenger/JourneySheet";
import JourneySheetContent, {
  type SheetState,
} from "@/components/passenger/JourneySheetContent";
import PersonaDrawer from "@/components/passenger/PersonaDrawer";
import TabBar, { type TabKey } from "@/components/passenger/TabBar";
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
import { fetchFareClearedContextAction } from "@/lib/passenger/fare-cleared";
import type { WalletTicket } from "@/lib/passenger/wallet";
import type { Persona } from "@/lib/personas";
import type { PaymentMethod } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import {
  SIM_CHANNEL,
  TICKET_REDEEMED_EVENT,
  type KombiTickPayload,
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
  initialKombis: KombiTickPayload[];
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

const ACTIVE_JOURNEY_STAGES: ReadonlyArray<JourneyStage["kind"]> = [
  "walk-to-board",
  "in-transit",
  "walking-transfer",
  "boarding-leg-2",
  "arrived",
];

export default function PassengerShell({
  persona,
  personaSlug,
  network,
  mapboxToken,
  initialTickets,
  initialJourney,
  initialKombis,
  pendingClaim,
  liveStats,
}: PassengerShellProps) {
  const router = useRouter();
  const tickets = initialTickets;
  const [plans, setPlans] = useState<PlansState | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bookingFlash, setBookingFlash] = useState<BookingFlash | null>(null);
  const [busyMethod, setBusyMethod] = useState<PaymentMethod | null>(null);
  const [pickedOption, setPickedOption] = useState<TripPlan | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [parcelOpen, setParcelOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [, setClaimFlash] = useState<ClaimFlash | null>(null);
  const [stage, setStage] = useState<JourneyStage | null>(null);
  const [dismissedTripId, setDismissedTripId] = useState<string | null>(null);
  const [fareClearedToast, setFareClearedToast] =
    useState<FareClearedToastState | null>(null);
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [personaDrawerOpen, setPersonaDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  // True while a Simulate-tap path animation is playing on the map. Forces
  // the journey sheet down to peek so the user can watch the kombi cross
  // the map; auto-snap to the new stage's natural snap resumes when this
  // flips back to false (handled in the auto-snap rules below).
  const [isSimulating, setIsSimulating] = useState(false);
  // Tracks the last sheet state (+ simulating flag) for which we auto-snapped,
  // so manual user drags aren't overridden every render. Stored in state (not
  // a ref) so the "derive state from props change" pattern is React-Compiler-
  // clean. Encoded as `${sheetState}|${0|1}` so flipping isSimulating
  // re-triggers the auto-snap rules.
  const [lastAutoSnapState, setLastAutoSnapState] = useState<string | null>(
    null,
  );
  const claimedRef = useRef<string | null>(null);
  const lastToastSigRef = useRef<string | null>(null);

  const walletBalance = persona.credit_balance_usd;

  const journey = useMemo<ActiveJourney | null>(() => {
    if (!initialJourney) return null;
    if (dismissedTripId === initialJourney.trip_id) return null;
    return initialJourney;
  }, [initialJourney, dismissedTripId]);

  // Listen for the conductor's redeem broadcast and surface a "Fare cleared
  // by Farai" glass toast on the passenger surface itself.
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

  useEffect(() => {
    if (!fareClearedToast) return;
    const timer = setTimeout(() => setFareClearedToast(null), 4000);
    return () => clearTimeout(timer);
  }, [fareClearedToast]);

  useEffect(() => {
    if (!bookingFlash || bookingFlash.kind === "err") return;
    const timer = setTimeout(() => setBookingFlash(null), 6000);
    return () => clearTimeout(timer);
  }, [bookingFlash]);

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

  const handleEndTrip = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!journey) return { ok: false, error: "No active trip." };
    if (journey.kind === "parcel") {
      setDismissedTripId(journey.trip_id);
      setStage(null);
      setBookingFlash(null);
      setSearchError(null);
      return { ok: true };
    }
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

  const activeCount = tickets.filter((t) => !t.is_outgoing_transfer).length;

  const routeLabel = useMemo(() => {
    if (!pickedOption) return "";
    return pickedOption.label;
  }, [pickedOption]);

  // Derive the SheetState from the underlying booking / journey state. The
  // priority ladder is: wallet → parcel → topUp → payment-choice → plans →
  // searching → active journey stage → idle.
  const sheetState: SheetState = useMemo(() => {
    if (walletOpen) return "wallet";
    if (parcelOpen) return "parcel";
    if (topUpOpen) return "topping-up";
    if (pickedOption !== null) return "choosing-payment";
    if (plans !== null) return "plans-returned";
    if (searchBusy) return "searching";
    if (journey) {
      if (stage && ACTIVE_JOURNEY_STAGES.includes(stage.kind)) {
        return stage.kind as SheetState;
      }
      // Journey exists but stage hasn't been computed yet (Journey
      // component sets stage via onStageChange once it mounts). Default
      // to walk-to-board so JourneySheetContent mounts <Journey>, which
      // will then push the real stage up to the shell.
      return "walk-to-board";
    }
    return "idle";
  }, [
    walletOpen,
    parcelOpen,
    topUpOpen,
    pickedOption,
    plans,
    searchBusy,
    journey,
    stage,
  ]);

  // Auto-snap rules — applied at state transitions, not on every render. The
  // React-blessed pattern for "derive new state from props/state change" is
  // to compare a previous-value state during render and call setState; React
  // batches both updates into a single commit. User drags between snaps stay
  // sticky until sheetState itself changes.
  //
  // Phase Z.1: while a simulate path animation is playing the sheet drops
  // to peek so the user can see the kombi cross the map. Once isSimulating
  // flips back to false the auto-snap re-fires for the new sheetState.
  const autoSnapKey = `${sheetState}|${isSimulating ? "1" : "0"}`;
  if (lastAutoSnapState !== autoSnapKey) {
    setLastAutoSnapState(autoSnapKey);
    let desired: SheetSnap = snap;
    if (isSimulating) {
      desired = "peek";
    } else {
      switch (sheetState) {
        case "plans-returned":
        case "choosing-payment":
        case "topping-up":
        case "parcel":
        case "arrived":
        case "searching":
          desired = "half";
          break;
        case "wallet":
          desired = "full";
          break;
        case "walk-to-board":
        case "in-transit":
        case "walking-transfer":
        case "boarding-leg-2":
          desired = "full";
          break;
        case "idle":
          desired = "peek";
          break;
      }
    }
    if (desired !== snap) {
      setSnap(desired);
    }
  }

  function closeWallet() {
    setWalletOpen(false);
    setActiveTab("home");
  }

  function closeParcel() {
    setParcelOpen(false);
  }

  function closePayment() {
    if (busyMethod === null) setPickedOption(null);
  }

  function closeTopUp() {
    setTopUpOpen(false);
  }

  // When the user drags the sheet down to peek while in wallet/parcel/topUp,
  // close those overlays so the canonical state is plain idle/journey.
  function handleSnapChange(next: SheetSnap) {
    setSnap(next);
    if (next === "peek") {
      if (walletOpen) {
        setWalletOpen(false);
        setActiveTab("home");
      }
      if (parcelOpen) setParcelOpen(false);
      if (topUpOpen) setTopUpOpen(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-[var(--color-bg)]">
      <section className="absolute inset-0">
        {mapboxToken ? (
          <div className="absolute inset-0">
            <PassengerMap
              network={network}
              mapboxToken={mapboxToken}
              journey={journey}
              stage={stage}
              initialKombis={initialKombis}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-[var(--color-ink-mute)]">
            NEXT_PUBLIC_MAPBOX_TOKEN missing — set it in .env.local to render the map.
          </div>
        )}
      </section>

      <FareClearedToast
        state={fareClearedToast}
        onDismiss={() => setFareClearedToast(null)}
      />

      <JourneySheet snap={snap} onSnapChange={handleSnapChange}>
        <JourneySheetContent
          state={sheetState}
          personaName={persona.name}
          personaSlug={personaSlug}
          nextHeightsMinutes={liveStats.next_heights_minutes}
          searchBusy={searchBusy}
          searchError={searchError}
          onSearch={handleSearch}
          plansOptions={plans?.options ?? []}
          busyOptionLabel={busyMethod ? pickedOption?.label ?? null : null}
          onChoose={handleChoose}
          onClearPlans={() => {
            setPlans(null);
            setPickedOption(null);
          }}
          pickedOption={pickedOption}
          routeLabel={routeLabel}
          walletBalance={walletBalance}
          busyMethod={busyMethod}
          topUpBusy={topUpBusy}
          onPayWallet={() => pickedOption && handleBook(pickedOption, "wallet")}
          onPayCash={() => pickedOption && handleBook(pickedOption, "cash")}
          onOpenTopUp={() => setTopUpOpen(true)}
          onClosePayment={closePayment}
          onTopUp={handleTopUp}
          onCloseTopUp={closeTopUp}
          journey={journey}
          onPlanAnother={handlePlanAnother}
          onLifecycleEvent={handleLifecycleEvent}
          onStageChange={handleStageChange}
          onEndTrip={handleEndTrip}
          onSimulateStart={() => setIsSimulating(true)}
          onSimulateEnd={() => setIsSimulating(false)}
          tickets={tickets}
          onTransfer={handleTransfer}
          onCloseWallet={closeWallet}
          onParcelBooked={(result) => {
            setParcelOpen(false);
            setBookingFlash({
              kind: "ok",
              message: `Parcel booked for ${result.alight_label} · $${result.fare_usd.toFixed(2)}.`,
              access_codes: [result.access_code],
            });
            setWalletOpen(true);
            router.refresh();
          }}
          onCloseParcel={closeParcel}
        />
      </JourneySheet>

      <TabBar
        active={activeTab}
        ridesBadge={activeCount}
        onChange={(next) => {
          setActiveTab(next);
          if (next === "rides") {
            setWalletOpen(true);
            setPersonaDrawerOpen(false);
          } else if (next === "account") {
            setPersonaDrawerOpen(true);
            setWalletOpen(false);
          } else {
            setWalletOpen(false);
            setPersonaDrawerOpen(false);
          }
        }}
      />

      <PersonaDrawer
        open={personaDrawerOpen}
        onClose={() => {
          setPersonaDrawerOpen(false);
          setActiveTab("home");
        }}
        persona={persona}
        personaSlug={personaSlug}
        walletBalance={walletBalance}
        activeTicketCount={activeCount}
        onOpenWallet={() => {
          setWalletOpen(true);
          setParcelOpen(false);
          setPickedOption(null);
          setTopUpOpen(false);
        }}
        onOpenTopUp={() => {
          // Top-up needs a picked option to render a fare; surface it as
          // wallet content instead, where the user can drive top-up via the
          // payment-choice path or a future stand-alone tile.
          setWalletOpen(true);
          setParcelOpen(false);
          setPickedOption(null);
          setTopUpOpen(false);
        }}
        onOpenParcel={() => {
          setParcelOpen(true);
          setWalletOpen(false);
          setPickedOption(null);
          setTopUpOpen(false);
        }}
      />
    </main>
  );
}
