/**
 * Depth-chart geometry for the swap card: the book and the pool on ONE price axis.
 *
 * ## Why the two layers compose instead of fighting
 *
 * Book depth is already a step function — cumulative size as you walk levels away
 * from mid. Pool depth turns out to be one too, and that was the finding that made
 * this chart worth drawing: this venue's pools are BAND pools, not Uniswap-v3 ticks.
 * `BandPool` prices a fill at `marketPrice * (DENOM ± tolerance) / DENOM`, so a band
 * with tolerance `t` is an interval `[P * (1 - t/1e8), P * (1 + t/1e8)]` holding a
 * reserve of each token, and pool depth at a price is the sum of the reserves whose
 * band covers it. There is no continuous liquidity function to integrate.
 *
 * Bands OVERLAP rather than tile — band 1's interval contains band 0's — and summing
 * them is right rather than double counting: their price ranges overlap, their
 * reserves do not, and liquidity in the wider band genuinely is available near spot.
 *
 * So both layers are sums over price, computed the same way, and neither is
 * approximated. That is why pool liquidity is drawn in the SIDE's colour with a
 * hatch rather than a third hue: it is not a third kind of thing, it is the same
 * depth from another venue.
 *
 * The ranges arrive from `GET /api/liquidity/depth`, which reads `bandReserves`. It
 * used to read `spotLiquidityRanges` — fed by a `PositionManager` event no contract
 * emits any more — and so returned nothing for every pair on the deployment. This
 * chart drew its book layer and never once drew its pool layer.
 *
 * ## Units are displayed, never guessed
 *
 * Every figure here is denominated in one token and {@link DepthModel} says which.
 * Depth in base and depth in quote are different numbers, and a chart that shows one
 * while the card reasons in the other is worse than no chart. Same rule the card
 * already applies to rates — `1 <to> = X <from>`, never a bare number.
 */

/** One aggregated book level, as the grouped orderbook returns it. */
export interface BookLevel {
  price: number;
  /** Size at this level, in the unit the model is denominated in. */
  size: number;
}

/** One active LP position: an amount available across a price interval. */
export interface PoolRange {
  minPrice: number;
  maxPrice: number;
  baseAmount: number | null;
  quoteAmount: number | null;
}

/** A point on a cumulative depth curve. */
export interface DepthPoint {
  price: number;
  /** Cumulative book depth at this price, walking away from mid. */
  book: number;
  /** Pool depth available at this price. Not cumulative — see `poolDepthAt`. */
  pool: number;
}

export type DepthUnit = "base" | "quote";

export interface DepthModel {
  bids: DepthPoint[];
  asks: DepthPoint[];
  mid: number;
  /** Lowest and highest price the chart covers. */
  lo: number;
  hi: number;
  /** Largest `book + pool` on either side — the y-axis maximum. */
  max: number;
  /** Which token every size in this model is counted in. */
  unit: DepthUnit;
  unitSymbol: string;
}

/**
 * Pool depth at a single price: the sum of every range covering it.
 *
 * Exact rather than interpolated, because a tiered position is available in full
 * anywhere inside its own interval — there is no intra-range curve to model. A
 * range is counted when the price is inside it, INCLUSIVE of both bounds; a
 * position whose interval is a single point still holds its amount at that point.
 */
export function poolDepthAt(ranges: PoolRange[], price: number, unit: DepthUnit): number {
  let total = 0;
  for (const r of ranges) {
    if (price < r.minPrice || price > r.maxPrice) continue;
    const amount = unit === "base" ? r.baseAmount : r.quoteAmount;
    if (amount != null && Number.isFinite(amount) && amount > 0) total += amount;
  }
  return total;
}

/**
 * Cumulative book depth walking AWAY from mid, which is the direction that
 * answers the only question a resting order has: how much is queued in front of
 * me before the market reaches my price.
 *
 * Bids descend from mid, asks ascend. Levels on the wrong side of mid are
 * discarded rather than folded in — a crossed book is a data problem, and summing
 * through it would report depth that cannot be traded against.
 */
export function cumulativeBook(levels: BookLevel[], mid: number, side: "bid" | "ask"): DepthPoint[] {
  const own = levels
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0)
    .filter((l) => (side === "bid" ? l.price <= mid : l.price >= mid))
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));

  let running = 0;
  return own.map((l) => {
    running += l.size;
    return { price: l.price, book: running, pool: 0 };
  });
}

/**
 * Build the whole model.
 *
 * `lo`/`hi` come from the visible window rather than from the data, so the axis
 * does not jump every time a level appears at the edge — a depth chart whose scale
 * moves while you type a price is unreadable.
 */
export function buildDepthModel(input: {
  bids: BookLevel[];
  asks: BookLevel[];
  ranges: PoolRange[];
  mid: number;
  window: number;
  unit: DepthUnit;
  unitSymbol: string;
}): DepthModel | null {
  const { bids, asks, ranges, mid, window, unit, unitSymbol } = input;
  if (!Number.isFinite(mid) || mid <= 0) return null;

  const lo = mid * (1 - window);
  const hi = mid * (1 + window);

  /*
   * THE POOL IS SAMPLED AT ITS OWN EDGES, not only where the book has levels.
   *
   * This used to map pool depth onto book points alone. On a market with no
   * resting orders `cumulativeBook` returns [], so there were no prices at which
   * to sample — and the pool, however deep, produced no vertices and drew
   * nothing. `midPool` kept the model non-null, so the chart rendered its frame,
   * its axis and its mid line over an empty plot: it looked like a venue with no
   * liquidity while the pool held ~996 ITRA (Arc, ITRA/USDC, 2026-09-22).
   *
   * Band edges are also where the pool actually CHANGES. Without a vertex there,
   * a band that is 0.1% wide gets linearly smeared between two distant book
   * levels, which overstates depth everywhere between them. So this is the right
   * sample set even when the book is full, not a special case for an empty one.
   */
  const rawBids = cumulativeBook(bids, mid, "bid").filter((p) => p.price >= lo);
  const rawAsks = cumulativeBook(asks, mid, "ask").filter((p) => p.price <= hi);

  const edges = ranges
    .flatMap((r) => [r.minPrice, r.maxPrice])
    .filter((price) => Number.isFinite(price) && price >= lo && price <= hi);

  /** Cumulative book at an arbitrary price — the step the book already describes. */
  const bookAt = (points: DepthPoint[], price: number, side: "bid" | "ask"): number => {
    let depth = 0;
    for (const point of points) {
      // `points` already walk away from mid, so the first level that has not been
      // reached ends the walk.
      if (side === "bid" ? point.price < price : point.price > price) break;
      depth = point.book;
    }
    return depth;
  };

  const sideOf = (side: "bid" | "ask"): DepthPoint[] => {
    const raw = side === "bid" ? rawBids : rawAsks;
    const own = edges.filter((price) => (side === "bid" ? price <= mid : price >= mid));
    // Mid earns a vertex only when the pool is live there: adding one
    // unconditionally would put a point on every empty market's chart.
    const anchor = poolDepthAt(ranges, mid, unit) > 0 ? [mid] : [];
    const prices = Array.from(new Set([...raw.map((p) => p.price), ...own, ...anchor]));
    prices.sort((a, b) => (side === "bid" ? b - a : a - b));
    return prices.map((price) => ({
      price,
      book: bookAt(raw, price, side),
      pool: poolDepthAt(ranges, price, unit),
    }));
  };

  const bidPoints = sideOf("bid");
  const askPoints = sideOf("ask");

  // Nothing on either side and no pool anywhere means there is no chart to draw.
  // Rendering an empty frame would claim we looked and found a flat book, which
  // is a different statement from having no data — the same distinction every
  // status-bar chip makes with an em-dash.
  const midPool = poolDepthAt(ranges, mid, unit);
  if (bidPoints.length === 0 && askPoints.length === 0 && midPool === 0) return null;

  const max = Math.max(
    1e-9,
    ...bidPoints.map((p) => p.book + p.pool),
    ...askPoints.map((p) => p.book + p.pool),
    midPool,
  );

  return { bids: bidPoints, asks: askPoints, mid, lo, hi, max, unit, unitSymbol };
}

/** Map a price onto an x position in the plot. Clamped, so an out-of-window
 * marker parks at the edge rather than being drawn outside the frame. */
export function priceToX(price: number, m: { lo: number; hi: number }, plotW: number, x0 = 0): number {
  if (m.hi <= m.lo) return x0;
  const t = (price - m.lo) / (m.hi - m.lo);
  return x0 + Math.min(1, Math.max(0, t)) * plotW;
}

/** Cumulative book depth a resting order at `price` sits BEHIND. */
export function queueAhead(model: DepthModel, price: number, side: "bid" | "ask"): number {
  const points = side === "bid" ? model.bids : model.asks;
  let ahead = 0;
  for (const p of points) {
    const inFront = side === "bid" ? p.price >= price : p.price <= price;
    if (inFront) ahead = Math.max(ahead, p.book);
  }
  return ahead;
}

/**
 * Does a limit order at this price cross the market rather than rest?
 *
 * A buy at or above the best ask executes immediately; a sell at or below the
 * best bid does the same. The chart says which, because "rests at" and "fills
 * now" are the two different things a trader is choosing between, and a marker
 * with no verb attached implies the first.
 */
export function crossesMarket(model: DepthModel, price: number, side: "bid" | "ask"): boolean {
  if (side === "bid") {
    const bestAsk = model.asks[0]?.price;
    return bestAsk != null && price >= bestAsk;
  }
  const bestBid = model.bids[0]?.price;
  return bestBid != null && price <= bestBid;
}

/**
 * The stop-mode band: where the order becomes live, and how far it will go.
 *
 * A stop-limit is two prices and the interval between them is the whole point —
 * it is the range the trade is permitted to execute across. `trigger` arms the
 * order; `limit` bounds it. Returning them as a directed band lets the chart draw
 * the span rather than two unrelated ticks, and lets the caption say "buy until"
 * or "sell until", which is the sentence that makes a stop legible to someone who
 * has not traded one before.
 */
export function stopBand(
  trigger: number,
  limit: number,
  side: "bid" | "ask",
): { from: number; to: number; verb: string; valid: boolean } | null {
  if (!Number.isFinite(trigger) || !Number.isFinite(limit) || trigger <= 0 || limit <= 0) return null;
  const from = Math.min(trigger, limit);
  const to = Math.max(trigger, limit);
  // A BUY stop arms above the market and buys up to its limit; a SELL stop arms
  // below and sells down to its limit. When the limit sits on the wrong side of
  // the trigger the band is empty and the order can arm without ever being
  // fillable — reported rather than silently drawn as a valid span.
  const valid = side === "bid" ? limit >= trigger : limit <= trigger;
  return { from, to, verb: side === "bid" ? "Buy until" : "Sell until", valid };
}

/**
 * A step area from mid outwards, as an SVG path.
 *
 * Steps rather than a smooth curve, because depth genuinely IS discontinuous:
 * size sits at discrete prices, and there is nothing between two levels. A
 * smoothed line would draw liquidity at prices where none exists, which on this
 * chart is the one claim that could cost someone money.
 *
 * `layer` selects what the height means — `book` for the order book alone, or
 * `total` for book plus pool, so the pool region can be drawn UNDER the book by
 * painting total first and book on top of it.
 */
export function stepAreaPath(
  points: DepthPoint[],
  opts: {
    model: DepthModel;
    plotW: number;
    plotH: number;
    x0: number;
    y0: number;
    layer: "book" | "total";
  },
): string {
  const { model, plotW, plotH, x0, y0, layer } = opts;
  if (points.length === 0) return "";
  const h = (v: number) => y0 - (v / model.max) * plotH;
  const x = (p: number) => priceToX(p, model, plotW, x0);

  const midX = x(model.mid);
  let d = `M${midX},${y0}`;
  let prevY = y0;
  for (const p of points) {
    const v = layer === "book" ? p.book : p.book + p.pool;
    const px = x(p.price);
    const py = h(v);
    // Horizontal to the level's price at the PREVIOUS height, then vertical to
    // the new one: the corner is the level, not a diagonal through prices where
    // that size was never available.
    d += ` L${px},${prevY} L${px},${py}`;
    prevY = py;
  }
  const lastX = x(points[points.length - 1]!.price);
  d += ` L${lastX},${y0} Z`;
  return d;
}

/**
 * The display window, fitted to the data instead of assumed.
 *
 * The gateway fetches ranges at ±50% of price, which is right for CATCHING wide
 * LP positions and badly wrong for DRAWING them: a book quoting 1,610–1,660
 * around a mid of 1,635 occupies 3% of a ±50% axis — every level collapses into
 * one spike in the middle and the chart shows nothing at all.
 *
 * So the fetch window and the display window are different numbers with
 * different jobs, and this is the second one. It covers the furthest thing that
 * must be visible — book levels, and any marker, because an order drawn hard
 * against the frame edge is a marker the user cannot place — then pads it so
 * nothing sits exactly on the boundary.
 *
 * Clamped at both ends: `min` stops a one-level book zooming to a meaningless
 * sliver, `max` stops a single far-out level flattening everything near mid.
 */
export function fitWindow(input: {
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number;
  /** Prices that must stay on-frame — the limit price, a stop trigger. */
  marks?: number[];
  min?: number;
  max?: number;
  pad?: number;
}): number {
  const { bids, asks, mid, marks = [], min = 0.01, max = 0.5, pad = 0.25 } = input;
  if (!Number.isFinite(mid) || mid <= 0) return min;

  let furthest = 0;
  const consider = (price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    furthest = Math.max(furthest, Math.abs(price - mid) / mid);
  };
  for (const l of bids) consider(l.price);
  for (const l of asks) consider(l.price);
  for (const m of marks) consider(m);

  if (furthest === 0) return min;
  return Math.min(max, Math.max(min, furthest * (1 + pad)));
}

/**
 * The price-grouping step to ask the gateway's orderbook route for.
 *
 * **A step that is too fine returns an EMPTY side, not a finer one.** This is
 * the trap: `/api/orderbook/blocks/:base/:quote/:step/...` groups into buckets
 * around the market, so a step far below the pair's own scale describes a
 * window narrower than the spread and the levels outside it are simply absent.
 * Measured on RISE ETH/USDC (bids 1,980 and 1,900, ask 2,000):
 *
 * | step  | bids returned      |
 * |-------|--------------------|
 * | 0.01  | none               |
 * | 1     | 1,980 only         |
 * | 10    | 1,980 and 1,900    |
 *
 * The swap card hardcoded `0.01`, so its depth chart drew a book with no bid
 * side at all on every market priced above a few dollars — indistinguishable
 * from a market with no bids.
 *
 * The rule is `getDefaultScale`'s (`queries/client/orderbook.ts`), which the Pro
 * terminal and the pair profile already use: the smallest power of ten strictly
 * greater than price/1000. It is reproduced rather than imported because that
 * function needs the pair row's own `scales` array, and the swap card holds
 * tokens rather than a pair — but the two must agree, or the same market shows
 * different depth on two surfaces. `depth.test.ts` pins them against each other.
 */
export function depthStepFor(price: number): string {
  // No price yet (a token pair the indexer has not valued) — the coarsest
  // sensible bucket, because too coarse merges levels while too fine hides them.
  if (!Number.isFinite(price) || price <= 0) return "1";

  const exponent = Math.floor(Math.log10(price / 1000)) + 1;
  // Clamped so the result is always a plain decimal string: `10 ** -7`
  // stringifies as "1e-7", which reaches the URL and matches no scale at all.
  const clamped = Math.min(6, Math.max(-6, exponent));
  if (clamped >= 0) return String(10 ** clamped);
  return `0.${"0".repeat(-clamped - 1)}1`;
}
