/**
 * Run the kombi simulation locally.
 *
 *   pnpm sim:start
 *
 * Press Ctrl+C to stop. Tick interval is two seconds. Each tick advances every
 * vehicle along its route, writes the new position to the database, and
 * broadcasts a single batched payload on the `kombi-positions` Realtime
 * channel.
 */

import { createClient } from "@supabase/supabase-js";

import { startSim } from "@/lib/sim/simRunner";
import type { Database } from "@/lib/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[sim] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

async function main() {
  const handle = await startSim({
    client: supabase,
    onTick: (payloads) => {
      const summary = payloads
        .map((p) => `${p.vehicle_id}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
        .join("  ");
      console.log(`[sim ${new Date().toISOString()}] ${summary}`);
    },
  });

  console.log("[sim] running. Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("\n[sim] stopping...");
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[sim] failed to start:", err);
  process.exit(1);
});
