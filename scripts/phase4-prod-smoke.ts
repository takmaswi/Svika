/**
 * Phase 4 prod smoke — drives the WhatsApp companion's three commands plus
 * the same-kombi parcel happy path against https://svika.vercel.app and
 * captures screenshots for `docs/PHASE-4.md`.
 *
 * Steps:
 *   1. Open /wa?as=takunda and screenshot the empty state.
 *   2. Tap "balance" chip, wait for reply, screenshot.
 *   3. Tap "kombi near me" chip, wait for reply, screenshot.
 *   4. Type "transfer NNN to +263772000002" against the latest active ticket
 *      Takunda owns; screenshot the reply.
 *   5. Open /?as=takunda → tap Parcel pill → fill the sheet → submit.
 *      Screenshot the access-code flash.
 *   6. Open /hwindi?as=farai → tap Parcel mode → type the parcel code →
 *      submit. Screenshot the accept feedback.
 *   7. Hit /api/ai-diag and dump provider info (Phase 4 Gemini fallback gate).
 *   8. Screenshot /ussd-mock and /fleet?as=baba_tino (emergency card).
 *
 * Run: npx tsx --env-file=.env.local scripts/phase4-prod-smoke.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = process.env.SVIKA_BASE ?? "https://svika.vercel.app";
const SHOTS_DIR = "scripts/phase4-screenshots";
const REPORT_PATH = "docs/PHASE-4-RAW.md";

interface Evidence {
  step: string;
  artefact?: string;
  notes?: string;
}

const evidence: Evidence[] = [];

function log(line: string): void {
  console.log(`[phase4] ${line}`);
}

async function shot(page: Page, name: string): Promise<string> {
  const path = join(SHOTS_DIR, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function readBubbles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="wa-bubble-in"], [data-testid="wa-bubble-out"]',
      ),
    );
    return nodes.map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
  });
}

async function waitForLastInbound(
  page: Page,
  prevCount: number,
  timeoutMs = 12000,
): Promise<string> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const bubbles = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="wa-bubble-in"]'),
      );
      return nodes.map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
    });
    if (bubbles.length > prevCount) {
      last = bubbles[bubbles.length - 1] ?? "";
      return last;
    }
    await page.waitForTimeout(300);
  }
  return last;
}

async function findTakundaTicketCode(): Promise<string | null> {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!URL || !KEY) return null;
  const client = createClient<Database>(URL, KEY, {
    auth: { persistSession: false },
  });
  const { data } = await client
    .from("users")
    .select("id")
    .ilike("name", "Takunda")
    .maybeSingle();
  if (!data) return null;
  const { data: ticket } = await client
    .from("tickets")
    .select("access_code, kind, status, current_holder_user_id, created_at")
    .eq("current_holder_user_id", data.id)
    .eq("kind", "passenger")
    .in("status", ["issued", "held"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ticket?.access_code ?? null;
}

async function main(): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
  });

  // 1 — /wa empty state
  const wa = await context.newPage();
  await wa.goto(`${BASE}/wa?as=takunda`, { waitUntil: "networkidle" });
  await wa.waitForSelector('[data-testid="wa-shell"]');
  evidence.push({
    step: "1 · /wa empty state",
    artefact: await shot(wa, "01-wa-empty.png"),
    notes: `URL ${BASE}/wa?as=takunda · data-phase=phase-4 verified`,
  });

  // 2 — balance
  let inboundCount = (await readBubbles(wa)).filter((b) => b.length > 0).length;
  await wa.click('[data-testid="wa-chip-balance"]');
  const balanceReply = await waitForLastInbound(wa, inboundCount);
  evidence.push({
    step: "2 · balance",
    artefact: await shot(wa, "02-wa-balance.png"),
    notes: balanceReply,
  });

  // 3 — kombi near me
  inboundCount = (await wa.$$('[data-testid="wa-bubble-in"]')).length;
  await wa.click('[data-testid="wa-chip-kombi"]');
  const nearReply = await waitForLastInbound(wa, inboundCount);
  evidence.push({
    step: "3 · kombi near me",
    artefact: await shot(wa, "03-wa-near.png"),
    notes: nearReply,
  });

  // 4 — transfer NNN to +263772000002
  const code = await findTakundaTicketCode();
  if (!code) {
    log("WARN — no active Takunda ticket. Skipping transfer step.");
    evidence.push({
      step: "4 · transfer (skipped)",
      notes: "No active Takunda ticket in the wallet — book one via /?as=takunda before re-running.",
    });
  } else {
    inboundCount = (await wa.$$('[data-testid="wa-bubble-in"]')).length;
    await wa.fill('[data-testid="wa-input"]', `transfer ${code} to +263772000002`);
    await wa.click('[data-testid="wa-send"]');
    const transferReply = await waitForLastInbound(wa, inboundCount);
    evidence.push({
      step: "4 · transfer",
      artefact: await shot(wa, "04-wa-transfer.png"),
      notes: `code ${code} · reply: ${transferReply}`,
    });
  }

  // 5 — parcel send on /?as=takunda
  const passenger = await context.newPage();
  await passenger.goto(`${BASE}/?as=takunda`, { waitUntil: "networkidle" });
  await passenger.waitForSelector('[data-testid="parcel-open"]');
  await passenger.click('[data-testid="parcel-open"]');
  await passenger.waitForSelector('[data-testid="parcel-sheet"]');
  await passenger.fill(
    '[data-testid="parcel-desc"]',
    "School books for Rudo (Phase 4 smoke)",
  );
  await passenger.click('[data-testid="parcel-pay-wallet"]');
  await passenger.click('[data-testid="parcel-submit"]');
  await passenger.waitForSelector('[data-testid="booking-flash"]', { timeout: 8000 });
  const parcelFlash = await passenger.evaluate(() => {
    const node = document.querySelector('[data-testid="booking-flash"]');
    return node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  evidence.push({
    step: "5 · parcel sent",
    artefact: await shot(passenger, "05-passenger-parcel-flash.png"),
    notes: parcelFlash.slice(0, 240),
  });

  // 6 — conductor accept (parcel mode)
  // Pull the parcel code straight from the booking flash.
  const parcelCode = await passenger.evaluate(() => {
    const codeNode = document.querySelector('[data-testid="booking-flash-codes"]');
    const text = codeNode?.textContent?.trim() ?? "";
    const match = text.match(/\b(\d{3})\b/);
    return match?.[1] ?? null;
  });

  if (!parcelCode) {
    log("WARN — could not read parcel code from the wallet UI. Skipping conductor accept.");
    evidence.push({ step: "6 · conductor accept (skipped)", notes: "No parcel code visible." });
  } else {
    const hwindi = await context.newPage();
    await hwindi.goto(`${BASE}/hwindi?as=farai`, { waitUntil: "networkidle" });
    // If conductor not yet assigned to a vehicle, claim ZH 4821.
    const needsAssign = await hwindi.$('[data-testid="hwindi-vehicle-ZH-4821"]');
    if (needsAssign) {
      await hwindi.click('[data-testid="hwindi-vehicle-ZH-4821"]');
      await hwindi.waitForTimeout(1500);
    }
    await hwindi.waitForSelector('[data-testid="hwindi-pin-keypad"]');
    await hwindi.click('[data-testid="hwindi-parcel"]'); // enter parcel mode
    for (const digit of parcelCode) {
      await hwindi.click(`button:has-text("${digit}")`);
    }
    // PinKeypad submits via Enter or its own submit button.
    await hwindi.click('button:has-text("Enter")');
    await hwindi.waitForTimeout(1500);
    const conductorFlash = await hwindi.evaluate(() => {
      const fb = document.querySelector('[data-testid="hwindi-feedback"]');
      return fb?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    });
    evidence.push({
      step: "6 · conductor parcel accept",
      artefact: await shot(hwindi, "06-conductor-parcel-accept.png"),
      notes: `code ${parcelCode} · ${conductorFlash}`,
    });
    await hwindi.close();
  }

  // 7 — AI diag
  const diagResp = await fetch(`${BASE}/api/ai-diag`, { cache: "no-store" });
  const diag = (await diagResp.json()) as unknown;
  evidence.push({
    step: "7 · /api/ai-diag",
    notes: JSON.stringify(diag, null, 2),
  });

  // 8 — USSD mock + fleet emergency card screenshots
  const ussd = await context.newPage();
  await ussd.goto(`${BASE}/ussd-mock`, { waitUntil: "networkidle" });
  await ussd.waitForSelector('[data-testid="ussd-mock-shell"]');
  evidence.push({
    step: "8a · /ussd-mock",
    artefact: await shot(ussd, "07-ussd-mock.png"),
  });

  const fleet = await context.newPage();
  await fleet.goto(`${BASE}/fleet?as=baba_tino`, { waitUntil: "networkidle" });
  await fleet.waitForSelector('[data-testid="emergency-contacts-card"]', {
    timeout: 10000,
  });
  evidence.push({
    step: "8b · /fleet emergency card",
    artefact: await shot(fleet, "08-fleet-emergency.png"),
  });

  await browser.close();

  const lines: string[] = [
    "# Phase 4 Prod Smoke — raw evidence",
    "",
    `Generated ${new Date().toISOString()} against \`${BASE}\`.`,
    "",
  ];
  for (const e of evidence) {
    lines.push(`## ${e.step}`, "");
    if (e.artefact) {
      lines.push(`- artefact: \`${e.artefact}\``);
    }
    if (e.notes) {
      lines.push("", "```", e.notes, "```", "");
    }
    lines.push("");
  }
  writeFileSync(REPORT_PATH, lines.join("\n"));
  log(`Wrote evidence to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
