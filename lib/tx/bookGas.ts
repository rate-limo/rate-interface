import type { GroupedOrderbookResult } from "@/types";

/**
 * How many price levels an order would cross against the book we can currently see.
 *
 * ## Why this is allowed to be approximate
 *
 * The client used to size gas for `n` matches — the worst case — because without
 * `MATCH_GAS_RESERVE` an undershoot lost the whole order, so only a provable bound
 * was safe. At `n = 20` that shows roughly 1.8M of headroom in the wallet against
 * ~370k actually spent. Unused gas is refunded, so it costs nothing real, but a
 * max fee five times the true one is its own kind of lie.
 *
 * With the reserve on chain, an undershoot is a partial fill with the remainder
 * rested or refunded. That turns the gas limit from a correctness argument into a
 * budget, and a budget can be estimated rather than proven. So this counts what the
 * order would actually cross, and the contract absorbs the difference.
 *
 * ## The count is BUCKETED, and deliberately not exact
 *
 * `GroupedOrderbookResult` aggregates raw levels into buckets of `step`, so one
 * bucket can hold several levels the engine will match separately. This therefore
 * UNDER-counts, and that is fine — under-counting now costs a smaller fill, not a
 * lost order. Making it exact would mean an ungrouped book fetch on every keystroke
 * to win back gas that is refunded anyway.
 *
 * `LEVEL_HEADROOM` covers both that under-count and depth arriving between the quote
 * and the block.
 */
export const LEVEL_HEADROOM = 3;

/** Prices arrive as strings. A malformed one must not silently count as zero. */
function priceOf(bucket: { price: string }): number | null {
  const n = Number(bucket.price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Levels an order at `limitPrice` would cross right now.
 *
 * A bid crosses asks at or below its price; an ask crosses bids at or above it. A
 * market order (no limit price) is treated as crossing everything on the far side,
 * which is what it does.
 */
export function levelsCrossing(
  book: GroupedOrderbookResult | null | undefined,
  isBid: boolean,
  limitPrice?: number | null,
): number {
  const far = isBid ? book?.asks?.buckets : book?.bids?.buckets;
  if (!far || far.length === 0) return 0;
  if (limitPrice === null || limitPrice === undefined || !Number.isFinite(limitPrice)) {
    return far.length;
  }
  let crossed = 0;
  for (const bucket of far) {
    const price = priceOf(bucket);
    if (price === null) continue;
    if (isBid ? price <= limitPrice : price >= limitPrice) crossed += 1;
  }
  return crossed;
}

/**
 * The `n` to size gas for: what the order crosses, plus headroom, capped by the
 * engine's own limit.
 *
 * Capped because the engine cannot match more than `maxMatches` however deep the
 * book is, so paying for more is pure waste. Floored at nothing — an order that
 * crosses zero levels still needs the base cost, which the estimate already covers.
 */
export function gasLevelsFor(
  book: GroupedOrderbookResult | null | undefined,
  isBid: boolean,
  limitPrice: number | null | undefined,
  maxMatches: number,
): number {
  const crossing = levelsCrossing(book, isBid, limitPrice);
  return Math.min(maxMatches, crossing + LEVEL_HEADROOM);
}
