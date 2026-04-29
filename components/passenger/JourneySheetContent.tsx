"use client";

import type { ReactNode } from "react";

import IdleSheetContent from "./IdleSheetContent";
import Journey from "./Journey";
import ParcelSheet from "./ParcelSheet";
import PaymentChoiceSheet from "./PaymentChoiceSheet";
import PlanList from "./PlanList";
import TopUpSheet from "./TopUpSheet";
import TripPreviewCard from "./TripPreviewCard";
import Wallet from "./Wallet";
import type { ActiveJourney, JourneyStage } from "@/lib/passenger/journey-types";
import type { WalletTicket } from "@/lib/passenger/wallet";
import type { PaymentMethod } from "@/lib/supabase/types";
import type { TripPlan } from "@/lib/trip-planner";

export type SheetState =
  | "idle"
  | "searching"
  | "trip-preview"
  | "plans-returned"
  | "choosing-payment"
  | "topping-up"
  | "walk-to-board"
  | "in-transit"
  | "walking-transfer"
  | "boarding-leg-2"
  | "arrived"
  | "parcel"
  | "wallet";

interface JourneySheetContentProps {
  state: SheetState;
  // idle / searching
  personaName: string;
  personaSlug: string;
  nextHeightsMinutes: number;
  searchBusy: boolean;
  searchError: string | null;
  onSearch: (text: string) => Promise<void>;
  // quick-pick preview (idle → trip-preview → choosing-payment)
  quickPickPreview: TripPlan | null;
  onConfirmQuickPick: () => void;
  onCancelQuickPick: () => void;
  onPickPreviewFromIdle: (plan: TripPlan) => void;
  // plans-returned
  plansOptions: TripPlan[];
  busyOptionLabel: string | null;
  onChoose: (option: TripPlan) => void;
  onClearPlans: () => void;
  // choosing-payment / topping-up
  pickedOption: TripPlan | null;
  routeLabel: string;
  walletBalance: number;
  busyMethod: PaymentMethod | null;
  topUpBusy: boolean;
  onPayWallet: () => void;
  onPayCash: () => void;
  onOpenTopUp: () => void;
  onClosePayment: () => void;
  onTopUp: (amount: number) => Promise<void>;
  onCloseTopUp: () => void;
  // active journey states
  journey: ActiveJourney | null;
  onPlanAnother: () => void;
  onLifecycleEvent: (event: "redeemed" | "arrived") => void;
  onStageChange: (stage: JourneyStage) => void;
  onEndTrip: () => Promise<{ ok: boolean; error?: string }>;
  /** Fires the moment a Simulate tap kicks off a path animation. */
  onSimulateStart?: () => void;
  /** Fires once the simulated path animation has played out. */
  onSimulateEnd?: () => void;
  // wallet
  tickets: WalletTicket[];
  onTransfer: (
    ticketId: string,
    recipientSlug: string,
  ) => Promise<{
    ok: boolean;
    share_url?: string;
    recipient_name?: string;
    error?: string;
  }>;
  onCloseWallet: () => void;
  // parcel
  onParcelBooked: (result: {
    access_code: string;
    fare_usd: number;
    alight_label: string;
  }) => void;
  onCloseParcel: () => void;
}

const ACTIVE_JOURNEY_STATES: SheetState[] = [
  "walk-to-board",
  "in-transit",
  "walking-transfer",
  "boarding-leg-2",
  "arrived",
];

/**
 * Content router for the JourneySheet. Picks which inner component to render
 * for the current SheetState. The sheet primitive itself owns the chrome
 * (height, snap, scrim, handle); this component only swaps the body.
 */
export default function JourneySheetContent(
  props: JourneySheetContentProps,
): ReactNode {
  const { state } = props;

  // Wallet always renders at full snap as a peer affordance over the sheet's
  // current state. When `state === "wallet"`, the parent has already routed
  // here directly (e.g., from the persona drawer's Wallet tile).
  if (state === "wallet") {
    return (
      <div data-testid="journey-sheet-content" data-state="wallet">
        <Wallet
          tickets={props.tickets}
          personaSlug={props.personaSlug}
          onClose={props.onCloseWallet}
          onTransfer={props.onTransfer}
        />
      </div>
    );
  }

  if (state === "parcel") {
    return (
      <div data-testid="journey-sheet-content" data-state="parcel">
        <ParcelSheet
          personaSlug={props.personaSlug}
          walletBalance={props.walletBalance}
          onClose={props.onCloseParcel}
          onBooked={props.onParcelBooked}
        />
      </div>
    );
  }

  if (state === "topping-up" && props.pickedOption) {
    return (
      <div data-testid="journey-sheet-content" data-state="topping-up">
        <TopUpSheet
          walletBalance={props.walletBalance}
          fareUsd={props.pickedOption.total_fare_usd}
          busy={props.topUpBusy}
          onTopUp={props.onTopUp}
          onClose={props.onCloseTopUp}
        />
      </div>
    );
  }

  if (state === "choosing-payment" && props.pickedOption) {
    return (
      <div data-testid="journey-sheet-content" data-state="choosing-payment">
        <PaymentChoiceSheet
          option={props.pickedOption}
          routeLabel={props.routeLabel}
          walletBalance={props.walletBalance}
          seatsTaken={null}
          capacity={15}
          busyMethod={
            props.busyMethod === "wallet" || props.busyMethod === "cash"
              ? props.busyMethod
              : null
          }
          onWallet={props.onPayWallet}
          onCash={props.onPayCash}
          onTopUp={props.onOpenTopUp}
          onClose={props.onClosePayment}
        />
      </div>
    );
  }

  if (state === "trip-preview" && props.quickPickPreview) {
    return (
      <div data-testid="journey-sheet-content" data-state="trip-preview">
        <TripPreviewCard
          plan={props.quickPickPreview}
          busy={props.searchBusy}
          onConfirm={props.onConfirmQuickPick}
          onClose={props.onCancelQuickPick}
        />
      </div>
    );
  }

  if (state === "plans-returned") {
    return (
      <div data-testid="journey-sheet-content" data-state="plans-returned">
        <p className="pt-1 text-[10px] font-medium uppercase tracking-[0.5px] text-svika-mute">
          Pick a way
        </p>
        <div className="mt-2">
          <PlanList
            options={props.plansOptions}
            busyOption={props.busyOptionLabel}
            onChoose={props.onChoose}
            onClose={props.onClearPlans}
          />
        </div>
      </div>
    );
  }

  if (state === "searching") {
    return (
      <div
        data-testid="journey-sheet-content"
        data-state="searching"
        className="pt-2"
      >
        <p
          className="text-svika-teal"
          style={{ fontSize: "14px", fontWeight: 500 }}
        >
          Working out the best route…
        </p>
        <p className="mt-1 text-[11px] text-svika-mute">
          Type heard so far: &quot;{props.personaName}&apos;s plan&quot;
        </p>
      </div>
    );
  }

  if (
    ACTIVE_JOURNEY_STATES.includes(state) &&
    props.journey
  ) {
    return (
      <div
        data-testid="journey-sheet-content"
        data-state={state}
        data-journey-trip-id={props.journey.trip_id}
      >
        <Journey
          journey={props.journey}
          personaSlug={props.personaSlug}
          onPlanAnother={props.onPlanAnother}
          onLifecycleEvent={props.onLifecycleEvent}
          onStageChange={props.onStageChange}
          onEndTrip={props.onEndTrip}
          onSimulateStart={props.onSimulateStart}
          onSimulateEnd={props.onSimulateEnd}
        />
      </div>
    );
  }

  // Default — idle.
  return (
    <div data-testid="journey-sheet-content" data-state="idle">
      {props.searchError ? (
        <p className="mb-2 mt-1 rounded-md bg-white/80 px-2 py-1.5 text-[11px] text-svika-rust">
          {props.searchError}
        </p>
      ) : null}
      <IdleSheetContent
        personaName={props.personaName}
        nextHeightsMinutes={props.nextHeightsMinutes}
        onSubmit={props.onSearch}
        onPickPreview={props.onPickPreviewFromIdle}
        busy={props.searchBusy}
      />
    </div>
  );
}
