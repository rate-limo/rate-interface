/**
 * Live activity ticker — pure helpers.
 *
 * Two event kinds, from two different sources with two different natures:
 *
 * - **Trades** arrive over the WebSocket the market page already subscribes to
 *   (`spot.trades.subscribe.pairs.all` → `spot-recent-overall-trades-update`). They are
 *   frequent and genuinely live.
 * - **Creations** have no socket. `PairAdded` and `Launched` are indexed but nothing
 *   publishes them to a room, so this polls `/api/tokens/new` instead. That is adequate
 *   rather than a compromise: a launch happens minutes apart at best, so a poll cannot
 *   meaningfully lag it, and a socket for it would be plumbing nobody reads.
 *
 * Kept out of the component so the merge, the dedupe and the formatting are testable
 * without a socket or a DOM.
 */

export type TickerKind = "bought" | "sold" | "created";

export interface TickerEvent {
  /** Stable across re-renders and re-deliveries — see `tickerKey`. */
  id: string;
  kind: TickerKind;
  /** The wallet that acted. Empty for a creation whose creator is unknown. */
  actor: string;
  /** Base amount for a trade; absent for a creation. */
  amount?: number;
  symbol: string;
  logoURI?: string;
  /** Unix seconds. */
  timestamp: number;
}

/**
 * Identity for dedupe.
 *
 * A trade is identified by its transaction and order, NOT by its timestamp: the same fill
 * can arrive twice (a reconnect replays the room's recent buffer) and two different fills
 * can share a second. A creation is identified by its token address.
 */
export function tickerKey(event: {
  kind: TickerKind;
  txHash?: string;
  orderId?: number;
  address?: string;
}): string {
  if (event.kind === "created") return `created:${event.address ?? ""}`;
  return `trade:${event.txHash ?? ""}:${event.orderId ?? ""}`;
}

/** `0x51a7C4e9…` → `0x51a7`. The reference tape shows four hex digits; so does this. */
export function shortActor(address: string): string {
  if (!address || address.length < 6) return address || "someone";
  return address.slice(0, 6);
}

/** `5340` → `5.34K`. Compact, because the pill has to stay one line. */
export function compactAmount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 1) return value.toFixed(2);
  return value.toPrecision(2);
}

export const VERB: Record<TickerKind, string> = {
  bought: "BOUGHT",
  sold: "SOLD",
  created: "CREATED",
};

/**
 * Merge new events into the feed: newest first, deduped, capped.
 *
 * The cap is not cosmetic. The marquee renders its list twice for a seamless loop, so
 * every event costs two DOM nodes and the track's width grows without bound on a busy
 * chain — an unbounded feed degrades into a scroll that never repeats and a page that
 * slowly dies.
 */
export function mergeEvents(
  existing: TickerEvent[],
  incoming: TickerEvent[],
  cap = 24,
): TickerEvent[] {
  const seen = new Set<string>();
  const merged: TickerEvent[] = [];
  for (const event of [...incoming, ...existing]) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged.slice(0, cap);
}
