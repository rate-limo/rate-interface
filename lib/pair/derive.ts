/**
 * Pure derivations for the pair profile. No fetching, no React — so the rules that are
 * easy to get quietly wrong (a spread off an empty book, depth measured from the wrong
 * anchor) are testable without a DOM or a live indexer.
 */

import { formatSubscriptDecimal } from "@/utils/number";
import type { BookLevel, PairSnapshot } from "./types";

/**
 * Mid price — the anchor every depth figure is measured from.
 *
 * Null unless BOTH sides exist. A one-sided book has no mid, and taking the single
 * resting side as the mid would report a spread of zero on a market nobody can trade.
 */
export function midPrice(snapshot: Pick<PairSnapshot, "bestBid" | "bestAsk">): number | null {
  const { bestBid, bestAsk } = snapshot;
  if (bestBid === null || bestAsk === null) return null;
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return null;
  return (bestBid + bestAsk) / 2;
}

/**
 * Spread as a percentage of the mid.
 *
 * Null on a one-sided or empty book — the honest answer to "how wide is it" when there is
 * nothing on one side is "there is no spread", not a number.
 */
export function spreadPct(snapshot: Pick<PairSnapshot, "bestBid" | "bestAsk">): number | null {
  const mid = midPrice(snapshot);
  if (mid === null || mid <= 0) return null;
  const { bestBid, bestAsk } = snapshot;
  return (((bestAsk as number) - (bestBid as number)) / mid) * 100;
}

/**
 * `0.42` → `"0.42%"`, null → an em-dash, and a sub-1 value in subscript-zero
 * notation: `0.000414` → `"0.0\u2083414%"`.
 *
 * The subscript branch is the venue-wide rule for any figure below 1 and above
 * 0, and a percentage is where it matters most quietly: `toFixed(1)` renders a
 * band pool's real 0.0004% APR as **`0.0%`**, which reads as a yield judgement
 * on a pool that is in fact earning. `formatSubscriptDecimal` returns null
 * above its own threshold, so the normal range keeps the caller's `digits`
 * exactly as before.
 */
export function formatPct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  // The helper carries its own sign — prefixing one here double-signs a
  // negative, which is what its test caught.
  const subscript = formatSubscriptDecimal(value);
  if (subscript !== null) return `${subscript}%`;
  return `${value.toFixed(digits)}%`;
}

/**
 * Quote-denominated notional resting within `pct` of the mid, on one side.
 *
 * Levels are assumed sorted away from the mid, which is how the orderbook route returns
 * them. Anything outside the band is ignored rather than partially counted: a level at
 * +2.1% is not 90% inside the ±2% band, it is outside it.
 */
export function depthWithin(levels: BookLevel[], mid: number | null, pct: number): number | null {
  if (mid === null || mid <= 0) return null;
  if (levels.length === 0) return 0;
  const band = mid * (pct / 100);
  let notional = 0;
  for (const level of levels) {
    if (Math.abs(level.price - mid) > band) break;
    notional += level.price * level.size;
  }
  return notional;
}

/**
 * The share of a side's depth sitting at one level, for the book's bar widths.
 *
 * Measured against the deepest level shown rather than the total, so a book with one
 * dominant level still renders readable bars for the rest.
 */
export function levelWidthPct(level: BookLevel, levels: BookLevel[]): number {
  const deepest = levels.reduce((max, l) => Math.max(max, l.cumulative), 0);
  if (deepest <= 0) return 0;
  return Math.max(0, Math.min(100, (level.cumulative / deepest) * 100));
}

/**
 * Whether the book is thin enough that its stats are misleading rather than merely small.
 *
 * One-sided books are the common case for a freshly launched coin — the creator seeded a
 * single-sided range and nobody has quoted the other side. The profile says so out loud
 * instead of rendering a page of dashes with no explanation.
 */
export function bookState(snapshot: PairSnapshot): "two-sided" | "one-sided" | "empty" {
  const hasBids = snapshot.bids.length > 0;
  const hasAsks = snapshot.asks.length > 0;
  if (!hasBids && !hasAsks) return "empty";
  if (hasBids !== hasAsks) return "one-sided";
  return "two-sided";
}

export function bookStateNote(state: ReturnType<typeof bookState>, symbol: string): string | null {
  switch (state) {
    case "empty":
      return `${symbol} has no resting orders. Spread and depth need a two-sided book, so they read as unavailable rather than zero.`;
    case "one-sided":
      return `${symbol} is quoted on one side only — common right after a launch, where a single-sided range is the whole book. There is no spread to measure until someone quotes the other side.`;
    default:
      return null;
  }
}
