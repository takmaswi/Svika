// scripts/phase-R4.5-rehearsal.ts
// Verify the R4.5 road-following kombi RAF.
//
// Pre-req: pnpm dev (term 1) + pnpm sim:start (term 2).
// Run:     pnpm exec tsx --env-file=.env.local scripts/phase-R4.5-rehearsal.ts
//
// Frames:
//   1   idle-densified-routes — passenger idle, four routes drawn with
//                                road-snapped curves (Heights → Rezende
//                                noticeably curvier than pre-R4.5).
//   2a  motion-sample-a       — in-transit kombi mid-route, frame A.
//   2b  motion-sample-b       — same kombi 1.5 s later, frame B.
//   2c  motion-sample-c       — same kombi 1.5 s later, frame C.
//
// Frame 1 is captured on idle. Frames 2a/b/c require an active in-transit
// journey so the assigned kombi gets the highlighted treatment; we drain
// Takunda, book the Avondale walking-transfer plan via the quick pick + pay
// from wallet (mirroring phase-R5-rehearsal), then drive `journey-simulate-
// next` until `data-stage="in-transit"` is on the journey content. The
// motion captured during 2a/b/c is sim-broadcast-driven (NOT simulate-path)
// — that's the new R4.5 RAF in action.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "@playwright/test";

import type { Database } from "@/lib/supabase/types";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";

async function snap(page: Page, file: string, label: string): Promise<void> {
  await page.screenshot({ path: `scripts/${file}`, fullPage: false });
  console.log(`[R4.5] ${label} · scripts/${file}`);
}

async function drainTakunda(client: SupabaseClient<Database>): Promise<void> {
  const { data: takunda } = await client
    .from("users")
    .select("id")
    .eq("name", "Takunda")
    .maybeSingle();
  if (!takunda) throw new Error("Takunda user missing");
  await client
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("current_holder_user_id", takunda.id)
    .in("status", ["issued", "held", "redeemed"]);
  await client
    .from("users")
    .update({ credit_balance_usd: 5 })
    .eq("id", takunda.id);
  console.log("[R4.5] drained Takunda → no active trips, $5 wallet");
}

async function expandSheetToHalf(page: Page): Promise<void> {
  // Native page.mouse.down/up — synthetic dispatchEvent throws NotFoundError
  // from JourneySheet's setPointerCapture (lesson from R5 rehearsal).
  const dragZone = page.locator(
    '[data-testid="journey-sheet"] .svika-sheet-drag-zone',
  );
  const dragBox = await dragZone.boundingBox();
  if (!dragBox) throw new Error("Could not locate sheet drag zone bounding box");
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="journey-sheet"]')
        ?.getAttribute("data-snap") === "half",
    undefined,
    { timeout: 4000 },
  );
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local",
    );
  }
  const client = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await drainTakunda(client);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  // Frame 1 — idle, road-snapped routes
  await page.goto(`${BASE}/?as=takunda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-phase="r45"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="idle-sheet-content"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(4000); // tiles paint + initial sim broadcasts
  await snap(page, "phase-R4.5-rehearsal-1.png", "idle-densified-routes");

  // Book the Avondale walking-transfer plan via the quick pick
  await expandSheetToHalf(page);
  await page.waitForTimeout(500);
  await page.click('[data-testid="quick-pick-avondale"]');
  await page.waitForSelector('[data-testid="trip-preview-card"]', {
    timeout: 6000,
  });
  await page.click('[data-testid="trip-preview-buy"]');
  await page.waitForSelector('[data-testid="payment-wallet"]', {
    timeout: 6000,
  });
  await page.click('[data-testid="payment-wallet"]');
  await page.waitForSelector('[data-testid="journey-content"]', {
    timeout: 30_000,
  });

  // Drive simulate-next until journey reaches in-transit. simulateNextStepAction
  // moves through walk-to-board → boarding → in-transit. The simulate-path
  // animation (~6 s) is the OLD chord-line code path; once it ends, the
  // assigned kombi is driven by sim broadcasts on the new R4.5 RAF — which
  // is what frames 2a/b/c are meant to capture.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stage = await page
      .locator('[data-testid="journey-content"]')
      .getAttribute("data-stage");
    if (stage === "in-transit") break;
    const nextBtn = page.locator('[data-testid="journey-simulate-next"]');
    if ((await nextBtn.count()) === 0) break;
    if (await nextBtn.isDisabled()) {
      await page.waitForTimeout(800);
      continue;
    }
    await nextBtn.click();
    // Wait for the simulate-path drop+rise cycle so we don't tap during the
    // animation.
    try {
      await page.waitForSelector(
        '[data-testid="journey-sheet"][data-snap="peek"]',
        { timeout: 12_000 },
      );
      await page.waitForSelector(
        '[data-testid="journey-sheet"]:not([data-snap="peek"])',
        { timeout: 20_000 },
      );
    } catch {
      // Stage may have advanced without a peek/rise — keep going.
    }
  }
  await page.waitForSelector('[data-stage="in-transit"]', { timeout: 30_000 });

  // Drag the journey sheet down from full to half snap so the kombi marker
  // and the route line are both visible in the captures. Native page.mouse
  // (not synthetic dispatchEvent) — same lesson as R5. Drag down ~200 px
  // from the drag-zone center so the sheet snaps from full → half.
  const dragZone = page.locator(
    '[data-testid="journey-sheet"] .svika-sheet-drag-zone',
  );
  const dragBox = await dragZone.boundingBox();
  if (!dragBox) throw new Error("Could not locate sheet drag zone for in-transit drag-down");
  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Steps make the drag continuous so the sheet's pointer-move handler sees
  // a real drag gesture, not a teleport.
  await page.mouse.move(startX, startY + 200, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="journey-sheet"]')
        ?.getAttribute("data-snap") === "half",
    undefined,
    { timeout: 4000 },
  );

  // Settle one full sim tick so the sim is broadcasting the in-transit kombi
  // through the R4.5 RAF before we sample.
  await page.waitForTimeout(2000);

  await snap(page, "phase-R4.5-rehearsal-2a.png", "motion-sample-a");
  await page.waitForTimeout(1500);
  await snap(page, "phase-R4.5-rehearsal-2b.png", "motion-sample-b");
  await page.waitForTimeout(1500);
  await snap(page, "phase-R4.5-rehearsal-2c.png", "motion-sample-c");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
