# V1 — feat(V1): video brand pass + location-first home

> Paste this whole document into Claude Code as one job. Same operating frame as R5: Auto Mode within `.claude/settings.local.json` allowlist, conventional commits to main, `pnpm typecheck && pnpm lint && pnpm build` after edits, no push until Cowork greenlights the rehearsal screenshots.

## Why this exists

We are submitting a 3-minute hackathon video by 2026-04-30 23:59 CAT. The video is two halves. The first 2 minutes is animated marketing in the v2 brand (Forest, Bone, Signal, DM Sans, IBM Plex). The last 1 minute is screen capture of the live app. The two halves cannot look like different products. So the live app needs the v2 brand applied across all four surfaces, and the home screen needs to match the location-first design principle that just landed in `docs/PRODUCT-REQUIREMENTS.md`.

V1 is the foundation for the recording. It is NOT a refactor and NOT a feature add. Every change is in service of the recording.

## Locked decisions

### Palette (v2 brand, retiring R5 light + Apple blue)

```
--color-forest   #1F4D2E   primary CTA, primary ink, primary surface
--color-pine     #0E3A1E   pressed states
--color-char     #0E1A12   body copy
--color-bone     #FFFCEF   page background, light surface
--color-linen    #E9E2C8   muted surface (cards, sheet bg)
--color-signal   #E84C30   accent, live indicator, key verbs
--color-moss     #4D5C44   muted text
```

Core four: Forest, Bone, Signal, Linen.

Mapping from R5 to V1:

| R5 token | V1 token |
|---|---|
| `--color-action #007AFF` | `--color-forest #1F4D2E` |
| `--color-action-hover #0A66D1` | `--color-pine #0E3A1E` |
| `--color-bg #FFFFFF` | `--color-bone #FFFCEF` |
| `--color-surface #F5F7FA` | `--color-linen #E9E2C8` |
| `--color-surface-dark #1F2937` | `--color-forest #1F4D2E` |
| `--color-ink #0F172A` | `--color-char #0E1A12` |
| `--color-ink-soft #4B5563` | `--color-moss #4D5C44` |
| `#007AFF` (literal anywhere in components) | `var(--color-forest)` |

### Typography (retiring Geist)

- Display: **DM Sans 700** for headlines, the wordmark voice. SIL OFL 1.1 licensed, on Google Fonts.
- Body: **IBM Plex Sans** for paragraphs and UI. SIL OFL 1.1, Google Fonts.
- Mono: **IBM Plex Mono** for codes, fares, timestamps. SIL OFL 1.1, Google Fonts.

Imported via `next/font/google` in `app/layout.tsx`. Geist + Geist Mono are removed.

### Logo

Replace the existing wordmark with the v2 logo from `public/branding/v2/`. The "S" is rendered as a road curve with two pin markers (origin + destination). The wordmark "svika" is lowercase next to it.

The v2 brand assets live at `public/branding/v2/Svika Brand.html` and `public/branding/v2/logos.jsx`. Extract the wordmark and logo glyph as standalone SVG files and write them to `public/brand/v2/wordmark.svg` and `public/brand/v2/logo.svg`. If the v2 source uses inline JSX rather than SVG, render it once via a small extract script and save the resulting SVG markup.

### Dark theme: removed for V1

The video is light-theme only. Drop the ThemeToggle from PersonaDrawer and from the landing header. Keep the `data-theme` attribute infrastructure in `app/layout.tsx` for now (cheap to keep, easy to delete later) but the user-facing surfaces never expose the toggle. `:root[data-theme="dark"]` block can stay in `app/globals.css` but does not need updating; users cannot trigger it.

### Home screen: location-first

The user-facing landing at `/` does NOT show a "Continue as Takunda" CTA anymore. The persona system stays in code (the hackathon `/?as=takunda` deep links keep working for direct surface access and recording cutaways), but the landing flow is location-first per `docs/PRODUCT-REQUIREMENTS.md` "Design principles":

1. Landing hero: v2 logo, wordmark, single tagline "Find your kombi.", and one CTA button "Find kombis near me."
2. Tap CTA → `navigator.geolocation.getCurrentPosition()`.
3. On success → redirect to `/?as=takunda&lat={lat}&lng={lng}` so the persona stays wired and the location is carried as URL params.
4. On denial / failure → suburb picker modal opens. Hardcoded demo list (centroids approximate, good enough for the recording):

```ts
const DEMO_SUBURBS = [
  { name: "Mount Pleasant Heights", lat: -17.7498, lng: 31.0425 },
  { name: "Avondale", lat: -17.7811, lng: 31.0388 },
  { name: "Mbare", lat: -17.8514, lng: 31.0367 },
  { name: "Glen View", lat: -17.8847, lng: 31.0036 },
  { name: "Borrowdale", lat: -17.7400, lng: 31.0900 },
  { name: "Harare CBD", lat: -17.8278, lng: 31.0500 },
];
```

5. User picks one → same redirect with `lat` + `lng` from the picker.

### Live data filter

When the passenger surface receives a location, the kombi-position broadcast filters to vehicles within a 5 km bounding box of that location. Implementation in `components/PassengerMap.tsx`:

```ts
const BBOX_RADIUS_KM = 5;

function withinBbox(
  vehicleLat: number, vehicleLng: number,
  centerLat: number, centerLng: number,
  radiusKm: number,
): boolean {
  // Approximate: 1 deg lat = 111 km, 1 deg lng at -17 deg lat = ~106 km.
  const dLat = Math.abs(vehicleLat - centerLat) * 111;
  const dLng = Math.abs(vehicleLng - centerLng) * 106;
  return dLat <= radiusKm && dLng <= radiusKm;
}
```

Apply this filter on every kombi-source `setData` call. Initial passenger surface load (`lib/passenger/loadPassengerSurface.ts`) also filters the seed vehicles by the bbox if location params are present. If absent, fall back to the existing R2 corridor filter so direct deep links like `/?as=takunda` still work without location.

## Files to NOT touch

- `seed/network.json`, `seed/loader.ts` (frozen)
- `supabase/migrations/*`
- `lib/sim/simRunner.ts`, `lib/sim/geometry.ts`, `lib/mapbox/densify.ts` (R4.5 logic)
- `lib/passenger/journey.ts`, `journey-stage.ts`, `journey-types.ts`
- `lib/passenger/actions.ts`, `simulate.ts`
- `lib/conductor/actions.ts`, `lib/conductor/state.ts`
- `lib/fleet/*`
- `lib/wa/*`
- `lib/ai/*`
- `public/brand/kombi.svg` (the top-down Hiace SVG — keep its existing artwork; only the rust accent lines may need a darker stroke if they read poorly on Bone, decide visually)
- `components/PassengerMap.tsx` Phase 4.5 motion / interp / RAF logic (touch only the colors and the location-filter code path)

V1 is a brand + home rebuild. **No backend changes. No business logic changes. No new tables.**

---

## Step 1 — `app/globals.css` rewrite

Replace the entire `@theme { ... }` block plus the `html, body` block plus every component-target block (`.svika-glass`, `.svika-glass-strong`, `.svika-glass-tab`, `.svika-sheet`, `.svika-persona-drawer`) with the V1 version below.

### New `@theme` block

```css
@theme {
  /* Brand (v2) */
  --color-forest: #1F4D2E;
  --color-pine: #0E3A1E;
  --color-char: #0E1A12;
  --color-bone: #FFFCEF;
  --color-linen: #E9E2C8;
  --color-signal: #E84C30;
  --color-moss: #4D5C44;

  /* Typography (next/font sets the actual variable values; these are the cascade names) */
  --font-display: var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-ibm-plex-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-ibm-plex-mono), ui-monospace, monospace;

  /* Radii + sheet snaps (unchanged from R5) */
  --radius-sm: 0.5rem;
  --radius: 0.875rem;
  --radius-lg: 1.375rem;
  --sheet-peek: 140px;
  --sheet-half: 48vh;
  --sheet-full: 92vh;
}
```

### Theme-variable block (light only)

```css
:root,
:root[data-theme="light"] {
  --color-bg: var(--color-bone);
  --color-surface: var(--color-linen);
  --color-surface-dark: var(--color-forest);
  --color-ink: var(--color-char);
  --color-ink-soft: var(--color-moss);
  --color-ink-mute: rgba(14, 26, 18, 0.55);
  --color-hairline: rgba(14, 26, 18, 0.10);

  --color-action: var(--color-forest);
  --color-action-hover: var(--color-pine);
  --color-action-soft: rgba(31, 77, 46, 0.10);

  --color-accent: var(--color-signal);
  --color-live: var(--color-signal);
}
```

Leave the existing `:root[data-theme="dark"]` block in place but do not update it. It is not reachable from V1's UI.

### `html, body`

```css
html, body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

### Glass utilities (light, on Bone)

```css
.svika-glass {
  background: rgba(255, 252, 239, 0.85);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--color-hairline);
  border-radius: 22px;
  position: relative;
  isolation: isolate;
}

.svika-glass-strong {
  background: rgba(255, 252, 239, 0.94);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid var(--color-hairline);
  border-radius: 22px;
  box-shadow: 0 4px 18px rgba(14, 26, 18, 0.08);
}

.svika-glass-tab {
  background: rgba(255, 252, 239, 0.96);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  border: 1px solid var(--color-hairline);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(14, 26, 18, 0.10);
}
```

### Sheet primitive

```css
.svika-sheet {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 30;
  background: rgba(255, 252, 239, 0.96);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border-top: 1px solid var(--color-hairline);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  box-shadow: 0 -8px 24px rgba(14, 26, 18, 0.10);
  /* keep existing transition / display / flex / overflow / touch-action lines */
}

.svika-sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: rgba(14, 26, 18, 0.18);
}
```

### Persona drawer

```css
.svika-persona-drawer {
  background: rgba(255, 252, 239, 0.97);
  border-inline-start: 1px solid var(--color-hairline);
  /* keep the rest of the existing block */
}
```

### Legacy alias retirement

After the new tokens land, search and replace every reference to the R5 / R3 tokens. Grep targets:

```
--color-action: #007AFF
--color-action-hover: #0A66D1
--color-action-soft: #E6F1FB
#007AFF   (literal in any component)
#0A66D1
#E6F1FB
--color-svika-teal
--color-svika-rust
--color-svika-salmon
--color-svika-stone
--color-svika-bg
--color-svika-ink
--color-svika-mute
--color-svika-line
bg-svika-teal
bg-svika-rust
bg-svika-salmon
text-svika-teal
text-svika-rust
text-svika-mute
border-svika-teal
border-svika-line
```

For each match: replace per the mapping table at the top of this brief. Run `pnpm typecheck && pnpm lint && pnpm build` after the @theme rewrite. Tailwind v4 will surface unknown utility classes as build errors. Fix them component by component.

---

## Step 2 — typography swap (`app/layout.tsx`)

Replace the existing Geist imports with DM Sans + IBM Plex Sans + IBM Plex Mono via `next/font/google`:

```tsx
import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Svika — find your kombi",
  description:
    "Live kombi map, digital tickets, and bilingual fleet revenue for Harare's informal transit network.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://svika.vercel.app"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FFFCEF",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body
        className={`${dmSans.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

For every headline element that should use DM Sans, set `style={{ fontFamily: "var(--font-display)" }}` or use a Tailwind v4 utility mapped to `--font-display`. Body text inherits IBM Plex Sans from the body tag. Codes / fares / timestamps explicitly set `style={{ fontFamily: "var(--font-mono)" }}`.

The metadata `title` description has a single em dash. **Replace with a comma**: `"Svika, find your kombi"`. The CLAUDE.md hackathon rule allows existing dashes in old code, but new strings we write should follow the no-dash convention.

---

## Step 3 — logo swap

Steps:

1. Open `public/branding/v2/Svika Brand.html` in a browser or read its inline JSX (`public/branding/v2/logos.jsx`). Identify the wordmark (lowercase "svika") and the logo glyph (the "S" road curve with two pin markers).
2. Save them as standalone SVG files at:
   - `public/brand/v2/wordmark.svg`
   - `public/brand/v2/logo.svg`
3. If the v2 source is React JSX rather than raw SVG, hand-write the SVG by inspecting the JSX output once in a browser, copying the rendered `<svg>` markup from devtools, and saving it.
4. Replace every reference to the existing wordmark and logo:
   - `app/(landing)/page.tsx` (or wherever the landing hero lives)
   - `components/passenger/TabBar.tsx` if it shows brand mark
   - Any header, footer, or metadata image reference
5. Update `public/branding/landing-hero.png` if used, or keep it for now and let the new landing hero be a clean composition with the SVG logo over a Bone background.

---

## Step 4 — home screen rework (`app/(landing)/page.tsx`)

Rewrite the landing entirely. Reference layout:

```
+---------------------------------------+
|                                       |
|             [logo svg]                |
|                                       |
|             svika                     |
|                                       |
|        Find your kombi.               |
|                                       |
|    [ Find kombis near me ]            |
|                                       |
|        or pick a suburb               |
|                                       |
+---------------------------------------+
       Built in Harare. 2026.
```

Behaviour:

1. On mount, render the brand hero (logo, wordmark, tagline). DM Sans 700 for "svika", IBM Plex Sans for "Find your kombi.".
2. The CTA button is a Forest-filled rounded-corner pill, Bone text, IBM Plex Sans 600 weight. Min height 56px, generous horizontal padding.
3. Below the CTA, a small text link: "or pick a suburb". This opens the suburb picker modal directly.
4. CTA tap behaviour:
   ```ts
   if (typeof navigator === "undefined" || !navigator.geolocation) {
     openSuburbPicker();
     return;
   }
   navigator.geolocation.getCurrentPosition(
     (pos) => {
       const { latitude, longitude } = pos.coords;
       window.location.href = `/?as=takunda&lat=${latitude}&lng=${longitude}`;
     },
     () => openSuburbPicker(),
     { timeout: 8000, enableHighAccuracy: false },
   );
   ```
5. Suburb picker is a centered modal on Bone background with the six demo suburbs as tappable rows. Each row shows the suburb name in IBM Plex Sans 600. On tap:
   ```ts
   window.location.href = `/?as=takunda&lat=${suburb.lat}&lng=${suburb.lng}`;
   ```
6. Footer line at the bottom: "Built in Harare. 2026." in IBM Plex Sans 400, color `var(--color-moss)`.

Remove the existing "Continue as Takunda" CTA and the persona-deep-link footer. The hackathon `/?as=` deep links continue working but are not surfaced in the user UI.

Direct deep links into `/hwindi` and `/fleet` for recording cutaways: keep these reachable by URL (no UI change required). For the recording, the operator just navigates to the URL directly when the cutaway is needed.

---

## Step 5 — `components/PassengerMap.tsx` location filtering

Two surgical changes. Do NOT touch the Phase 4.5 motion / interp / RAF code.

### Change 1: read location from URL params

Near the top of `PassengerShell.tsx` or whichever component reads `searchParams`:

```ts
const searchParams = useSearchParams();
const lat = parseFloat(searchParams.get("lat") ?? "");
const lng = parseFloat(searchParams.get("lng") ?? "");
const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
```

Pass `lat`, `lng`, `hasLocation` down to `PassengerMap` as props.

### Change 2: bbox filter in PassengerMap

In the broadcast handler that calls `setData` on the kombi GeoJSON source, add the bbox filter before the `setData` call. Existing R2 corridor filter stays as a fallback when no location is present.

```ts
const BBOX_RADIUS_KM = 5;

function withinBbox(
  vehicleLat: number, vehicleLng: number,
  centerLat: number, centerLng: number,
  radiusKm: number,
): boolean {
  const dLat = Math.abs(vehicleLat - centerLat) * 111;
  const dLng = Math.abs(vehicleLng - centerLng) * 106;
  return dLat <= radiusKm && dLng <= radiusKm;
}

const filtered = hasLocation
  ? vehicles.filter((v) =>
      withinBbox(
        v.current_position.lat, v.current_position.lng,
        lat, lng, BBOX_RADIUS_KM,
      ),
    )
  : vehicles; // fall back to existing R2 corridor filter or whatever is there now
```

### Change 3: initial map center

Replace the hardcoded R2 Bannockburn center with `[lng, lat]` when location is present, otherwise keep the R2 fallback. Initial zoom: 14 when location is present, otherwise 13.5 (existing R2 value).

### Change 4: empty-state UI

If `filtered.length === 0`, show a small unobtrusive message overlaying the map: "No kombis nearby right now." Bone background pill with IBM Plex Sans 500 text in `--color-moss`. Auto-dismisses when at least one kombi enters the bbox.

For the demo, with the seed's 8 vehicles spread across 4 routes and Mt Pleasant Heights as the test suburb, 2 kombis (ZH 4821 + ZH 4822 on the Heights to Rezende route) should always be inside the 5 km bbox. Verify visually during rehearsal.

---

## Step 6 — component palette migration

For every component in the list below, search for R5 tokens and replace per the mapping table. After each file, run `pnpm typecheck` to catch breaks.

**Passenger surface:**
- `components/passenger/PassengerShell.tsx`
- `components/passenger/JourneySheet.tsx`
- `components/passenger/JourneySheetContent.tsx`
- `components/passenger/IdleSheetContent.tsx`
- `components/passenger/TripPreviewCard.tsx`
- `components/passenger/PaymentChoiceSheet.tsx`
- `components/passenger/PlanList.tsx`
- `components/passenger/Wallet.tsx`
- `components/passenger/TopUpSheet.tsx`
- `components/passenger/ParcelSheet.tsx`
- `components/passenger/PersonaDrawer.tsx` (remove the ThemeToggle row)
- `components/passenger/Journey.tsx`
- `components/passenger/SearchBar.tsx`
- `components/passenger/SearchHero.tsx`
- `components/passenger/EmptyHero.tsx` (if still in tree)
- `components/passenger/FareClearedToast.tsx`
- `components/passenger/FleetImpactCard.tsx`
- `components/passenger/TabBar.tsx` (Forest tab indicator on Bone)
- `components/passenger/ThemeToggle.tsx` (delete the file or leave unimported)

**Landing:**
- `app/(landing)/page.tsx` (full rewrite per Step 4)
- `components/LandingHero.tsx` (replaced by inline composition in landing page or rewritten)
- `components/PersonaPicker.tsx` (delete or leave unimported)
- `components/PersonaActionSheet.tsx` (delete or leave unimported)

**Conductor:**
- `components/conductor/ConductorShell.tsx`
- `components/conductor/PinKeypad.tsx` (Forest Enter button, Bone digit pads on Linen frame)
- `components/conductor/RouteHeaderMap.tsx`

**Fleet:**
- `components/fleet/FleetShell.tsx`
- `components/fleet/VehicleCard.tsx`
- `components/fleet/AuditPanel.tsx` (English / Shona toggle pills use `var(--color-action-soft)` for active state)
- `components/fleet/ZimraCard.tsx`
- `components/fleet/EmergencyContactsCard.tsx`

**WhatsApp companion:**
- `app/wa/WaClient.tsx` (preserve WhatsApp green `#dcf8c6` for outgoing bubbles since it is WhatsApp's brand, not ours; restyle the chrome around it)

**Skipped:**
- `app/ussd-mock/*` (intentionally retro Nokia menu, leave green-on-black)

For each component:
1. Find every `bg-svika-*`, `text-svika-*`, `border-svika-*` Tailwind class. Replace with inline `style={{ ... }}` using the new tokens, or with Tailwind v4 utilities mapped to the new names.
2. Find every literal hex (`#007AFF`, `#0A66D1`, `#E6F1FB`, `#FFFFFF` for backgrounds, `#F5F7FA` for surfaces, `#0F172A` for text, `#1F2937` for surface-dark). Replace per the mapping table.
3. Find every `var(--color-action)` etc. — these stay because the alias still resolves; the underlying value is now Forest.
4. Verify the component renders cleanly on `pnpm dev`.

---

## Step 7 — validate + rehearsal

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Self-correct any errors. Common failure modes:
- Tailwind v4 errors on missing utility classes (legacy `svika-*` references not replaced)
- TypeScript errors from removing `ThemeToggle` while it is still imported somewhere
- `next/font` errors if the weight array does not include 400 for body text
- Geolocation API errors on localhost without HTTPS (for browser test, use `127.0.0.1` not `localhost`, or manually deny and use the suburb picker fallback)

### Rehearsal script

Create `scripts/phase-V1-rehearsal.ts` modelled after `scripts/phase-R5-rehearsal.ts`. Drive these 8 frames:

1. Landing hero (`/`) — v2 logo + wordmark + Forest CTA
2. Suburb picker open — modal showing 6 suburbs
3. Tap Mount Pleasant Heights → redirect to `/?as=takunda&lat=...&lng=...` — passenger surface idle, map centered on Heights
4. Trip preview — Avondale quick pick on the Lomagundi walking transfer
5. Wallet drawer
6. Conductor at `/hwindi?as=farai` — keypad on v2 brand
7. Fleet at `/fleet?as=baba_tino` — ZIMRA card and audit panel readable
8. WhatsApp companion at `/wa?as=takunda` — chrome restyled, green outgoing bubbles preserved

Run:

```bash
pnpm dev
pnpm sim
pnpm tsx scripts/phase-V1-rehearsal.ts
```

Surface the 8 PNG paths in the reply for Cowork visual review.

---

## Step 8 — commit + push (only after Cowork greenlights)

Narrow staging:

```bash
git add \
  app/globals.css \
  app/layout.tsx \
  app/\(landing\)/page.tsx \
  components/PassengerMap.tsx \
  components/passenger/PassengerShell.tsx \
  components/passenger/JourneySheet.tsx \
  components/passenger/JourneySheetContent.tsx \
  components/passenger/IdleSheetContent.tsx \
  components/passenger/TripPreviewCard.tsx \
  components/passenger/PaymentChoiceSheet.tsx \
  components/passenger/PlanList.tsx \
  components/passenger/Wallet.tsx \
  components/passenger/TopUpSheet.tsx \
  components/passenger/ParcelSheet.tsx \
  components/passenger/PersonaDrawer.tsx \
  components/passenger/Journey.tsx \
  components/passenger/SearchBar.tsx \
  components/passenger/SearchHero.tsx \
  components/passenger/FareClearedToast.tsx \
  components/passenger/FleetImpactCard.tsx \
  components/passenger/TabBar.tsx \
  components/conductor/ConductorShell.tsx \
  components/conductor/PinKeypad.tsx \
  components/conductor/RouteHeaderMap.tsx \
  components/fleet/FleetShell.tsx \
  components/fleet/VehicleCard.tsx \
  components/fleet/AuditPanel.tsx \
  components/fleet/ZimraCard.tsx \
  components/fleet/EmergencyContactsCard.tsx \
  components/LandingHero.tsx \
  app/wa/WaClient.tsx \
  public/brand/v2/wordmark.svg \
  public/brand/v2/logo.svg \
  scripts/phase-V1-rehearsal.ts \
  docs/rebuild/V1-brief.md \
  docs/BUILD-LOG.md

git status   # confirm narrow staging, exclude any unrelated drift
git commit -m "feat(V1): video brand pass + location-first home"
git push origin main
```

Wait for Vercel to ship. Poll `https://svika.vercel.app/` until response contains the v2 marker (e.g. the new wordmark filename `/brand/v2/wordmark.svg` or the string `Find kombis near me`). Capture two prod screenshots.

## Step 9 — append to `docs/BUILD-LOG.md`

```
2026-04-30 | V1 | Video brand pass + location-first home. Retired R5 Apple-blue palette in favor of v2 Forest/Bone/Signal/Linen. Typography swap Geist -> DM Sans 700 (display), IBM Plex Sans (body), IBM Plex Mono (codes). New v2 logo + wordmark from public/branding/v2/. Landing rewritten: removed Continue as Takunda CTA in favor of location-first flow with geolocation API fallback to a 6-suburb picker (Mt Pleasant Heights, Avondale, Mbare, Glen View, Borrowdale, Harare CBD). PassengerMap filters live kombi positions to a 5 km bounding box around the chosen location; falls back to R2 corridor filter when no location params present. ThemeToggle removed from user-facing UI; dark theme infrastructure left in code but unreachable. All four surfaces (passenger, /hwindi, /fleet, /wa) migrated. WhatsApp green outgoing bubbles preserved on /wa. | <SHA> | local-rehearsal+prod-curl
```

## Stop conditions

- A component uses an inline color literal or token combination that the mapping table does not cover. Surface and ask.
- The geolocation API hangs on localhost in a way that breaks the rehearsal. Fall back to suburb picker and document.
- Mapbox `streets-v12` reads poorly on Bone background (warm streets, warm Bone). If the basemap looks washed out, surface and we may need a custom Mapbox style URL or paint-property tweaks.
- The v2 logo SVG cannot be cleanly extracted from the v2 source files. Surface and we will hand-author it.
- A font weight requested by an existing component is not in the imported weights array. Add the weight; re-run.
- The location filter produces zero kombis on a chosen suburb that the demo plans to rehearse. Surface; we may need to nudge the seed positions.

End of brief.
