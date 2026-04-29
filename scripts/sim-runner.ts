/**
 * Run the kombi simulation locally.
 *
 *   pnpm sim:start                  # claim the lock and start broadcasting
 *   pnpm sim:start -- --force       # forcibly take over from a stale instance
 *
 * Press Ctrl+C to stop. Tick interval is two seconds. Each tick advances every
 * vehicle along its route, writes the new position to the database, and
 * broadcasts a single batched payload on the `kombi-positions` Realtime
 * channel.
 *
 * Single-flight discipline: this script holds an OS-level PID lock at
 * `.svika-sim.lock` in the repo root for as long as it is broadcasting. A
 * second invocation that finds an active lock refuses to start (exits with
 * code 1) so two sim runners can never push contradictory `progressMeters`
 * values onto the same Realtime channel — the failure mode that produced the
 * teleport / ETA-jump / no-arrival bug captured in `docs/debug/phase-1-evidence.md`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

import { startSim } from "@/lib/sim/simRunner";
import type { Database } from "@/lib/supabase/types";

const RAW_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const RAW_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!RAW_SUPABASE_URL || !RAW_SERVICE_KEY) {
  console.error(
    "[sim] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
  process.exit(1);
}

const SUPABASE_URL: string = RAW_SUPABASE_URL;
const SERVICE_KEY: string = RAW_SERVICE_KEY;

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCK_PATH = path.join(REPO_ROOT, ".svika-sim.lock");
/**
 * Treat any lock file older than this as orphaned regardless of PID. Covers
 * the case where the OS recycles a PID number to an unrelated process.
 */
const STALE_LOCK_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Maximum time to wait after sending the kill signal in `--force` mode before
 * escalating to SIGKILL and, ultimately, giving up.
 */
const FORCE_KILL_WAIT_MS = 5_000;

interface LockFileBody {
  pid: number;
  started_at: string;
  supabase_url: string;
}

const force = process.argv.includes("--force");

function pidIsAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

function readLock(): LockFileBody | null {
  try {
    const raw = fs.readFileSync(LOCK_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { pid?: unknown }).pid === "number" &&
      typeof (parsed as { started_at?: unknown }).started_at === "string" &&
      typeof (parsed as { supabase_url?: unknown }).supabase_url === "string"
    ) {
      return parsed as LockFileBody;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLock(body: LockFileBody): void {
  fs.writeFileSync(LOCK_PATH, JSON.stringify(body, null, 2) + "\n", "utf8");
}

let cleanupRan = false;
function releaseLock(): void {
  if (cleanupRan) return;
  cleanupRan = true;
  try {
    const cur = readLock();
    if (cur && cur.pid === process.pid) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {
    // best-effort
  }
}

async function waitForExit(pid: number, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (!pidIsAlive(pid)) return true;
    await sleep(150);
  }
  return !pidIsAlive(pid);
}

async function acquireLock(): Promise<void> {
  const existing = readLock();
  if (existing) {
    const age = Date.now() - Date.parse(existing.started_at);
    const stale = !Number.isFinite(age) || age > STALE_LOCK_AGE_MS;
    const alive = pidIsAlive(existing.pid);
    if (alive && !stale) {
      if (force) {
        console.log(
          `[sim] --force: terminating PID ${existing.pid} held since ${existing.started_at}`,
        );
        try {
          process.kill(existing.pid, "SIGTERM");
        } catch {
          // already gone
        }
        const escalateAt = Date.now() + Math.floor(FORCE_KILL_WAIT_MS / 2);
        if (!(await waitForExit(existing.pid, escalateAt))) {
          try {
            process.kill(existing.pid, "SIGKILL");
          } catch {
            // ignore
          }
        }
        const finalDeadline = Date.now() + Math.floor(FORCE_KILL_WAIT_MS / 2);
        if (!(await waitForExit(existing.pid, finalDeadline))) {
          console.error(
            `[sim] --force: failed to terminate PID ${existing.pid}; aborting.`,
          );
          process.exit(1);
        }
        console.log(
          `[sim] --force: PID ${existing.pid} terminated; claiming lock.`,
        );
      } else {
        console.error(
          "[sim] another sim runner is already broadcasting:\n" +
            `      pid=${existing.pid}\n` +
            `      started_at=${existing.started_at}\n` +
            `      supabase_url=${existing.supabase_url}\n` +
            `      lock=${LOCK_PATH}\n` +
            `Run with \`pnpm sim:start -- --force\` to take over, ` +
            `or stop that process first (e.g. \`taskkill /F /PID ${existing.pid}\` on Windows, ` +
            `\`kill ${existing.pid}\` on Unix).`,
        );
        process.exit(1);
      }
    } else if (alive && stale) {
      console.log(
        `[sim] lock from ${existing.started_at} is older than 24h ` +
          `(pid ${existing.pid}); treating as orphaned and overwriting.`,
      );
    } else {
      console.log(
        `[sim] orphaned lock from dead pid ${existing.pid} ` +
          `(started_at ${existing.started_at}); overwriting.`,
      );
    }
  }

  writeLock({
    pid: process.pid,
    started_at: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
  });
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

async function main() {
  await acquireLock();

  const handle = await startSim({
    client: supabase,
    onTick: (payloads) => {
      const summary = payloads
        .map((p) => `${p.vehicle_id}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
        .join("  ");
      console.log(`[sim ${new Date().toISOString()}] ${summary}`);
    },
  });

  console.log(`[sim] running. pid=${process.pid}. Ctrl+C to stop.`);

  const shutdown = async (signal: string) => {
    console.log(`\n[sim] received ${signal}, stopping...`);
    try {
      await handle.stop();
    } catch {
      // best-effort
    }
    releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // process.on('exit') runs synchronously on every exit path Node knows about,
  // including normal exits, uncaught exceptions, and the SIGINT/SIGTERM
  // handlers above (via process.exit). On Windows it also fires when the host
  // shell is closed via the X button, the corner case where SIGINT/SIGTERM
  // are not delivered. releaseLock() is idempotent.
  process.on("exit", releaseLock);
}

main().catch((err) => {
  console.error("[sim] failed to start:", err);
  releaseLock();
  process.exit(1);
});
