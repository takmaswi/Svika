# R1 — feat(R1): new design tokens + dark map + tab-bar shell

> Paste this whole document into Claude Code as one job. Run under Auto Mode (or `acceptEdits`) within the existing `.claude/settings.local.json` allowlist. Self-correct typecheck errors as they appear. End with one conventional commit and `git push origin main`. Stop after Takunda has confirmed the local rehearsal screenshots look right.

## Context

This is the first of six rebuild phases (R1–R6) pivoting Svika's passenger surface to a Bolt/inDrive-inspired **dark map + iOS liquid glass + Apple-blue accent** brand, with a 3-tab floating-island bottom bar replacing the persona drawer. The booking flow content can stay visually rough at this phase — R1 is **chrome, brand tokens, and tab-bar nav only**. R2 fixes the map content (3 kombis, zoom-to-user, pulsing dot). R3 fixes the booking flow (two quick picks, trip preview, payment-choice). R4 adds the walking animation. R5 restyles `/fleet`, `/hwindi`, `/wa`. R6 polishes and warms narratives for recording.

Operating envelope: per `CLAUDE.md` "Auto Mode operating envelope" + "Hackathon exceptions" — direct commits to main are permitted; conventional-commit messages required; `pnpm typecheck` + `pnpm lint` + `pnpm build` after every meaningful edit; honest BUILD-LOG entry after the prod-curl marker check.

## What lands in R1

1. New `@theme` block + helper utilities in `app/globals.css` (dark surfaces, Apple-blue accent, white-with-alpha ink ramp). Old teal/rust/salmon tokens removed.
2. New liquid-glass utility classes (`.svika-glass`, `.svika-glass-strong`, `.svika-glass-tab`) with `backdrop-filter: blur(24px) saturate(1.7)`, a top-edge specular highlight, and a 1px hairline inner stroke.
3. `app/layout.tsx` `themeColor` flipped from `#0a4b5c` to `#0a0a0c`.
4. `components/PassengerMap.tsx` Mapbox base switched from `streets-v12` to `dark-v11` with `setPaintProperty` overrides for road / water / park inside `map.on('load', …)`.
5. New `components/passenger/TabBar.tsx` — floating-island 3-tab bottom bar (Home / Rides / Account) with `data-testid="svika-tab-bar"`.
6. `components/passenger/PassengerShell.tsx` — header element removed entirely; `personaDrawerOpen` state stays, now driven by the Account-tab tap; Rides-tab tap opens the existing `Wallet` drawer; Home-tab is the default.
7. `--sheet-peek` raised from `110px` to `140px` so the JourneySheet at peek doesn't crash into the floating tab bar.

## Files to NOT touch in R1

- `seed/network.json`, `seed/loader.ts` (R2 owns the load-time vehicle override)
- `supabase/migrations/*`
- `lib/passenger/actions.ts` (server-action shapes locked)
- `lib/sim/simRunner.ts` (broadcast pipeline locked)
- `lib/passenger/journey.ts`, `journey-stage.ts`, `loadPassengerSurface.ts` (R2 owns the surface filter)
- `lib/passenger/simulate.ts` (R4 owns the walking branch)
- `lib/ai/*`
- `app/(landing)/page.tsx` — landing stays as it is for now
- `app/hwindi/*`, `app/fleet/*`, `app/wa/*` and their components — that's R5
- `components/passenger/PersonaDrawer.tsx` — kept in tree, kept functional, just rewired so the only entry point is the Account tab
- Booking-flow visuals (PaymentChoiceSheet, IdleSheetContent, PlanList, TopUpSheet, ParcelSheet) — leave alone in R1. Their old teal/rust styling against the new dark tokens **will look wrong**; that is expected and is R3's job to fix.

---

## Step 1 — replace the `@theme` block in `app/globals.css`

Replace the existing `@theme { … }` block (currently at lines 8–59) with the block below, **and replace the `html, body` block immediately after it** so the page background flips to near-black. Also raise `--sheet-peek` from `110px` to `140px` (it lives inside `@theme`).

```css
@theme {
  /* Surfaces */
  --color-bg: #0a0a0c;
  --color-surface: #14141a;

  /* Ink ramp — white with alpha */
  --color-ink: #ffffff;
  --color-ink-soft: rgba(255, 255, 255, 0.72);
  --color-ink-mute: rgba(255, 255, 255, 0.48);
  --color-hairline: rgba(255, 255, 255, 0.08);

  /* Accent — Apple blue, the only accent in the rebuild */
  --color-action: #007AFF;
  --color-action-hover: #0A66D1;
  --color-action-disabled: rgba(0, 122, 255, 0.32);

  /* Live dot stays green for the "kombis on the road" affordance */
  --color-live: #16a34a;

  /* Typography */
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  /* Radii */
  --radius-sm: 0.5rem;
  --radius: 0.875rem;
  --radius-lg: 1.375rem;

  /* Sheet snaps — peek raised from 110px to 140px to clear the tab bar */
  --sheet-peek: 140px;
  --sheet-half: 48vh;
  --sheet-full: 92vh;
}

html,
body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

### Type ramp

The existing `.svika-display`, `.svika-headline`, `.svika-body`, `.svika-meta`, `.svika-mono-code` classes stay — they're size/weight only, palette-agnostic. **Update `.svika-display` `font-size` from `28px` to `32px`** to match the rebuild ramp. Leave the other sizes as-is.

### Liquid-glass utilities

Replace the existing `.svika-glass` and `.svika-glass-strong` definitions (currently around lines 128–145) with:

```css
.svika-glass {
  background: rgba(20, 20, 26, 0.55);
  backdrop-filter: blur(24px) saturate(1.7);
  -webkit-backdrop-filter: blur(24px) saturate(1.7);
  border: 1px solid rgba(255, 255, 255, 0.06);
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
    rgba(255, 255, 255, 0.18) 0%,
    transparent 60%
  );
}

.svika-glass-strong {
  background: rgba(20, 20, 26, 0.7);
  backdrop-filter: blur(28px) saturate(1.7);
  -webkit-backdrop-filter: blur(28px) saturate(1.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  position: relative;
  isolation: isolate;
}
.svika-glass-strong::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% -20%,
    rgba(255, 255, 255, 0.22) 0%,
    transparent 60%
  );
}

/* Tab-bar variant — slightly stronger blur, a touch more opaque,
   tighter highlight so it reads as a floating "island" rather than
   a translucent panel. */
.svika-glass-tab {
  background: rgba(14, 14, 18, 0.62);
  backdrop-filter: blur(30px) saturate(1.8);
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 24px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.48);
  position: relative;
  isolation: isolate;
}
.svika-glass-tab::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% -10%,
    rgba(255, 255, 255, 0.14) 0%,
    transparent 55%
  );
}
```

> These values are starting points. After the local rehearsal, tune empirically against a real Android phone before final commit. Frame drops on a low-end Android → fall back to a flat dark panel for the JourneySheet body only; keep glass on the tab bar and any header chips.

### Sheet primitive — re-skin to dark

The existing `.svika-sheet` block (around lines 248–268) currently uses `rgba(255,255,255,0.92)`. Replace those white values with the dark-glass equivalents:

```css
.svika-sheet {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 30;
  background: rgba(20, 20, 26, 0.85);
  backdrop-filter: blur(28px) saturate(1.7);
  -webkit-backdrop-filter: blur(28px) saturate(1.7);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.55);
  /* … keep the rest (transition, display, flex-direction, overflow, touch-action) … */
}

.svika-sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}
```

The `.svika-persona-drawer` block at the bottom of the file should also flip to dark-glass: replace `rgba(250, 250, 249, 0.96)` with `rgba(20, 20, 26, 0.88)` and the border-inline-start to `rgba(255,255,255,0.07)`.

> **Anything inside the existing globals.css that references the old `--color-svika-*` tokens by name will break compilation** (Tailwind v4 + the `bg-svika-teal` etc. utility classes). Two parts to handle:
> - The `@theme` block above no longer defines those names, so the utilities will fail. **Re-add the names you still need as legacy aliases at the bottom of the new `@theme` block, mapped to the new palette so consumer components don't break in R1.** Specifically: `--color-svika-teal`, `--color-svika-mute`, `--color-svika-line`, `--color-svika-bg`, `--color-svika-rust`, `--color-svika-ink` — map each to its closest new token (most go to `--color-ink`, `--color-ink-mute`, `--color-hairline`, `--color-bg`, or `--color-action`). R3/R5 will purge these aliases as components are rewritten. Don't try to delete them in R1.

---

## Step 2 — `app/layout.tsx` themeColor

Change `themeColor: "#0a4b5c"` → `themeColor: "#0a0a0c"`.

---

## Step 3 — `components/PassengerMap.tsx` Mapbox dark + paint overrides

At line 563, change:

```ts
style: "mapbox://styles/mapbox/streets-v12",
```

to:

```ts
style: "mapbox://styles/mapbox/dark-v11",
```

Then inside the existing `map.on('load', …)` callback (find it via the surrounding code that adds `svika-routes-base`, `svika-routes-highlight`, etc.), **after** the existing layer setup, add this guarded block:

```ts
// R1: paint overrides for dark-v11. The dark-v11 style ships its own
// layer ids — log them once at dev time and confirm each id below
// exists. setPaintProperty against a missing layer no-ops silently.
const tunings: Array<[string, string, string]> = [
  ["road-primary", "line-color", "#3a4555"],
  ["road-secondary", "line-color", "#2f3a4a"],
  ["road-street", "line-color", "#2a3340"],
  ["road-major-link", "line-color", "#3a4555"],
  ["water", "fill-color", "#142028"],
  ["land", "background-color", "#0a0a0c"],
  ["landuse", "fill-color", "#1c2a1c"],
];
for (const [layerId, prop, value] of tunings) {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, prop as never, value);
  }
}
```

> **Important**: dark-v11 layer ids may not match exactly what's listed above. **Open the browser dev tools on the running dev server and run `console.log(map.getStyle().layers.map(l => l.id))` once** to enumerate the live layer ids, and adjust the strings above to match. Don't assume; verify. The `if (map.getLayer(layerId))` guard means a wrong id is harmless but a wrong id also means the override never lands.

Leave the route + stop + kombi symbol layers alone in R1. The rust route line (`RUST` constant inside the file) will look out of place against the dark base — that's expected; R2 changes it.

---

## Step 4 — new `components/passenger/TabBar.tsx`

Create the file. Three tabs (Home / Rides / Account) as a floating island, ~64px tall, ~16px from the screen edges, glass background using `.svika-glass-tab`. Active tab uses `--color-action` filled icon + label; inactive tabs use `--color-ink-mute` outlined.

```tsx
"use client";

import type { ReactNode } from "react";

export type TabKey = "home" | "rides" | "account";

interface TabBarProps {
  active: TabKey;
  onChange: (next: TabKey) => void;
  ridesBadge?: number; // active ticket count, optional
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const TABS: TabConfig[] = [
  {
    key: "home",
    label: "Home",
    icon: (active) => (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false"
        fill={active ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    key: "rides",
    label: "Rides",
    icon: (active) => (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false"
        fill={active ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "account",
    label: "Account",
    icon: (active) => (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false"
        fill={active ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth={active ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
];

export default function TabBar({ active, onChange, ridesBadge }: TabBarProps) {
  return (
    <nav
      data-testid="svika-tab-bar"
      aria-label="Primary"
      className="svika-glass-tab fixed bottom-4 left-4 right-4 z-40 flex h-16 items-center justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            data-testid={`svika-tab-${tab.key}`}
            aria-current={isActive ? "page" : undefined}
            className="relative flex h-full flex-1 flex-col items-center justify-center gap-1 transition-opacity active:opacity-80"
            style={{
              color: isActive
                ? "var(--color-action)"
                : "var(--color-ink-mute)",
            }}
          >
            {tab.icon(isActive)}
            <span
              style={{
                fontSize: "10px",
                fontWeight: isActive ? 600 : 500,
                letterSpacing: "0.3px",
              }}
            >
              {tab.label}
            </span>
            {tab.key === "rides" && ridesBadge && ridesBadge > 0 ? (
              <span
                aria-label={`${ridesBadge} active tickets`}
                className="absolute right-[28%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1"
                style={{
                  backgroundColor: "var(--color-action)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                {ridesBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
```

---

## Step 5 — wire `TabBar` into `PassengerShell.tsx`, remove header

Open `components/passenger/PassengerShell.tsx`.

**A.** Add the TabBar import alongside the other component imports near the top:

```ts
import TabBar, { type TabKey } from "@/components/passenger/TabBar";
```

**B.** Add a tab state next to the other `useState` hooks (look near the cluster including `personaDrawerOpen`):

```ts
const [activeTab, setActiveTab] = useState<TabKey>("home");
```

**C.** Delete the entire `<header className="z-20 border-b border-svika-line bg-svika-bg/85 px-4 py-3 backdrop-blur">…</header>` block at the top of the returned JSX (currently around lines 459–510-ish — it includes the persona-chip-tap button, the "More" caret, and the Wallet button).

**D.** Below the existing `<PassengerMap … />` and `<JourneySheet … />` mounts, but **before** the `<PersonaDrawer … />` mount, insert:

```tsx
<TabBar
  active={activeTab}
  ridesBadge={activeCount}
  onChange={(next) => {
    setActiveTab(next);
    if (next === "rides") {
      setWalletOpen(true);
      setPersonaDrawerOpen(false);
    } else if (next === "account") {
      setPersonaDrawerOpen(true);
      setWalletOpen(false);
    } else {
      setWalletOpen(false);
      setPersonaDrawerOpen(false);
    }
  }}
/>
```

**E.** When the user closes Wallet or PersonaDrawer (via the existing close handlers `closeWallet`, `setPersonaDrawerOpen(false)` etc.), reset `activeTab` to `"home"` so the tab indicator stays honest. Add to the existing `closeWallet`:

```ts
function closeWallet() {
  setWalletOpen(false);
  setActiveTab("home");
}
```

And inside `<PersonaDrawer onClose={…}>` find the existing close-handler call site and change it to also reset the tab:

```ts
onClose={() => {
  setPersonaDrawerOpen(false);
  setActiveTab("home");
}}
```

**F.** In the same file, remove the `<main className="flex min-h-dvh flex-col bg-svika-bg">` border + spacing now that the header is gone — the map should be edge-to-edge top. Replace `min-h-dvh flex-col` with the existing pattern used elsewhere in the project for full-viewport map layouts (the map container is already `absolute inset-0` per the Phase 4.5 fix). If `bg-svika-bg` is referenced as a class name and now resolves to `--color-bg` (near-black) via the legacy alias, leave it. If you removed the alias above, replace `bg-svika-bg` with `bg-[var(--color-bg)]`.

**G.** **Don't** rip out the `personaDrawerOpen` state or the PersonaDrawer mount. Both stay; they're now just driven by the Account tab instead of the persona-chip-tap button. PersonaDrawer's content (Wallet / Top up / Send a parcel / Behind the scenes / About / GitHub) is fine for R1 — it'll get redesigned in R3 or R5 into a proper Account screen.

---

## Step 6 — validate

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Fix any errors that surface — most likely candidates: removed legacy palette tokens that some component still imports as a Tailwind class, or a TypeScript error from the new TabBar prop types. **Self-correct without prompting** unless the error suggests a real architecture conflict.

Then in two terminals:

```bash
pnpm dev
pnpm sim:start
```

Drive `http://localhost:3000/?as=takunda` at viewport 390×844 and capture four rehearsal screenshots in `scripts/phase-R1-rehearsal-{1..4}.png`:

1. **Idle** — map dark, no header, floating tab bar at bottom, Home tab active. The booking content (sheet at peek with "Where to, Takunda?") may look stylistically out of place against the dark map; that's expected.
2. **Account-tab tap** — PersonaDrawer slides in from the right with its existing tile list.
3. **Rides-tab tap** — Wallet opens (existing component) full-screen.
4. **Map detail** — zoomed out, water and roads use the dark-v11 paint overrides, no light beige.

Surface the four screenshot paths in your reply so Cowork can visually check them.

---

## Step 7 — commit + push (only after Takunda confirms the screenshots)

```bash
git add -A
git commit -m "feat(R1): new design tokens + dark map + tab-bar shell"
git push origin main
```

Surface the `..NEW_SHA` line in your reply.

---

## Step 8 — append to `docs/BUILD-LOG.md`

After `git push` returns, append a single line to `docs/BUILD-LOG.md`:

```
2026-04-28 | R1 | Brand tokens flipped to dark + glass + Apple-blue, Mapbox base switched to dark-v11 with paint overrides, header removed from passenger surface, new components/passenger/TabBar.tsx floating-island bottom bar (Home/Rides/Account), PersonaDrawer kept in tree and reachable via Account tab, --sheet-peek raised to 140px to clear the tab bar | <commit-sha> | local-rehearsal
```

Cowork (the verifying agent) will append the prod-curl and screenshot evidence as a follow-up entry once `data-testid="svika-tab-bar"` is live on prod.

---

## Stop conditions

- Stop and ask only if `pnpm build` fails with an error that suggests a real architectural conflict (e.g., a component imports a deleted token in a way you can't trivially alias around).
- If the dark map tiles don't load on the dev server, it likely means the public Mapbox token is missing the `styles:read` scope for `dark-v11` — surface the issue and stop; Takunda will widen the token.
- Otherwise, run all the way through to commit + push + BUILD-LOG.

End of brief.
