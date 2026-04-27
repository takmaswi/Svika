import network from "@/seed/network.json" with { type: "json" };
import type { SeedNetwork } from "@/seed/schema";

const seed = network as unknown as SeedNetwork;

export type Cardinal = "north" | "south" | "east" | "west";

export interface TransferDetail {
  /** "Walk west on Lomagundi Road" */
  heading: string;
  /** Cardinal direction the walker should face — picks the matching arrow icon. */
  cardinal: Cardinal;
  /** Friendly note about the from-stop (e.g. "just alighted"). */
  from_note: string;
  /** Friendly note about the to-stop (e.g. "board next"). */
  to_note: string;
  /** Walking duration in minutes from the seed transfer record. */
  walking_duration_minutes: number;
  /** Walking distance in meters from the seed transfer record. */
  walking_distance_meters: number;
}

const ROAD_REGEX =
  /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Rd|Street|St|Avenue|Ave|Way|Drive))|(?:Lomagundi(?:\s+Road)?))\b/;

function deriveCardinal(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Cardinal {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  if (Math.abs(dLng) >= Math.abs(dLat)) {
    return dLng >= 0 ? "east" : "west";
  }
  return dLat >= 0 ? "north" : "south";
}

function roadFromNote(notes: string | undefined): string {
  if (!notes) return "the connection";
  const match = ROAD_REGEX.exec(notes);
  if (match) {
    return /Road$|Rd$/i.test(match[1])
      ? match[1].replace(/\bRd\b/, "Road")
      : match[1];
  }
  // Fallbacks for known transfer corridors with no road name in the notes.
  if (/cbd/i.test(notes)) return "the CBD";
  if (/rank/i.test(notes)) return "the ranks";
  return "the connection";
}

/**
 * Build a directional summary for the walking-transfer stage of a journey.
 *
 * Matches the from/to stop ids against `seed/network.json` transfer_points and
 * returns a tuple (heading copy, cardinal direction, contextual notes, walking
 * stats). When no transfer record is found we still produce a usable cardinal
 * direction by comparing the stop coordinates supplied by the journey loader.
 */
export function getTransferDetail(args: {
  from_stop_id: string;
  to_stop_id: string;
  fallback_from?: { lat: number; lng: number };
  fallback_to?: { lat: number; lng: number };
  fallback_walking_duration_minutes?: number;
}): TransferDetail | null {
  const transfer = seed.transfer_points.find(
    (t) => t.from_stop_id === args.from_stop_id && t.to_stop_id === args.to_stop_id,
  );

  let cardinal: Cardinal | null = null;
  let walkingDistance = transfer?.walking_distance_meters ?? null;
  let walkingMinutes =
    transfer?.walking_duration_minutes ?? args.fallback_walking_duration_minutes ?? null;

  if (transfer && transfer.walking_polyline.length >= 2) {
    const [a, b] = transfer.walking_polyline;
    cardinal = deriveCardinal(a[0], a[1], b[0], b[1]);
  } else if (args.fallback_from && args.fallback_to) {
    cardinal = deriveCardinal(
      args.fallback_from.lat,
      args.fallback_from.lng,
      args.fallback_to.lat,
      args.fallback_to.lng,
    );
  }

  if (!cardinal) cardinal = "west";
  if (walkingDistance === null) walkingDistance = 450;
  if (walkingMinutes === null) walkingMinutes = 6;

  const road = roadFromNote(transfer?.notes);
  const heading = "Walk " + cardinal + " on " + road;

  const isRankTransfer = transfer?.type === "rank_to_rank_walk";
  const from_note = isRankTransfer ? "alight at rank" : "just alighted";
  const to_note = isRankTransfer ? "board at next rank" : "board next";

  return {
    heading,
    cardinal,
    from_note,
    to_note,
    walking_duration_minutes: walkingMinutes,
    walking_distance_meters: walkingDistance,
  };
}
