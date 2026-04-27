import type { WaCommandKind } from "./commands";

// "Hardcoded current location" per CLAUDE.md → Phase 4 task list. Bannockburn
// Rd North Terminus, where Takunda starts his demo journey. Everything snaps
// to this anchor for "kombi near me" so the conversation reads consistently.
export const WA_ANCHOR_LAT = -17.7498;
export const WA_ANCHOR_LNG = 31.0425;
export const WA_ANCHOR_LABEL = "Mt Pleasant Heights";

export type WaReply =
  | {
      ok: true;
      kind: Exclude<WaCommandKind, "unknown">;
      lines: string[];
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      kind: WaCommandKind;
      lines: string[];
    };
