# V3 — chore: walkthrough video clips into video-assets/references/recordings/

> Paste this whole document into Claude Code as one job. Playwright-driven video capture of the V1 surfaces, no live ride sim. Output goes into `video-assets/references/recordings/` for the 1-minute walkthrough portion of the submission video.

## Why

The 3-minute hackathon submission video is split into a 2-minute animated marketing portion (built later via NotebookLM Cinematic) and a 1-minute walkthrough of the live app. The walkthrough needs short MP4 clips of each surface, captured cleanly. The live ride simulation is broken, so the recordings cover only static and interaction surfaces, not the in-flight kombi animation.

## Pre-requisites (run before starting)

```bash
pnpm dev        # in one terminal, leave running
pnpm sim        # in another, leave running
```

Both must be up so the app renders fully and kombis show on the map.

## Steps

### Step 1: create the recordings directory

```bash
mkdir -p video-assets/references/recordings
```

### Step 2: write `scripts/phase-V3-walkthrough-capture.ts`

Skeleton:

```ts
// scripts/phase-V3-walkthrough-capture.ts
// Capture short Playwright videos of each V1 surface into video-assets/references/recordings/.
// Pre-req: pnpm dev + pnpm sim running.
// Run: pnpm tsx scripts/phase-V3-walkthrough-capture.ts

import { chromium } from "playwright";
import { promises as fs } from "fs";
import path from "path";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";
const OUT_DIR = "video-assets/references/recordings";

interface Scene {
  id: string;
  label: string;
  url: string;
  // beats run sequentially; each is a small async fn that drives the page
  beats: Array<(page: import("playwright").Page) => Promise<void>>;
  // hold time after last beat so the recording captures the resting state
  holdMs: number;
}

const SCENES: Scene[] = [
  {
    id: "01-landing-and-suburb-picker",
    label: "Landing -> tap Find kombis near me -> deny location -> suburb picker opens",
    url: BASE,
    beats: [
      async (page) => {
        await page.waitForSelector("text=Find kombis near me", { timeout: 10000 });
        await page.waitForTimeout(1500);
        // Mock geolocation denial so the picker fallback opens predictably.
        await page.context().setGeolocation(undefined as never);
        await page.context().grantPermissions([], { origin: BASE });
        await page.click("text=Find kombis near me");
        await page.waitForTimeout(1200);
      },
      async (page) => {
        // Picker should be visible now
        await page.waitForSelector("text=Pick a suburb", { timeout: 5000 }).catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 800,
  },
  {
    id: "02-pick-heights-to-passenger",
    label: "Pick Mount Pleasant Heights -> redirected to passenger surface",
    url: BASE,
    beats: [
      async (page) => {
        await page.waitForSelector("text=Find kombis near me", { timeout: 10000 });
        await page.click("text=or pick a suburb");
        await page.waitForTimeout(800);
        await page.click("text=Mount Pleasant Heights");
        await page.waitForTimeout(2200); // map tile load
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
        await page.waitForSelector("text=Where to, Takunda", { timeout: 10000 });
        await page.waitForTimeout(1200);
        // Tap search bar
        await page.click("text=Where to, Takunda");
        await page.waitForTimeout(700);
      },
      async (page) => {
        // Pick the Avondale quick pick if visible
        await page.locator("text=Avondale Shops").first().click({ trial: false }).catch(() => null);
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
        await page.waitForSelector("text=Where to, Takunda", { timeout: 10000 });
        await page.click("text=Where to, Takunda");
        await page.waitForTimeout(500);
        await page.locator("text=Avondale Shops").first().click().catch(() => null);
        await page.waitForTimeout(1500);
      },
      async (page) => {
        await page.locator("text=/Buy \\$/").first().click().catch(() => null);
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
        await page.waitForSelector("text=Where to, Takunda", { timeout: 10000 });
        // Click Account or Rides tab to surface wallet, depending on TabBar markup
        await page.locator("text=Rides").first().click().catch(() => null);
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
        await page.waitForSelector("text=Code", { timeout: 10000 });
        await page.waitForTimeout(800);
      },
      async (page) => {
        // Press 4, 8, 2, Enter
        await page.click("text=4");
        await page.waitForTimeout(220);
        await page.click("text=8");
        await page.waitForTimeout(220);
        await page.click("text=2");
        await page.waitForTimeout(220);
        await page.click("text=Enter");
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
        await page.waitForSelector("text=Fleet", { timeout: 10000 });
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
        await page.waitForTimeout(1500);
      },
      async (page) => {
        // Tap a kombi card to surface audit panel if not already visible
        await page.locator("text=ZH 4821").first().click().catch(() => null);
        await page.waitForTimeout(1500);
        // Toggle to Shona if a tab exists
        await page.locator("text=Shona").first().click().catch(() => null);
        await page.waitForTimeout(1500);
      },
    ],
    holdMs: 1200,
  },
  {
    id: "08-wa-companion",
    label: "WhatsApp companion -> tap balance chip -> reply lands",
    url: `${BASE}/wa?as=takunda`,
    beats: [
      async (page) => {
        await page.waitForSelector("text=Svika", { timeout: 10000 });
        await page.waitForTimeout(800);
      },
      async (page) => {
        await page.locator("text=balance").first().click().catch(() => null);
        await page.waitForTimeout(2000);
      },
      async (page) => {
        await page.locator("text=kombi near me").first().click().catch(() => null);
        await page.waitForTimeout(2200);
      },
    ],
    holdMs: 1200,
  },
];

async function captureScene(scene: Scene): Promise<string> {
  const sceneOutDir = path.join(OUT_DIR, "_temp", scene.id);
  await fs.mkdir(sceneOutDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    recordVideo: { dir: sceneOutDir, size: { width: 393, height: 852 } },
  });
  const page = await ctx.newPage();
  await page.goto(scene.url);

  for (const beat of scene.beats) {
    await beat(page);
  }
  await page.waitForTimeout(scene.holdMs);

  await page.close();
  await ctx.close();
  await browser.close();

  // Playwright drops a single .webm in sceneOutDir
  const files = await fs.readdir(sceneOutDir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`no .webm produced for scene ${scene.id}`);

  const finalPath = path.join(OUT_DIR, `${scene.id}.webm`);
  await fs.rename(path.join(sceneOutDir, webm), finalPath);
  await fs.rm(sceneOutDir, { recursive: true, force: true });
  return finalPath;
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const scene of SCENES) {
    const out = await captureScene(scene);
    console.log(`[V3] captured ${scene.id} -> ${out}`);
  }
  // Clean up the temp dir if any stragglers
  await fs.rm(path.join(OUT_DIR, "_temp"), { recursive: true, force: true }).catch(() => null);
  console.log(`[V3] done. ${SCENES.length} clips in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Adapt the selectors if the actual V1 markup uses different testids or text labels. Prefer `data-testid` lookups over text where possible (more stable).

### Step 3: run the capture

```bash
pnpm tsx scripts/phase-V3-walkthrough-capture.ts
```

Expect ~3 to 6 minutes total runtime depending on Playwright launch overhead.

### Step 4: convert webm to mp4 (optional, only if ffmpeg is available)

Playwright outputs `.webm` (VP8 codec). NotebookLM and most video editors prefer `.mp4` (H.264). If ffmpeg is on PATH:

```bash
for f in video-assets/references/recordings/*.webm; do
  ffmpeg -y -i "$f" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "${f%.webm}.mp4"
done
```

If ffmpeg is missing, leave the webm files. They are usable as-is by NotebookLM and most editors. Note in the run report.

### Step 5: surface

List the resulting files:

```bash
ls -la video-assets/references/recordings/
```

Report each clip's filename and approximate duration (Playwright reports duration in stdout when verbose). Note any clip where the selector failed and the recording shows the resting state instead of the intended interaction.

### Step 6: commit

```bash
git add \
  scripts/phase-V3-walkthrough-capture.ts \
  docs/rebuild/V3-walkthrough-recordings-brief.md

git commit -m "chore: V3 walkthrough video capture script + recordings"
git push origin main
```

The `video-assets/references/recordings/*.webm` and `*.mp4` files are gitignored by the V2 block (`video-assets/generated/` and `video-assets/final/` are in .gitignore; recordings live under `references/` which IS tracked, so they DO get committed). If the recordings are large (>10 MB), add `video-assets/references/recordings/*.webm` and `*.mp4` to .gitignore and only commit the script.

## Stop conditions

- A selector misses repeatedly (e.g. the suburb picker text changed) and the clip captures only the resting state. Note in the report; we will re-record manually for that scene.
- ffmpeg is missing AND webm files are over 20 MB each. Note; we will convert in a different environment.
- Playwright cannot find chromium because the project has not run a browser test in a while. Run `pnpm exec playwright install chromium` before retrying.
- The `pnpm dev` server is not actually running, so all clips just show the Next.js error overlay. Surface and stop.

End of brief.
