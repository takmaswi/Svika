"use server";

import { revalidatePath } from "next/cache";

import { resolvePersona } from "@/lib/personas";
import { createServerClient } from "@/lib/supabase/server";
import type { TicketRow } from "@/lib/supabase/types";

import { parseWaCommand, type WaCommand } from "./commands";
import { WA_ANCHOR_LABEL, WA_ANCHOR_LAT, WA_ANCHOR_LNG, type WaReply } from "./types";

interface RunInput {
  persona_slug: string;
  text: string;
}

export async function runWaCommandAction(input: RunInput): Promise<WaReply> {
  const command = parseWaCommand(input.text);

  if (command.kind === "help") {
    return helpReply(command);
  }
  if (command.kind === "unknown") {
    return {
      ok: false,
      kind: "unknown",
      lines: [
        "Sorry, I didn't catch that.",
        "Try one of: balance · kombi near me · transfer 482 to +263700000011",
      ],
    };
  }
  if (command.kind === "balance") {
    return runBalance(input.persona_slug);
  }
  if (command.kind === "near") {
    return runNearestKombi();
  }
  if (command.kind === "transfer") {
    if (!command.access_code || !command.recipient_phone) {
      return {
        ok: false,
        kind: "transfer",
        lines: [command.reason ?? "Format: transfer 482 to +263700000011"],
      };
    }
    return runTransfer({
      persona_slug: input.persona_slug,
      access_code: command.access_code,
      recipient_phone: command.recipient_phone,
    });
  }
  return {
    ok: false,
    kind: command.kind,
    lines: ["Unsupported command."],
  };
}

function helpReply(_cmd: WaCommand): WaReply {
  return {
    ok: true,
    kind: "help",
    lines: [
      "Svika WhatsApp helper · 3 commands:",
      "1) *balance* — your wallet credit",
      "2) *kombi near me* — closest active kombi",
      "3) *transfer 482 to +263700000011* — send a ticket",
    ],
  };
}

async function runBalance(personaSlug: string): Promise<WaReply> {
  const persona = await resolvePersona(personaSlug, "passenger");
  const balance = Number(persona.credit_balance_usd ?? 0).toFixed(2);
  return {
    ok: true,
    kind: "balance",
    lines: [
      `Hi ${persona.name}, your Svika wallet has *$${balance}*.`,
      "Reply with *kombi near me* to find a ride or *transfer NNN to +263…* to share a ticket.",
    ],
    meta: { balance_usd: Number(balance) },
  };
}

async function runNearestKombi(): Promise<WaReply> {
  try {
    const client = await createServerClient();
    const { data, error } = await client.rpc("nearest_vehicles_to_point", {
      in_lat: WA_ANCHOR_LAT,
      in_lng: WA_ANCHOR_LNG,
      in_limit: 1,
    });
    if (error) {
      return {
        ok: false,
        kind: "near",
        lines: [`Could not check nearby kombis right now: ${error.message}`],
      };
    }
    const row = (data ?? [])[0];
    if (!row) {
      return {
        ok: true,
        kind: "near",
        lines: [
          `No active kombi within 30 minutes of ${WA_ANCHOR_LABEL}.`,
          "Try again once a driver pings the system.",
        ],
      };
    }
    const distanceKm = (row.distance_meters / 1000).toFixed(1);
    const seats = Math.max(0, row.capacity_seats - row.current_passenger_count);
    return {
      ok: true,
      kind: "near",
      lines: [
        `Closest to ${WA_ANCHOR_LABEL}: *${row.vehicle_id}* on ${row.route_name}.`,
        `~${distanceKm} km away · ETA ${row.estimated_minutes} min · ${seats} seats free.`,
      ],
      meta: {
        vehicle_id: row.vehicle_id,
        route_id: row.route_id,
        distance_meters: row.distance_meters,
        estimated_minutes: row.estimated_minutes,
      },
    };
  } catch (err) {
    return {
      ok: false,
      kind: "near",
      lines: [
        err instanceof Error ? err.message : "Lookup failed.",
      ],
    };
  }
}

interface TransferInput {
  persona_slug: string;
  access_code: string;
  recipient_phone: string;
}

async function runTransfer(input: TransferInput): Promise<WaReply> {
  const sender = await resolvePersona(input.persona_slug, "passenger");
  if (sender.role !== "passenger") {
    return { ok: false, kind: "transfer", lines: ["Only passengers can transfer tickets."] };
  }

  try {
    const client = await createServerClient();

    const { data: recipientData, error: recipientError } = await client
      .from("users")
      .select("id, name, phone, role")
      .eq("phone", input.recipient_phone)
      .maybeSingle();
    if (recipientError) {
      return { ok: false, kind: "transfer", lines: [recipientError.message] };
    }
    if (!recipientData) {
      return {
        ok: false,
        kind: "transfer",
        lines: [
          `${input.recipient_phone} is not on Svika yet.`,
          "Demo only supports the seeded users — try +263700000011 (Rudo).",
        ],
      };
    }
    if (recipientData.id === sender.id) {
      return { ok: false, kind: "transfer", lines: ["You cannot transfer a ticket to yourself."] };
    }

    const { data: ticketData, error: ticketError } = await client
      .from("tickets")
      .select("*")
      .eq("access_code", input.access_code)
      .eq("current_holder_user_id", sender.id)
      .in("status", ["issued", "held"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ticketError) {
      return { ok: false, kind: "transfer", lines: [ticketError.message] };
    }
    if (!ticketData) {
      return {
        ok: false,
        kind: "transfer",
        lines: [
          `No active ticket with code ${input.access_code} in your wallet.`,
          "Open the app and check the wallet for the right 3-digit code.",
        ],
      };
    }
    const ticket = ticketData as TicketRow;
    if (ticket.kind === "parcel") {
      return {
        ok: false,
        kind: "transfer",
        lines: ["Parcels cannot be transferred — only passenger tickets."],
      };
    }

    const { error: updateError } = await client
      .from("tickets")
      .update({ status: "transferred_pending" })
      .eq("id", ticket.id);
    if (updateError) {
      return { ok: false, kind: "transfer", lines: [updateError.message] };
    }

    const { error: insertError } = await client.from("transfers").insert({
      ticket_id: ticket.id,
      from_user_id: sender.id,
      to_user_id: recipientData.id,
      to_phone: recipientData.phone,
    });
    if (insertError) {
      return { ok: false, kind: "transfer", lines: [insertError.message] };
    }

    const recipientSlug = recipientData.name.toLowerCase().replace(/\s+/g, "_");
    const claimUrl = `/?as=${recipientSlug}&claim=${ticket.id}`;

    revalidatePath("/");
    revalidatePath("/wa");

    return {
      ok: true,
      kind: "transfer",
      lines: [
        `Sent ticket *${ticket.access_code}* to ${recipientData.name} (${recipientData.phone}).`,
        `They claim it here: ${claimUrl}`,
      ],
      meta: {
        ticket_id: ticket.id,
        access_code: ticket.access_code,
        recipient_id: recipientData.id,
        share_url: claimUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      kind: "transfer",
      lines: [err instanceof Error ? err.message : "Transfer failed."],
    };
  }
}
