/**
 * Phase 4 — WhatsApp companion command parser.
 *
 * Three commands the demo cares about: balance, kombi near me, transfer.
 * For literal forms ("balance", "kombi near me", "transfer 482 to +263…")
 * we match heuristically — fast, predictable, no model call required.
 * For free-form sentences ("how much money do I have?") we fall through
 * to aiClient.understand and use confidence + notes to route.
 *
 * The intent shape on the way out is small on purpose so the action layer
 * can hand-roll the database calls without reading a dozen optional fields.
 */

export type WaCommandKind = "balance" | "near" | "transfer" | "help" | "unknown";

export interface WaCommand {
  kind: WaCommandKind;
  raw_text: string;
  /** Only set for transfer. Three digits, validated. */
  access_code?: string;
  /** Only set for transfer. E.164 form, validated. */
  recipient_phone?: string;
  /** Reason the parser bailed; surfaced to the user as a help hint. */
  reason?: string;
}

const PHONE_RE = /(\+\d{6,15})/;
const TRIPLE_DIGIT_RE = /\b(\d{3})\b/;

function normalisePhone(input: string): string | null {
  const stripped = input.replace(/[\s\-()]/g, "");
  if (/^\+\d{6,15}$/.test(stripped)) return stripped;
  // Allow 0-prefixed Zimbabwe numbers ("0772000002") and rewrite to +263.
  if (/^0\d{9,12}$/.test(stripped)) {
    return `+263${stripped.slice(1)}`;
  }
  return null;
}

/**
 * Pure heuristic parser. Returns `unknown` rather than throwing so the action
 * layer can decide whether to fall through to the model.
 */
export function parseWaCommand(rawText: string): WaCommand {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { kind: "help", raw_text: rawText, reason: "Empty message." };
  }
  const lower = trimmed.toLowerCase();

  // help / menu
  if (lower === "help" || lower === "menu" || lower === "?" || lower === "/start") {
    return { kind: "help", raw_text: rawText };
  }

  // balance — accept "balance", "bal", "credit", "how much"
  if (
    lower === "balance" ||
    lower === "bal" ||
    lower === "credit" ||
    /^(what|how)\s+(is|much).*(balance|credit|money)/.test(lower) ||
    /^my\s+(balance|credit)/.test(lower)
  ) {
    return { kind: "balance", raw_text: rawText };
  }

  // kombi near me
  if (
    /^kombi\s+near(\s+me)?$/.test(lower) ||
    /^near(by|est)?\s+kombi/.test(lower) ||
    /^where\s+is\s+(the\s+)?(nearest\s+)?kombi/.test(lower) ||
    /^find\s+(me\s+)?(a\s+)?kombi/.test(lower)
  ) {
    return { kind: "near", raw_text: rawText };
  }

  // transfer NNN to +PHONE  (or "send NNN", "give NNN")
  if (/^(transfer|send|give|share)\b/.test(lower)) {
    const codeMatch = trimmed.match(TRIPLE_DIGIT_RE);
    const phoneRaw = trimmed.match(PHONE_RE)?.[1];
    const phone = phoneRaw ? normalisePhone(phoneRaw) : null;

    // Allow "transfer 482 to 0772000002" — pick up the second triple/long-digit
    // token as a phone if no +country prefix was used.
    let phoneFallback: string | null = phone;
    if (!phoneFallback) {
      const looseDigits = trimmed.match(/\b(0\d{9,12})\b/)?.[1];
      if (looseDigits) phoneFallback = normalisePhone(looseDigits);
    }

    if (!codeMatch) {
      return {
        kind: "transfer",
        raw_text: rawText,
        reason: "Tell me which 3-digit code to transfer (e.g. 482).",
      };
    }
    if (!phoneFallback) {
      return {
        kind: "transfer",
        raw_text: rawText,
        access_code: codeMatch[1],
        reason: "Tell me the receiver's phone (e.g. +263772000002).",
      };
    }
    return {
      kind: "transfer",
      raw_text: rawText,
      access_code: codeMatch[1],
      recipient_phone: phoneFallback,
    };
  }

  return {
    kind: "unknown",
    raw_text: rawText,
    reason: "Try: balance · kombi near me · transfer 482 to +263772000002",
  };
}
