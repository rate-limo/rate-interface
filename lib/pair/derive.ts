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
 * The market's best bid and ask with the pool's quotes folded in.
 *
 * A band pool re-anchors on its own price and holds quote below it and base
 * above it, so it bids up to that price and offers from it. Taking the best
 * quotes from the order book alone put the mid between two resting orders the
 * pool sits inside: measured on Arc's TITER/USDC, a book of 0.98 / 1.02 around
 * a pool at 1.02 read as mid 1.00 and spread 4.00%, and since the pool's bands
 * (1.019–1.021) then lay wholly above that mid, its bid leg counted as $0 of
 * depth while the ladder beneath listed 11.82 USDC of it.
 *
 * A leg the pool holds none of quotes nothing, so a single-sided pool cannot
 * close a spread on the side it cannot fill.
 */
export function withPoolQuotes(
  snapshot: Pick<PairSnapshot, "bestBid" | "bestAsk">,
  bands: PoolBand[],
  poolPrice: number | null | undefined,
): { bestBid: number | null; bestAsk: number | null } {
  const price = Number(poolPrice);
  if (!Number.isFinite(price) || price <= 0) return { bestBid: snapshot.bestBid, bestAsk: snapshot.bestAsk };
  const bids = bands.some((b) => b.quoteAmount > 0 && b.minPrice < price);
  const asks = bands.some((b) => b.baseAmount > 0 && b.maxPrice > price);
  const bestBid = bids ? Math.max(snapshot.bestBid ?? 0, price) : snapshot.bestBid;
  const bestAsk = asks ? Math.min(snapshot.bestAsk ?? Number.POSITIVE_INFINITY, price) : snapshot.bestAsk;
  return { bestBid, bestAsk };
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
 * The price depth is measured from — the mid when there is one, the market's own
 * rate when there is not.
 *
 * Depth used to take the mid directly, so a ONE-SIDED book reported an em-dash on
 * BOTH sides: `midPrice` is null without two sides, `depthWithin` refuses a null
 * anchor, and the side that actually held resting orders went dark with it. On a
 * freshly launched coin — a single-sided range and nobody quoting back, the common
 * case this profile exists to describe — that is every depth figure on the page
 * blank while the header above it prints a perfectly good rate.
 *
 * The mid is the RIGHT anchor and stays first. But it is not the only defensible
 * one: `pair.price` is the same rate the header renders, so measuring a ±2% band
 * around it says exactly what a reader means by "depth near the price". The
 * distinction that has to survive is SPREAD versus DEPTH — a spread is undefined
 * without both sides and keeps its em-dash, while depth on the resting side is a
 * real quantity that was simply not being reported.
 *
 * Null only when there is no usable price at all, which is when a dash is honest.
 */
export function depthAnchor(
  snapshot: Pick<PairSnapshot, "bestBid" | "bestAsk">,
  fallback: number | null | undefined,
): number | null {
  const mid = midPrice(snapshot);
  if (mid !== null && mid > 0) return mid;
  const rate = Number(fallback);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
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
  // A hair of tolerance: 1.02 against a 1.00 mid is 0.0200…018 in floating
  // point, which dropped a level sitting exactly on the ±2% edge from the
  // figure the band is named for.
  const band = mid * (pct / 100) * (1 + 1e-9);
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
      return `${symbol} has no resting orders, so both depth figures are zero and there is no spread to measure.`;
    case "one-sided":
      return `${symbol} is quoted on one side only — common right after a launch, where a single-sided range is the whole book. Depth is measured from the market rate, and the unquoted side reads zero; there is no spread until someone quotes back.`;
    default:
      return null;
  }
}

/**
 * One band of pool liquidity: an amount of each leg available across a price interval.
 *
 * Structurally `LiquidityRange` from `usePairLiquidityRanges`, restated here so the
 * derivations stay free of the hook that happens to fetch them.
 */
export interface PoolBand {
  minPrice: number;
  maxPrice: number;
  baseAmount: number;
  quoteAmount: number;
}

/**
 * The quote-denominated value of the slice of `band` lying inside `[lo, hi]`.
 *
 * This is the ONE definition of what a band is worth over an interval, and every pool
 * figure on this page goes through it. `depthBins` in `PairProfile` already settled the
 * rule when it put bands and the book on one axis: a band is spread across an interval
 * proportionally to the overlap, its base leg valued at the interval's own rate and its
 * quote leg taken as-is. A second implementation of that is exactly the drift that
 * commit 5920fbc6 was written to delete, so the stats, the depth curve and the ladder
 * all call this rather than each doing the arithmetic again.
 *
 * Proportional rather than all-or-nothing, which is the opposite of `depthWithin`'s rule
 * for a book level — and deliberately so. A level rests at ONE price and is therefore
 * either inside the band or outside it; a pool band spans prices, and half of it really
 * is available in the half of its range that the window covers.
 */
/**
 * Which leg a figure is counting.
 *
 * `both` is the band's VALUE — what sits here, whichever token it is in. That is
 * the right answer for the liquidity histogram, which asks "how much liquidity
 * is at this rate".
 *
 * `bid` and `ask` are DEPTH — what a taker on that side can actually get, and
 * the two are different tokens. A bid is filled from the pool's QUOTE: price
 * falling means the pool buying base with the quote it holds. An ask is filled
 * from its BASE. A band's other leg is not depth on that side at any price.
 */
type Leg = "both" | "bid" | "ask";

function bandValueOver(
  band: PoolBand,
  lo: number,
  hi: number,
  leg: Leg = "both",
  mid?: number,
): number {
  const base = Number.isFinite(band.baseAmount) ? band.baseAmount : 0;
  const quote = Number.isFinite(band.quoteAmount) ? band.quoteAmount : 0;

  /**
   * The interval a LEG is actually spent across, which is not the whole band.
   *
   * A band's quote is what it pays out as price FALLS through it, so it is spent
   * between the band's floor and the mid; its base is sold as price RISES, so
   * between the mid and the band's ceiling. Dividing by the whole width instead
   * charged each leg for the half of the band on the side it is never used on,
   * and that half was then counted for neither leg — measured on Arc's
   * TITER/USDC, the depth chart reported 7.4820 of bid depth against the 14.9640
   * of quote the order-book ladder reports from the same bands, with the missing
   * 7.4820 appearing nowhere on either side.
   *
   * A band entirely on the far side of the mid has an empty span here and
   * contributes nothing, which is right: walking down never reaches a band that
   * sits above the price.
   */
  const span =
    leg === "both" || mid === undefined || !Number.isFinite(mid)
      ? { from: band.minPrice, to: band.maxPrice }
      : leg === "bid"
        ? { from: band.minPrice, to: Math.min(mid, band.maxPrice) }
        : { from: Math.max(mid, band.minPrice), to: band.maxPrice };

  const width = span.to - span.from;
  if (!(width > 0)) return 0;
  const overlap = Math.min(hi, span.to) - Math.max(lo, span.from);
  if (!(overlap > 0)) return 0;
  const fraction = overlap / width;
  // The overlap's own mid rate, matching `depthBins`, which values a band's base leg at
  // the rate of the bin it is being counted into rather than at spot.
  const rate = (Math.max(lo, span.from) + Math.min(hi, span.to)) / 2;
  const baseSide = base * fraction * rate;
  const quoteSide = quote * fraction;
  const value = leg === "bid" ? quoteSide : leg === "ask" ? baseSide : baseSide + quoteSide;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Quote-denominated pool depth within `pct` of the mid, on one side.
 *
 * The sibling of `depthWithin`, in the same unit, so the two can be added: the stat the
 * profile shows is everything that can fill inside the band, and a venue with both a book
 * and a pool has it in both places.
 *
 * Split TWICE, and both splits matter. By PRICE, so a band straddling the mid gives its
 * lower part to the bid figure and its upper part to the ask one. And by LEG, because a
 * bid is filled from the pool's quote and an ask from its base.
 *
 * The leg half was missing, and it inflated both figures with the other side's token.
 * Measured on Arc's TITER/USDC (mid 1.0202, 11.0036 base + 14.9640 quote across three
 * bands inside ±0.1%): the page reported $13.09 of bid depth and $13.10 of ask depth
 * against real figures of $7.48 and $5.61. The tell was in the arithmetic — the bid's
 * overstatement was 5.6111 and the ask's true depth 5.6149, the ask's overstatement
 * 7.4820 and the bid's true depth 7.4820. Each side was reporting the other side's
 * inventory as its own, which is also why a pool holding unequal legs rendered as a
 * perfectly symmetric $13 / $13.
 *
 * So the two sides no longer sum to the liquidity chart's total, and should not: that
 * chart draws VALUE at a rate, these are DEPTH on a side. `poolTvlUsd` remains the
 * figure that accounts for both legs once.
 *
 * Bands overlap each other by design — band 1's range contains band 0's — and summing
 * them is correct: liquidity in the wider band genuinely is available at prices near spot
 * too. The gateway's `/liquidity/ranges` route says the same thing about its histogram.
 *
 * Every band is visited. Unlike `depthWithin`, there is no early exit, because bands
 * arrive in band order rather than sorted away from the mid.
 */
export function poolDepthWithin(
  bands: PoolBand[],
  mid: number | null,
  pct: number,
  side: "bid" | "ask",
): number | null {
  if (mid === null || !Number.isFinite(mid) || mid <= 0) return null;
  const edge = mid * (pct / 100);
  const lo = side === "bid" ? mid - edge : mid;
  const hi = side === "bid" ? mid : mid + edge;
  let total = 0;
  for (const band of bands) total += bandValueOver(band, lo, hi, side, mid);
  return total;
}

/**
 * Cumulative quote-denominated pool depth at `price`, walking away from the mid.
 *
 * The depth curve's question is "how much is there between the mid and here", which is
 * the same question `poolDepthWithin` answers for a fixed ±2% — this one just takes the
 * far edge as an argument so the curve can be sampled. A price on the wrong side of the
 * mid returns 0 rather than folding across it; the two sides are drawn separately.
 */
export function cumulativePoolQuote(
  bands: PoolBand[],
  mid: number,
  price: number,
  side: "bid" | "ask",
): number {
  if (!Number.isFinite(mid) || mid <= 0 || !Number.isFinite(price)) return 0;
  const lo = Math.min(mid, price);
  const hi = Math.max(mid, price);
  if (hi <= lo) return 0;
  let total = 0;
  for (const band of bands) total += bandValueOver(band, lo, hi, side, mid);
  return total;
}

/**
 * The pool's whole inventory of ONE leg, and the price interval it rests across.
 *
 * For the ladder, which lists the book's discrete levels and cannot honestly list a band
 * among them: a band is a continuum, not an order resting at a price, so it gets its own
 * line reporting its own interval rather than a synthetic row wedged between two real
 * ones. The leg follows which side of the book the line sits under — an ask fills from
 * the pool's BASE inventory, a bid from its QUOTE.
 *
 * Null when the pool holds nothing on that leg, so the caller renders no line at all
 * rather than a zero.
 */
export function poolSideInventory(
  bands: PoolBand[],
  side: "bid" | "ask",
): { amount: number; minPrice: number; maxPrice: number } | null {
  let amount = 0;
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  for (const band of bands) {
    if (!(band.maxPrice > band.minPrice)) continue;
    const leg = side === "ask" ? band.baseAmount : band.quoteAmount;
    if (!Number.isFinite(leg) || leg <= 0) continue;
    amount += leg;
    minPrice = Math.min(minPrice, band.minPrice);
    maxPrice = Math.max(maxPrice, band.maxPrice);
  }
  if (!(amount > 0) || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return null;
  return { amount, minPrice, maxPrice };
}

/**
 * The band pool's TVL in USD.
 *
 * Follows `positionUsd` exactly: only the QUOTE token carries a USD price, so the pool is
 * valued in quote first — `base x rate + quote` — and converted once. Without
 * `quotePriceUSD` the answer is null, because a field named `…Usd` holding a
 * quote-denominated number is the mislabelling this page refuses to do.
 *
 * Separate from `PairSnapshot.lpTvlUsd`, which is the pair row's `dayBaseTvlUSD +
 * dayQuoteTvlUSD` and is written only by the ORDER BOOK processors. The two are different
 * venues' TVL and adding them into one field would make neither recoverable.
 */
export function poolTvlUsd(
  totalBase: number | null | undefined,
  totalQuote: number | null | undefined,
  rate: number | null | undefined,
  quotePriceUSD: number | null | undefined,
): number | null {
  const base = Number(totalBase);
  const quote = Number(totalQuote);
  const price = Number(rate);
  const usd = Number(quotePriceUSD);
  if (!Number.isFinite(base) && !Number.isFinite(quote)) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const quoteValue = (Number.isFinite(base) ? base : 0) * price + (Number.isFinite(quote) ? quote : 0);
  const total = quoteValue * usd;
  return Number.isFinite(total) ? total : null;
}

/** One sample of a depth curve: both venues at one price, in QUOTE terms. */
export interface DepthSample {
  price: number;
  /** Cumulative book notional between the mid and this price. */
  book: number;
  /** Cumulative band-pool notional over the same interval. */
  pool: number;
}

/**
 * One side of the depth curve, sampled at every price where it bends.
 *
 * Pure, and exported, because this is where pool liquidity actually ENTERS the
 * depth chart — the component does nothing afterwards but map these numbers to
 * coordinates. A band that never reaches this function can never be drawn, and
 * that is a claim worth a test rather than a screenshot.
 *
 * Sampled at the union of level prices and BAND EDGES, which are the only places
 * either series changes slope: the book steps at a level, the pool ramps between
 * edges, and a straight run needs no interior points. Two samples share each
 * price — the book's value before the orders there are crossed and after — which
 * is what makes the staircase a staircase instead of a ramp.
 *
 * Quote-denominated throughout, via `size x price`, so the curve, the ±2% stats
 * and the figures printed under the chart are all the same unit. `BookLevel`
 * also carries `cumulative`, which is BASE size; using it here is how the curve
 * and its own caption ended up in different units.
 */
export function depthCurveSide(
  levels: BookLevel[],
  bands: PoolBand[],
  mid: number,
  edge: number,
  side: "bid" | "ask",
): DepthSample[] {
  if (!Number.isFinite(mid) || mid <= 0 || !Number.isFinite(edge)) return [];
  const outward = side === "bid" ? "left" : "right";
  const inSide = (price: number) =>
    outward === "left" ? price <= mid && price >= edge : price >= mid && price <= edge;

  const usable = bands.filter((band) => band.maxPrice > band.minPrice);
  const own = levels.filter(
    (level) => Number.isFinite(level.price) && level.price > 0 && level.size > 0 && inSide(level.price),
  );

  const marks = new Set<number>([mid, edge]);
  for (const level of own) marks.add(level.price);
  for (const band of usable) {
    for (const bound of [band.minPrice, band.maxPrice]) if (inSide(bound)) marks.add(bound);
  }

  const ordered = [...own].sort((a, b) => (outward === "left" ? b.price - a.price : a.price - b.price));
  const walk = [...marks].sort((a, b) => (outward === "left" ? b - a : a - b));

  const out: DepthSample[] = [];
  let book = 0;
  let next = 0;
  for (const price of walk) {
    const pool = cumulativePoolQuote(usable, mid, price, side);
    out.push({ price, book, pool });
    while (
      next < ordered.length &&
      (outward === "left" ? ordered[next]!.price >= price : ordered[next]!.price <= price)
    ) {
      const level = ordered[next]!;
      book += level.size * level.price;
      next += 1;
    }
    out.push({ price, book, pool });
  }
  return out;
}

/**
 * The rate to print beside the book, and what to call it.
 *
 * `midPrice` is null on a one-sided book and that is right for the SPREAD — two
 * quotes are what a spread is made of. It was wrong for this readout. A market
 * with nothing resting on one side still has a price: the indexed market rate,
 * which is what `depthAnchor` already measures both depth figures from and what
 * the depth curve is already centred on. So the row printed an em-dash beside a
 * chart drawn around 1.02, on a pair whose header says 1.02.
 *
 * The fix is not to widen `midPrice` — calling one side's best quote "the mid"
 * would report a spread of zero on a market nobody can trade, which is the
 * mistake its own note warns about. It is to stop labelling two different
 * numbers with one word. A true mid is a MID; the indexed rate is the MARKET
 * rate; and they are only the same number by coincidence.
 */
export function midReadout(
  snapshot: Pick<PairSnapshot, "bestBid" | "bestAsk">,
  marketRate: number | null | undefined,
): { label: "Mid" | "Market"; value: number | null } {
  const mid = midPrice(snapshot);
  if (mid !== null && mid > 0) return { label: "Mid", value: mid };
  const rate = Number(marketRate);
  if (Number.isFinite(rate) && rate > 0) return { label: "Market", value: rate };
  // Neither a book nor an indexed price. The em-dash is the honest answer here
  // and only here.
  return { label: "Mid", value: null };
}
