"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { runWaCommandAction } from "@/lib/wa/actions";

type Side = "in" | "out";

interface Bubble {
  id: string;
  side: Side;
  lines: string[];
  /** Tick mark style — only meaningful on the user's outgoing bubbles. */
  delivered?: boolean;
  ts: string;
}

interface WaClientProps {
  personaSlug: string;
  personaName: string;
  initialBalanceUsd: number;
}

const SUGGESTIONS = [
  "balance",
  "kombi near me",
  "transfer 482 to +263772000002",
];

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * WhatsApp-style client. Three commands routed through a server action that
 * hits the real database. The bubble styling intentionally mirrors WhatsApp's
 * green-bubble palette so the demo reads as a plausible companion app.
 */
export default function WaClient({
  personaSlug,
  personaName,
  initialBalanceUsd,
}: WaClientProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => [
    {
      id: newId(),
      side: "in",
      ts: nowHHMM(),
      lines: [
        `Hello ${personaName}. I'm Svika's WhatsApp helper.`,
        `Wallet: $${initialBalanceUsd.toFixed(2)}.`,
        "Tap a chip below or type one of: balance · kombi near me · transfer NNN to +PHONE.",
      ],
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [bubbles]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userBubble: Bubble = {
      id: newId(),
      side: "out",
      ts: nowHHMM(),
      lines: [trimmed],
      delivered: false,
    };
    setBubbles((prev) => [...prev, userBubble]);
    setInput("");

    startTransition(async () => {
      const reply = await runWaCommandAction({
        persona_slug: personaSlug,
        text: trimmed,
      });
      setBubbles((prev) => {
        const next = prev.map((b) =>
          b.id === userBubble.id ? { ...b, delivered: true } : b,
        );
        next.push({
          id: newId(),
          side: "in",
          ts: nowHHMM(),
          lines: reply.lines,
        });
        return next;
      });
    });
  }

  return (
    <div
      className="flex h-dvh w-full flex-col bg-[#ece5dd]"
      data-testid="wa-shell"
      data-phase="phase-4"
    >
      <header className="flex items-center gap-3 bg-[#075e54] px-3 py-2 text-white shadow">
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#128c7e] text-base font-semibold"
        >
          S
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Svika</span>
          <span className="text-[11px] opacity-80">+263 77 X SVIKA · online</span>
        </div>
        <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider">
          Companion
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(rgba(7,94,84,0.04) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
        data-testid="wa-stream"
      >
        <ul className="mx-auto flex max-w-md flex-col gap-2">
          {bubbles.map((b) => (
            <li
              key={b.id}
              className={`flex ${b.side === "out" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  b.side === "out"
                    ? "bg-[#dcf8c6] text-[#0b3a36]"
                    : "bg-white text-[#0b3a36]"
                }`}
                data-side={b.side}
                data-testid={b.side === "in" ? "wa-bubble-in" : "wa-bubble-out"}
              >
                {b.lines.map((line, i) => (
                  <p
                    key={i}
                    className={i > 0 ? "mt-1" : undefined}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {line}
                  </p>
                ))}
                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                  <span>{b.ts}</span>
                  {b.side === "out" ? (
                    <span aria-hidden>{b.delivered ? "✓✓" : "✓"}</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
          {pending ? (
            <li className="flex justify-start">
              <div className="rounded-lg bg-white px-3 py-2 text-xs text-[#667781] shadow-sm">
                Svika is typing…
              </div>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-black/5 bg-[#f0f0f0] px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-1.5" data-testid="wa-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={pending}
              className="rounded-full border border-[#075e54]/15 bg-white px-2.5 py-1 text-[11px] text-[#075e54] hover:bg-[#dcf8c6] disabled:opacity-50"
              data-testid={`wa-chip-${s.split(" ")[0]}`}
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Svika"
            className="flex-1 rounded-full border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#075e54]/30"
            disabled={pending}
            aria-label="Message"
            data-testid="wa-input"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#075e54] text-white shadow disabled:opacity-50"
            aria-label="Send"
            data-testid="wa-send"
          >
            <span aria-hidden>➤</span>
          </button>
        </form>
      </div>
    </div>
  );
}
