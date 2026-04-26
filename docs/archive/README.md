# Archive — v0 planning artefacts

These three documents are the original Svika vision drafts from 2026-04-03, before the hackathon scope was locked. They represent a much more ambitious system (closed-loop wallet, dual-OTP parcels, edge functions, monorepo split, real WhatsApp Business integration) that was then deliberately scoped down to the current Tier 1 / Tier 2 / Tier 3 split.

## Files

- [`v0-vision-pitch.md`](v0-vision-pitch.md) — original "National Mobility Operating System" pitch
- [`v0-implementation-roadmap.md`](v0-implementation-roadmap.md) — original monorepo file tree + chronological phases
- [`v0-technical-stack.md`](v0-technical-stack.md) — original architectural directives, schema, financial RPCs

## Why kept

Useful for post-submission roadmap planning. Each Tier 3 feature in [`../ROADMAP.md`](../ROADMAP.md) traces back to a more detailed design idea here.

## Why archived

The autonomous build agent reads `docs/` as the source of truth. These files contradict locked decisions in `CLAUDE.md` and would pull the build off-course if treated as current.

**Anything implemented from these files belongs only on the post-submission roadmap, not in the hackathon code.**
