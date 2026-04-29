/**
 * Phase 3 Fix B falsification helper.
 *
 * Sends a single forged kombi-positions broadcast that mimics what a stale
 * duplicate sim instance with cold-start `loadVehicles` state would emit:
 * ZH 4822 reporting `progressMeters: 0` while the live sim is mid-route.
 * The PassengerMap broadcast handler must drop this tick (per the
 * REGRESSION_PM/CHORD_THRESHOLD_M guard) and log a single warn message.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/phase-3-inject-bad-broadcast.ts
 *
 * Run while a healthy sim is broadcasting and a passenger surface is open
 * so the browser console can show the drop warning.
 */

import { createClient } from "@supabase/supabase-js";

import {
  SIM_CHANNEL,
  SIM_EVENT,
  type KombiTickPayload,
} from "@/lib/sim/simRunner";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[inject] env not set");
  process.exit(1);
}

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false },
});

async function main() {
  const channel = supabase.channel(SIM_CHANNEL, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  // Forge a payload that mimics a fresh cold-start sim instance: ZH 4822 at
  // progressMeters=0 with the lat/lng of the route's southern endpoint
  // (Rezende rank, ~-17.815, 31.052 — several km from where the live sim is
  // typically broadcasting at start, ~-17.762).
  const ticks: KombiTickPayload[] = [
    {
      vehicle_id: "ZH 4822",
      route_id: "route_heights_rezende",
      lat: -17.815000,
      lng: 31.052200,
      direction: "outbound",
      bearing: 0,
      progressMeters: 0,
      at: new Date().toISOString(),
    },
  ];

  const result = await channel.send({
    type: "broadcast",
    event: SIM_EVENT,
    payload: { ticks },
  });
  console.log("[inject] sent forged broadcast:", result, JSON.stringify(ticks));

  await supabase.removeChannel(channel);
  process.exit(0);
}

main().catch((err) => {
  console.error("[inject] failed:", err);
  process.exit(1);
});
