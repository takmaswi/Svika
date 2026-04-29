# R5 — feat(R5): light theme primary + Hozaan palette + dark theme toggle

> Paste this whole document into Claude Code as one job. Same operating frame as R1/R2/R3: Auto Mode within `.claude/settings.local.json` allowlist, conventional commits to main, `pnpm typecheck && pnpm lint && pnpm build` after edits, no push until Cowork greenlights the rehearsal screenshots.

## Context

R1-R3 shipped a dark-only brand (commits `a63901d` → `663b7dc` → `1f8e267`). Takunda has reversed the brand decision based on Zimbabwe market fit: **light theme is now primary, dark is a toggle**. The teal/rust palette is fully retired. New palette is Hozaan-style — Apple-blue accent on white surfaces, with a charcoal `--color-surface-dark` token reserved for stat-card-style headers. Reference image at `branding/colour theme inspiration/`.

R5 is the foundational rebuild — every subsequent phase (R4.5 motion, R6 ride-hail flow, R7 polish) sits on the new palette. Everything currently using `--color-svika-teal*`, `--color-svika-rust*`, `--color-svika-salmon*`, `--color-svika-stone*` legacy aliases gets migrated.

## Locked decisions

- **Light theme = default.** `data-theme="light"` on `<html>` at first render unless `localStorage.svika-theme === "dark"` or the user has `prefers-color-scheme: dark` AND has not set a stored preference. After first render the user's explicit choice wins.
- **NO teal anywhere.** Retire `--color-svika-teal`, `--color-svika-teal-50` through `-900`, `--color-svika-rust`, `--color-svika-rust-light`, `--color-svika-rust-dark`, `--color-svika-salmon`, `--color-svika-salmon-light`, `--color-svika-bg`, `--color-svika-stone`, `--color-svika-stone-dark`, `--color-svika-ink`, `--color-svika-mute`, `--color-svika-line`, `--color-mark`, `--color-accent`. Replace every consumer.
- **Apple-blue accent** stays in both themes (`#007AFF`). Dark variant doesn't change the accent.
- **Charcoal stat-card surface** — new token `--color-surface-dark: #1F2937` for the small minority of surfaces that should look "inverse" in light mode (think the "Ride fare EGP 253" header card in the reference image). Used sparingly — most cards stay white.
- **Mapbox style swap** — light theme uses `mapbox://styles/mapbox/streets-v12`; dark theme uses `mapbox://styles/mapbox/dark-v11`. Style is set on `map.setStyle()` when the theme changes, with paint overrides re-applied after the `style.load` event.
- **Theme toggle** — exposed in the TabBar Account tab (one row in the PersonaDrawer-as-Account-screen) and as a small icon button on the landing page header. Sun/moon glyph.
- **Kombi SVG** stays as-is for now — its ivory body + dark windows reads on both themes well enough. R6 may revisit if the rust bumper accent clashes with the new palette (likely fine; it's a tiny detail).
- **Apple's iOS pattern**: `--color-action: #007AFF` reads on both light and dark. We don't fork the accent.

## Files to NOT touch in R5

- `seed/network.json`, `seed/loader.ts` (frozen)
- `supabase/migrations/*`
- `lib/sim/simRunner.ts`, `geometry.ts`, `densify.ts` (R4.5)
- `lib/passenger/journey.ts`, `journey-stage.ts`, `journey-types.ts`, `loadPassengerSurface.ts`
- `lib/passenger/actions.ts`, `simulate.ts`
- `lib/ai/*`
- `public/brand/kombi.svg` (keeps ivory body + tinted windows; works on both themes)

R5 is a palette + theme-system rebuild. **No business logic changes.**

---

## Step 1 — `app/globals.css` rewrite

Replace the entire `@theme { … }` block + the `html, body` block + every component-target block (`.svika-glass`, `.svika-glass-tab`, `.svika-sheet`, `.svika-persona-drawer`, etc.) with a theme-aware version.

### New `@theme` block

```css
@theme {
  /* === Theme-agnostic === */
  --color-action: #007AFF;
  --color-action-hover: #0A66D1;
  --color-action-disabled: rgba(0, 122, 255, 0.32);
  --color-action-soft: #E6F1FB;

  /* Reserved (currently unused in product code; retained as brand color) */
  --color-amber: #F59E0B;

  /* Live dot stays green */
  --color-live: #16a34a;

  /* Typography */
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  /* Radii */
  --radius-sm: 0.5rem;
  --radius: 0.875rem;
  --radius-lg: 1.375rem;

  /* Sheet snaps */
  --sheet-peek: 140px;
  --sheet-half: 48vh;
  --sheet-full: 92vh;
}
```

### Theme-variable blocks

```css
:root,
:root[data-theme="light"] {
  --color-bg: #FFFFFF;
  --color-surface: #F5F7FA;
  --color-surface-dark: #1F2937;       /* charcoal — for inverse stat-card headers */
  --color-ink: #0F172A;
  --color-ink-soft: #4B5563;
  --color-ink-mute: #94A3B8;
  --color-hairline: rgba(15, 23, 42, 0.08);
}

:root[data-theme="dark"] {
  --color-bg: #0a0a0c;
  --color-surface: #14141a;
  --color-surface-dark: #14141a;       /* same as surface in dark — no inverse needed */
  --color-ink: #ffffff;
  --color-ink-soft: rgba(255, 255, 255, 0.72);
  --color-ink-mute: rgba(255, 255, 255, 0.48);
  --color-hairline: rgba(255, 255, 255, 0.08);
}
```

### `html, body`

```css
html,
body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

### Glass utilities — theme-aware

The `.svika-glass`, `.svika-glass-strong`, `.svika-glass-tab` blocks need light + dark variants. Cleanest: define light fills as the default (under `:root`/`:root[data-theme="light"]`), then override under `:root[data-theme="dark"]`.

```css
/* Light theme glass — white surface with subtle backdrop blur */
.svika-glass {
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--color-hairline);
  border-radius: 22px;
  position: relative;
  isolation: isolate;
}
.svika-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% -20%,
    rgba(255, 255, 255, 0.5) 0%,
    transparent 60%
  );
}

.svika-glass-strong {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid var(--color-hairline);
  border-radius: 22px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08);
}

.svika-glass-tab {
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  border: 1px solid var(--color-hairline);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10);
}
```

```css
/* Dark theme overrides — re-use R1's dark glass values */
:root[data-theme="dark"] .svika-glass {
  background: rgba(20, 20, 26, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
:root[data-theme="dark"] .svika-glass::before {
  background: radial-gradient(
    ellipse at 50% -20%,
    rgba(255, 255, 255, 0.18) 0%,
    transparent 60%
  );
}
:root[data-theme="dark"] .svika-glass-strong {
  background: rgba(20, 20, 26, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.48);
}
:root[data-theme="dark"] .svika-glass-tab {
  background: rgba(14, 14, 18, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.48);
}
```

### Sheet primitive

```css
.svika-sheet {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border-top: 1px solid var(--color-hairline);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.10);
  /* keep existing transition / display / flex / overflow / touch-action */
}

.svika-sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.18);
}

:root[data-theme="dark"] .svika-sheet {
  background: rgba(20, 20, 26, 0.85);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.55);
}
:root[data-theme="dark"] .svika-sheet-handle {
  background: rgba(255, 255, 255, 0.22);
}
```

### Persona drawer

```css
.svika-persona-drawer {
  background: rgba(255, 255, 255, 0.97);
  border-inline-start: 1px solid var(--color-hairline);
  /* keep the rest of the existing block */
}
:root[data-theme="dark"] .svika-persona-drawer {
  background: rgba(20, 20, 26, 0.88);
  border-inline-start: 1px solid rgba(255, 255, 255, 0.07);
}
```

### Legacy alias retirement

After replacing the @theme block, search-and-destroy every reference to the old names. The grep targets:

```
--color-svika-teal
--color-svika-rust
--color-svika-salmon
--color-svika-stone
--color-svika-bg
--color-svika-ink
--color-svika-mute
--color-svika-line
--color-mark
--color-accent
bg-svika-teal
bg-svika-rust
bg-svika-salmon
bg-svika-stone
text-svika-teal
text-svika-rust
text-svika-salmon
text-svika-mute
text-svika-ink
border-svika-teal
border-svika-line
text-action       (if it's mapped via Tailwind to an old token)
```

For each match: replace the inline class / style with the new token name. Suggested mapping:

| Old | New |
|---|---|
| `text-svika-teal`, `text-svika-ink` | `style={{ color: "var(--color-ink)" }}` or `className="text-[var(--color-ink)]"` |
| `text-svika-mute` | `style={{ color: "var(--color-ink-mute)" }}` |
| `bg-svika-teal`, `bg-svika-stone-dark` | `style={{ backgroundColor: "var(--color-action)" }}` if it was a CTA, else `var(--color-surface)` |
| `bg-svika-rust` (CTAs) | `var(--color-action)` |
| `bg-svika-rust` (non-CTA accent — rare) | `var(--color-action)` or `var(--color-action-soft)` |
| `bg-svika-salmon` (FEATURED tags) | `var(--color-action)` with `--color-action-soft` background — featured tags drop salmon entirely |
| `border-svika-teal-100`, `border-svika-line` | `var(--color-hairline)` |
| `bg-svika-stone` (page background) | `var(--color-bg)` |

If a component reads two related teals (e.g. `text-svika-teal` for a heading and `text-svika-mute` for the caption), preserve the two-tier hierarchy with `--color-ink` + `--color-ink-mute`.

Run `pnpm typecheck && pnpm lint && pnpm build` after the @theme block is replaced; the legacy class references will surface as unknown utility classes in build (Tailwind v4 will treat them as missing). Fix component-by-component.

---

## Step 2 — theme attribute + toggle

### `app/layout.tsx`

Add an inline `<script>` in `<head>` that sets `data-theme` BEFORE the body renders, to avoid the FOUC on first load:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Svika — digital tickets, real revenue, same kombi",
  description:
    "Digital ticketing and trip-planning for Harare's informal kombi network. Transferable tickets, walking-transfer trip plans, real fleet revenue.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://svika.vercel.app"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FFFFFF",
};

const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('svika-theme');
    var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
    var theme = stored === 'dark' || stored === 'light' ? stored : system;
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

> The `data-theme="light"` static default on `<html>` is the SSR fallback; the inline script overrides it on first paint based on `localStorage` or `prefers-color-scheme`. This avoids a flash of light theme for users who prefer dark.

> `themeColor` is hardcoded to `#FFFFFF` (light primary) for the meta tag. Browsers don't need theme-aware metadata for the demo, and Next 16's `viewport.themeColor` doesn't have a clean dynamic API. Acceptable for the hackathon.

### New `components/passenger/ThemeToggle.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const v = document.documentElement.getAttribute("data-theme");
  return v === "dark" ? "dark" : "light";
}

function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("svika-theme", t);
  } catch {
    // ignore — quota / private mode
  }
}

interface ThemeToggleProps {
  /** Visual variant. "row" = full-width tile (drawer), "icon" = small button (header). */
  variant?: "row" | "icon";
}

export default function ThemeToggle({ variant = "row" }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const isDark = theme === "dark";
  const next: Theme = isDark ? "light" : "dark";

  const handleClick = (): void => {
    applyTheme(next);
    setTheme(next);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Switch to ${next} theme`}
        data-testid="svika-theme-toggle"
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        {isDark ? "☀" : "☾"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="svika-theme-toggle"
      className="svika-glass flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-ink)",
          }}
        >
          {isDark ? "Dark theme" : "Light theme"}
        </span>
        <span
          className="svika-meta mt-0.5 block"
          style={{ textTransform: "none", color: "var(--color-ink-mute)" }}
        >
          Tap to switch to {next}
        </span>
      </span>
      <span aria-hidden style={{ fontSize: "18px", color: "var(--color-action)" }}>
        {isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
```

> Glyph choice: `☀` (U+2600) and `☾` (U+263E) — universally rendered, no emoji asset needed. Replace with inline SVGs later if the rendering varies across Android browsers.

### Wire into PersonaDrawer + Landing

- In `components/passenger/PersonaDrawer.tsx`, add a `<ThemeToggle variant="row" />` under a new `<SectionHeader>Display</SectionHeader>` block, above the existing "Behind the scenes" section.
- In `app/(landing)/page.tsx` or whichever component renders the landing header, add `<ThemeToggle variant="icon" />` to the top-right corner of the hero.

---

## Step 3 — `components/PassengerMap.tsx` — theme-aware Mapbox style

The Mapbox style is set once at construction (R1 hardcoded `"mapbox://styles/mapbox/dark-v11"`). R5 needs to:

1. Read the current theme on construction.
2. Re-apply paint overrides on `style.load` (which fires on initial load AND on `setStyle`).
3. Listen for theme changes and call `map.setStyle(...)`.

```ts
// Near the top, with other module-scope helpers:
function readThemeAttr(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function mapStyleFor(theme: "light" | "dark"): string {
  return theme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/streets-v12";
}

// Light-theme paint overrides — softer than dark-v11's override set.
function lightPaintTunings(): Array<[string, string, string]> {
  return [
    ["water", "fill-color", "#DCE7F0"],
    ["landuse", "fill-color", "#EEF1EE"],
    // road-* in streets-v12 uses default warm grey; leave alone.
  ];
}

function darkPaintTunings(): Array<[string, string, string]> {
  return [
    ["road-primary", "line-color", "#3a4555"],
    ["road-secondary", "line-color", "#2f3a4a"],
    ["road-street", "line-color", "#2a3340"],
    ["road-major-link", "line-color", "#3a4555"],
    ["water", "fill-color", "#142028"],
    ["land", "background-color", "#0a0a0c"],
    ["landuse", "fill-color", "#1c2a1c"],
  ];
}
```

In the map constructor, replace the hardcoded style with `mapStyleFor(readThemeAttr())`.

In the existing `map.on("load", …)` callback, replace the hardcoded paint-tuning loop with:

```ts
function applyPaintTunings(currentTheme: "light" | "dark"): void {
  const tunings = currentTheme === "dark" ? darkPaintTunings() : lightPaintTunings();
  for (const [layerId, prop, value] of tunings) {
    if (map.getLayer(layerId)) {
      (map.setPaintProperty as (id: string, name: string, value: unknown) => void)(
        layerId, prop, value,
      );
    }
  }
  // Re-apply route line colors per theme.
  // Confirmed against the Hozaan reference image (public/branding/Colour theme inspiration.png):
  // the primary route line is bright Apple-blue in light theme. Use #007AFF in BOTH themes.
  const primaryColor = "#007AFF";
  const secondaryColor = currentTheme === "dark"
    ? "rgba(255, 255, 255, 0.45)"
    : "rgba(15, 23, 42, 0.30)";
  if (map.getLayer("svika-routes-base-primary")) {
    map.setPaintProperty("svika-routes-base-primary", "line-color", primaryColor);
  }
  if (map.getLayer("svika-routes-base")) {
    map.setPaintProperty("svika-routes-base", "line-color", secondaryColor);
  }
}

const currentTheme = readThemeAttr();
applyPaintTunings(currentTheme);
```

> Primary route line is Apple-blue (`#007AFF`) in **both** light and dark theme — matches the Hozaan reference. The user dot is also Apple-blue in both themes. The secondary (faint) route lines fork by theme: light uses ink-on-light at 0.30 alpha, dark uses white at 0.45 alpha.

### Theme-change listener

Add a `useEffect` that watches for `data-theme` attribute changes via MutationObserver and re-applies the style:

```ts
useEffect(() => {
  if (!mapRef.current) return;
  const observer = new MutationObserver(() => {
    const map = mapRef.current;
    if (!map) return;
    const newTheme = readThemeAttr();
    map.setStyle(mapStyleFor(newTheme));
    map.once("style.load", () => {
      applyPaintTunings(newTheme);
      // Re-add R1/R2 sources + layers — setStyle wipes them.
      // Use existing helpers from the load callback.
      // Easiest: refactor the load body into a `mountAllSources(map)` function
      // and call it both on initial load and after setStyle's style.load.
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}, []);
```

> **Important caveat**: `map.setStyle()` removes ALL custom sources and layers (routes, stops, kombis, user dot, walker if present). The theme-change handler must re-mount them. Refactor the existing `map.on('load', …)` body into a reusable `mountAllSources(map)` function that the initial load AND the theme-change handler both call. The sim broadcast handler and the per-vehicle interp buffer keep working because they're independent of the style.

---

## Step 4 — component-by-component palette migration

For each file in the list below, search for legacy `svika-*` Tailwind classes and inline tokens, replace with the new system.

**Passenger surface:**
- `components/passenger/PassengerShell.tsx`
- `components/passenger/JourneySheet.tsx`
- `components/passenger/JourneySheetContent.tsx`
- `components/passenger/IdleSheetContent.tsx` (already partially uses new tokens; complete the migration)
- `components/passenger/TripPreviewCard.tsx` (partial)
- `components/passenger/PaymentChoiceSheet.tsx` (partial)
- `components/passenger/PlanList.tsx` (partial)
- `components/passenger/Wallet.tsx` (full migration — was light-card on white today; now must work on light theme cleanly + gain a dark variant)
- `components/passenger/TopUpSheet.tsx` (full)
- `components/passenger/ParcelSheet.tsx` (full)
- `components/passenger/PersonaDrawer.tsx` (already partially uses new tokens; complete + add ThemeToggle row)
- `components/passenger/Journey.tsx` (rust residue cleanup — Simulate-boarding CTA, walk icons, ETA pill — flip rust → Apple-blue)
- `components/passenger/SearchBar.tsx`
- `components/passenger/SearchHero.tsx`
- `components/passenger/EmptyHero.tsx` (if still in tree)
- `components/passenger/FareClearedToast.tsx`
- `components/passenger/FleetImpactCard.tsx`
- `components/passenger/PersonaActionSheet.tsx` (if still in tree — likely unused since R3.8)
- `components/passenger/TabBar.tsx` (R1 — restyle for light, glass tokens already use the new system once globals.css is rewritten)

**Landing:**
- `app/(landing)/page.tsx`
- `components/PersonaPicker.tsx` (if still imported)
- `components/LandingHero.tsx`

**Conductor:**
- `components/conductor/ConductorShell.tsx`
- `components/conductor/PinKeypad.tsx`
- `components/conductor/RouteHeaderMap.tsx`

**Fleet:**
- `components/fleet/FleetShell.tsx`
- `components/fleet/VehicleCard.tsx`
- `components/fleet/AuditPanel.tsx` (English/Shona toggle pills — use `--color-action-soft` background for the active pill)
- `components/fleet/ZimraCard.tsx`
- `components/fleet/EmergencyContactsCard.tsx`

**WhatsApp companion:**
- `app/wa/WaClient.tsx` — keep WhatsApp-green (`#dcf8c6` `.wa-bubble`) for outgoing message bubbles since it's WhatsApp's brand, not ours. Restyle the chrome around it (header, suggestion chips, input field) to the new palette.

**Other:**
- `app/ussd-mock/*` — Nokia menu mock, leave green-on-black as is (it's intentionally retro).

For each component:
1. Open the file.
2. Find every `bg-svika-*`, `text-svika-*`, `border-svika-*`, `from-svika-*` Tailwind class.
3. Replace per the mapping table in step 1.
4. Verify with `pnpm build` that no missing utility errors remain.
5. Visually check the component renders correctly on `pnpm dev` light theme; flip to dark via the toggle, verify it still reads.

---

## Step 5 — validate

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Self-correct any errors. Common failure modes:
- `bg-svika-teal` or similar still in some component → Tailwind v4 errors out → grep + replace.
- Missing `svika-glass-tab` because you removed the rule but kept the class reference — re-add the rule.
- TypeScript errors from `ThemeToggle` if the variant prop isn't typed.

### Step 5a — write `scripts/phase-R5-rehearsal.ts`

This script does NOT exist yet — write it as part of R5. Model it after the existing `scripts/phase-D-rehearsal.ts` (Playwright + chromium, headed, drives the local dev server, screenshots into `scripts/phase-R5-rehearsal-{N}.png`). Required because Cowork must eyeball palette before push, and `.gitignore:48` keeps the PNGs local — committing the `.ts` driver alongside the brief is the only way to reproduce the capture later.

Skeleton:

```ts
// scripts/phase-R5-rehearsal.ts
// Drive localhost:3000 across the 10 R5 rehearsal frames.
// Pre-req: pnpm dev + pnpm sim:start running in two other terminals.
// Run: pnpm tsx scripts/phase-R5-rehearsal.ts

import { chromium, type Page } from "playwright";

const BASE = process.env.SVIKA_REHEARSAL_BASE ?? "http://localhost:3000";

async function snap(page: Page, n: number, label: string): Promise<void> {
  const path = `scripts/phase-R5-rehearsal-${n}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[R5] ${n} · ${label} · ${path}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, // iPhone 14 Pro
  });
  const page = await ctx.newPage();

  // 1. Idle, light theme
  await page.goto(`${BASE}/?as=takunda`);
  await page.waitForSelector('[data-testid="passenger-shell"]', { timeout: 15000 });
  await page.waitForTimeout(2500); // let map tiles paint
  await snap(page, 1, "idle-light");

  // 2. Account tab open, light
  await page.click('[data-testid="tabbar-account"]');
  await page.waitForTimeout(600);
  await snap(page, 2, "account-drawer-light");

  // 3. Theme toggle tap (light → dark mid-animation)
  await page.click('[data-testid="svika-theme-toggle"]');
  await page.waitForTimeout(900);
  await snap(page, 3, "theme-toggle-fired");

  // 4. Idle, dark
  await page.click('[data-testid="tabbar-home"]');
  await page.waitForTimeout(1200);
  await snap(page, 4, "idle-dark");

  // Flip back to light for the rest
  await page.click('[data-testid="tabbar-account"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="svika-theme-toggle"]');
  await page.waitForTimeout(600);
  await page.click('[data-testid="tabbar-home"]');
  await page.waitForTimeout(900);

  // 5. Trip preview — Avondale quick pick
  await page.click('text=Avondale Shops');
  await page.waitForTimeout(900);
  await snap(page, 5, "trip-preview-light");

  // 6. Payment-choice
  await page.click('text=Continue');
  await page.waitForTimeout(700);
  await snap(page, 6, "payment-choice-light");

  // 7. Wallet drawer
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.click('[data-testid="tabbar-account"]');
  await page.waitForTimeout(400);
  await page.click('text=Wallet');
  await page.waitForTimeout(700);
  await snap(page, 7, "wallet-light");

  // 8. /hwindi
  await page.goto(`${BASE}/hwindi?as=farai`);
  await page.waitForSelector('[data-testid="hwindi-pin-keypad"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await snap(page, 8, "hwindi-light");

  // 9. /fleet
  await page.goto(`${BASE}/fleet?as=baba_tino`);
  await page.waitForTimeout(2200);
  await snap(page, 9, "fleet-light");

  // 10. /wa
  await page.goto(`${BASE}/wa?as=takunda`);
  await page.waitForTimeout(900);
  await snap(page, 10, "wa-light");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Adapt selectors to whatever testids are actually live in the codebase — the skeleton's `tabbar-home` / `tabbar-account` may need tightening to match the R1 `TabBar.tsx` markup. If a click target shifts after migration, prefer `getByRole` + accessible name over CSS classes.

### Step 5b — capture

In two terminals:

```bash
pnpm dev
pnpm sim:start
```

Then in a third:

```bash
pnpm tsx scripts/phase-R5-rehearsal.ts
```

Verify all 10 PNGs land in `scripts/phase-R5-rehearsal-{1..10}.png` and surface their paths in the reply.

### Step 5c — what each frame should show (visual checklist for self-review)

1. **Idle, light theme** — passenger surface, white/light-grey base, Apple-blue user dot, **Apple-blue route line**, two quick picks visible.
2. **Account tab open, light theme** — PersonaDrawer with Wallet / Top up / Send a parcel / Display (theme toggle visible) / Behind the scenes / About / GitHub.
3. **Theme toggle tap** — page flips to dark theme without navigation. Mapbox style swap visible (streets-v12 → dark-v11).
4. **Idle, dark theme** — same surface as #1 but dark, route line still Apple-blue.
5. **Trip preview, light** — Avondale tap → trip preview card on light surface.
6. **Payment-choice, light** — Apple-blue primary CTA on light glass.
7. **Wallet drawer, light** — wallet tickets on white cards (was light-on-white before R5 too; now consistent with brand).
8. **/hwindi, light** — conductor keypad on light surface, Apple-blue Enter.
9. **/fleet, light** — fleet dashboard, audit panel + ZIMRA card readable.
10. **/wa, light** — chrome restyled, WhatsApp-green outgoing bubbles preserved.

If time allows, capture the same set in dark theme too (`-dark` suffix). Otherwise just confirm the toggle works visually and dark renders without gross visual breakage in the Account / passenger idle / hwindi screens.

Surface all screenshot paths in your reply.

---

## Step 6 — commit + push (only after Cowork greenlights)

Narrow staging:

```bash
# globals.css + layout + theme + maps + every migrated component
git add \
  app/globals.css \
  app/layout.tsx \
  components/PassengerMap.tsx \
  components/passenger/ThemeToggle.tsx \
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
  app/\(landing\)/page.tsx \
  app/wa/WaClient.tsx \
  scripts/phase-R5-rehearsal.ts \
  docs/rebuild/R5-brief.md \
  docs/BUILD-LOG.md

# Backfill the R3 SHA placeholder while editing BUILD-LOG.
# In docs/BUILD-LOG.md, replace "<NEW_SHA>" on the R3 line (added in commit 1f8e267) with "1f8e267".

git status      # confirm narrow staging — exclude any unrelated drift
git commit -m "feat(R5): light theme primary + dark toggle + Hozaan palette"
git push origin main
```

PNGs stay local (`.gitignore:48`).

## Step 7 — append to `docs/BUILD-LOG.md`

```
2026-04-29 | R5 | Color scheme rebuild: light theme primary, dark theme as toggle. Retired all --color-svika-teal/-rust/-salmon/-stone legacy aliases. New palette per branding/colour theme inspiration: --color-bg #FFFFFF, --color-surface #F5F7FA, --color-surface-dark #1F2937 (charcoal stat headers), --color-ink #0F172A, --color-action #007AFF (shared across themes). data-theme attribute switch on <html> with FOUC-preventing inline bootstrap script in app/layout.tsx (reads localStorage svika-theme then falls back to prefers-color-scheme). New components/passenger/ThemeToggle.tsx (row variant in PersonaDrawer, icon variant on landing header). PassengerMap setStyle swap streets-v12 ↔ dark-v11 with mountAllSources re-runs on style.load. All four surfaces (passenger, /hwindi, /fleet, /wa) migrated; Wallet/TopUpSheet/ParcelSheet/Journey rust residue cleaned up. WhatsApp-green outgoing bubble preserved on /wa. Backfilled R3 BUILD-LOG SHA placeholder to 1f8e267 in same edit | <NEW_SHA> | local-rehearsal
```

## Stop conditions

- A component imports a legacy token that's used in a way the mapping table above doesn't cover (e.g. a gradient mixing teal-100 and rust-light) — surface and ask.
- The Mapbox style swap on theme change loses sources permanently (mountAllSources doesn't fire correctly on `style.load`) — surface and ask.
- The light theme renders the kombi SVG poorly (ivory body too low-contrast on light streets-v12 base) — surface; we may need a dark-outlined variant of the kombi for light theme.
- WhatsApp-green outgoing bubbles look wrong against the dark-theme chrome — surface; we may need a darker outgoing-bubble variant in dark theme.
- Otherwise run all the way through to commit + push + BUILD-LOG.

End of brief.
