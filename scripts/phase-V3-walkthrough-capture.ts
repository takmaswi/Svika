// scripts/phase-V3-walkthrough-capture.ts
// Capture short Playwright videos of each V1 surface into video-assets/references/recordings/.
// Pre-req: pnpm dev + pnpm sim running.
// Run: pnpm tsx scripts/phase-V3-walkthrough-capture.ts
//   override base with: SVIKA_REHEARSAL_BASE=http://localhost:3001 pnpm tsx ...

import { chromium, type Page } from "@playwright/test";
import { promises as fs } from "fs";
import path from "path";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";
const OUT_DIR = "video-assets/references/recordings";

interface Scene {
  id: string;
  label: string;
  url: string;
  beats: Array<(page: Page) => Promise<void>>;
  holdMs: number;
  // If true, do NOT grant geolocation (used for the "deny location" landing scene).
  denyGeolocation?: boolean;
}

const SCENES: Scene[] = [
  {
    id: "01-landing-and-suburb-picker",
    label: "Landing -> tap Find kombis near me -> deny location -> suburb picker opens",
    url: BASE,
    denyGeolocation: true,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="landing-find-kombis"]', { timeout: 10000 });
        await page.waitForTimeout(1500);
        await page.click('[data-testid="landing-find-kombis"]');
        await page.waitForTimeout(1500);
      },
      async (page) => {
        // Picker should be visible after geolocation denial fallback.
        await page
          .waitForSelector('text=Pick a suburb', { timeout: 5000 })
          .catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 800,
  },
  {
    id: "02-pick-heights-to-passenger",
    label: "Tap or-pick-a-suburb -> Mount Pleasant Heights -> redirected to passenger surface",
    url: BASE,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="landing-pick-suburb"]', { timeout: 10000 });
        await page.click('[data-testid="landing-pick-suburb"]');
        await page.waitForTimeout(900);
        await page
          .locator("text=Mount Pleasant Heights")
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(2200);
      },
    ],
    holdMs: 1500,
  },
  {
    id: "03-passenger-idle-search",
    label: "Passenger idle -> open sheet -> typed search -> trip preview slides up",
    url: `${BASE}/?as=takunda&lat=-17.7498&lng=31.0425`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="idle-sheet-content"]', { timeout: 10000 });
        await page.waitForTimeout(1200);
        // Tap search bar
        await page.locator("text=Where to").first().click();
        await page.waitForTimeout(700);
      },
      async (page) => {
        // Pick the Avondale quick pick
        await page
          .locator('[data-testid="quick-pick-avondale"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(2000);
      },
    ],
    holdMs: 1200,
  },
  {
    id: "04-payment-choice",
    label: "Trip preview -> tap Buy -> payment choice sheet rises",
    url: `${BASE}/?as=takunda&lat=-17.7498&lng=31.0425`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="idle-sheet-content"]', { timeout: 10000 });
        await page.locator("text=Where to").first().click();
        await page.waitForTimeout(500);
        await page
          .locator('[data-testid="quick-pick-avondale"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1700);
      },
      async (page) => {
        await page
          .locator("text=/Buy \\$/")
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 1500,
  },
  {
    id: "05-wallet",
    label: "Wallet drawer -> tickets with 3-digit codes",
    url: `${BASE}/?as=takunda&lat=-17.7498&lng=31.0425`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="svika-tab-bar"]', { timeout: 10000 });
        await page
          .locator('[data-testid="svika-tab-rides"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 1500,
  },
  {
    id: "06-hwindi-pin-clear",
    label: "Conductor at /hwindi -> type 4 8 2 -> Enter -> Cleared flash",
    url: `${BASE}/hwindi?as=farai`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="hwindi-pin-keypad"]', { timeout: 10000 });
        await page.waitForTimeout(800);
      },
      async (page) => {
        const keypad = page.locator('[data-testid="hwindi-pin-keypad"]');
        // Press 4, 8, 2, Enter — scoped to the keypad to avoid stray matches.
        await keypad.getByText("4", { exact: true }).first().click();
        await page.waitForTimeout(220);
        await keypad.getByText("8", { exact: true }).first().click();
        await page.waitForTimeout(220);
        await keypad.getByText("2", { exact: true }).first().click();
        await page.waitForTimeout(220);
        await keypad.getByText("Enter", { exact: true }).first().click();
        await page.waitForTimeout(2200);
      },
    ],
    holdMs: 1200,
  },
  {
    id: "07-fleet-dashboard",
    label: "Fleet dashboard -> scroll through cards -> bilingual audit narrative",
    url: `${BASE}/fleet?as=baba_tino`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="fleet-vehicle-grid"]', { timeout: 10000 });
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
        await page.waitForTimeout(1500);
      },
      async (page) => {
        // Tap the ZH 4821 card to surface audit panel.
        await page
          .locator('[data-testid="fleet-vehicle-ZH-4821"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1300);
        // Toggle to Shona.
        await page
          .locator('[data-testid="audit-tab-shona"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 1200,
  },
  {
    id: "08-wa-companion",
    label: "WhatsApp companion -> tap balance chip -> kombi near me chip -> replies land",
    url: `${BASE}/wa?as=takunda`,
    beats: [
      async (page) => {
        await page.waitForSelector('[data-testid="wa-shell"]', { timeout: 10000 });
        await page.waitForTimeout(800);
      },
      async (page) => {
        await page
          .locator('[data-testid="wa-chip-balance"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(2000);
      },
      async (page) => {
        await page
          .locator('[data-testid="wa-chip-kombi"]')
          .first()
          .click()
          .catch(() => null);
        await page.waitForTimeout(2200);
      },
    ],
    holdMs: 1200,
  },
];

async function captureScene(scene: Scene): Promise<{ path: string; bytes: number }> {
  const sceneOutDir = path.join(OUT_DIR, "_temp", scene.id);
  await fs.mkdir(sceneOutDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    recordVideo: { dir: sceneOutDir, size: { width: 393, height: 852 } },
    geolocation: scene.denyGeolocation
      ? undefined
      : { latitude: -17.7498, longitude: 31.0425 },
    permissions: scene.denyGeolocation ? [] : ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.goto(scene.url);

  for (const beat of scene.beats) {
    try {
      await beat(page);
    } catch (err) {
      console.warn(`[V3] beat error in ${scene.id}: ${(err as Error).message}`);
    }
  }
  await page.waitForTimeout(scene.holdMs);

  await page.close();
  await ctx.close();
  await browser.close();

  const files = await fs.readdir(sceneOutDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`no .webm produced for scene ${scene.id}`);

  const finalPath = path.join(OUT_DIR, `${scene.id}.webm`);
  await fs.rename(path.join(sceneOutDir, webm), finalPath);
  await fs.rm(sceneOutDir, { recursive: true, force: true });

  const stat = await fs.stat(finalPath);
  return { path: finalPath, bytes: stat.size };
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const results: Array<{ id: string; path: string; bytes: number }> = [];
  for (const scene of SCENES) {
    process.stdout.write(`[V3] capturing ${scene.id} ... `);
    const out = await captureScene(scene);
    results.push({ id: scene.id, path: out.path, bytes: out.bytes });
    console.log(`done (${(out.bytes / 1024).toFixed(0)} KB)`);
  }
  await fs
    .rm(path.join(OUT_DIR, "_temp"), { recursive: true, force: true })
    .catch(() => null);

  console.log(`\n[V3] summary — ${results.length} clips in ${OUT_DIR}`);
  for (const r of results) {
    console.log(`  ${r.id}  ${(r.bytes / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
