/**
 * Collapses order CLOSURES into one toast per (transaction, outcome).
 *
 * The sibling of `fillAggregator`, for the other half of the same burst. That one
 * folds `spotOrderMatched` / `spotTrade` — orders that shrank. This one folds
 * `deleteSpotOrderHistory` — orders that went away, either because a match
 * cleared them or because they were cancelled.
 *
 * Why it is needed: the fill aggregator does not cover this path, so a maker
 * holding several resting orders at different levels — the normal shape of a
 * market-making position — got one toast PER ORDER when a single sweep cleared
 * them, and `cancelOrders` takes an array, so cancelling four in one transaction
 * stacked four toasts. The toast id was the order id, which differs per order, so
 * sonner's own id-dedup could never collapse them.
 *
 * The key is `txHash:pair:status`, and both extra halves are load-bearing:
 *
 *  - **status** — a fill and a cancellation are opposite outcomes and must never
 *    be summed into one line, even if both reach a client from one transaction.
 *  - **pair** — `cancelOrders` takes arrays of base/quote/isBid/orderIds, so a
 *    cancel-all across markets is a SINGLE transaction, and a routed multi-hop
 *    swap can clear resting orders on more than one book the same way. Keyed on
 *    the transaction alone, those closures share an aggregate and the price range
 *    below spans two different quote tokens — `from 0.0512 to 1635.00` names
 *    nothing. Splitting per pair also bounds the toast count by markets touched
 *    rather than by orders closed, which is the same trade `fillAggregator` makes.
 *
 * Unlike a fill, a closure carries no size — `SpotDeleteOrderItemEvent` has nine
 * fields and none of them is an amount — so this aggregate counts orders and
 * reports a price RANGE. It deliberately does not average: averaging prices
 * without sizes to weight them produces a number that is not the execution price
 * of anything.
 */

export type OrderCloseStatus = "filled" | "canceled";

export interface OrderCloseInput {
  txHash: string;
  /** The market the order rested on. Part of the key — see the note above. */
  pair: string;
  status: OrderCloseStatus;
  /** The closed order's side. */
  isBid: boolean;
  /**
   * Price of the order that closed, read from the row being removed. Optional
   * because the row may already be off the cached page, in which case the copy
   * simply omits the price rather than inventing one.
   */
  price?: number;
}

export type OrderCloseSide = "buy" | "sell" | "mixed";

export interface OrderCloseAggregate {
  key: string;
  txHash: string;
  pair: string;
  status: OrderCloseStatus;
  /** How many orders this transaction closed so far. */
  orders: number;
  /** "mixed" once both sides have appeared — a cancel-all can hit both books. */
  side: OrderCloseSide;
  minPrice?: number;
  maxPrice?: number;
}

export interface OrderCloseAggregatorOptions {
  /** See fillAggregator: sized to just outlive the toast, not to be generous. */
  ttlMs?: number;
  now?: () => number;
}

export interface OrderCloseAggregator {
  /** Fold one closure in and return the running aggregate for its transaction. */
  add: (input: OrderCloseInput) => OrderCloseAggregate;
  reset: () => void;
  /** Live aggregate count. Exposed for tests. */
  readonly size: number;
}

export function orderCloseKey(
  input: Pick<OrderCloseInput, "txHash" | "pair" | "status">,
): string {
  return `${input.txHash}:${input.pair}:${input.status}`;
}

interface Entry {
  agg: OrderCloseAggregate;
  touchedAt: number;
}

export function createOrderCloseAggregator(
  options?: OrderCloseAggregatorOptions,
): OrderCloseAggregator {
  const ttlMs = options?.ttlMs ?? 8_000; // 2x the 4s toast lifetime
  const now = options?.now ?? Date.now;
  const live = new Map<string, Entry>();

  const prune = (at: number) => {
    for (const [key, entry] of live) {
      if (at - entry.touchedAt > ttlMs) live.delete(key);
    }
  };

  return {
    add(input: OrderCloseInput): OrderCloseAggregate {
      const at = now();
      prune(at);

      const key = orderCloseKey(input);
      const prev = live.get(key)?.agg;
      const thisSide: OrderCloseSide = input.isBid ? "buy" : "sell";

      const agg: OrderCloseAggregate = {
        key,
        txHash: input.txHash,
        pair: input.pair,
        status: input.status,
        orders: (prev?.orders ?? 0) + 1,
        side:
          prev == null || prev.side === thisSide ? thisSide : "mixed",
        minPrice: minDefined(prev?.minPrice, input.price),
        maxPrice: maxDefined(prev?.maxPrice, input.price),
      };

      live.set(key, { agg, touchedAt: at });
      return agg;
    },
    reset() {
      live.clear();
    },
    get size() {
      return live.size;
    },
  };
}

function minDefined(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxDefined(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

export interface OrderCloseDescription {
  title: string;
  description?: string;
}

/**
 * Renders an aggregate as toast copy.
 *
 * The single-order wording is preserved exactly as it shipped, so the common case
 * reads identically to before this aggregator existed — only a burst changes.
 *
 * Note the spelling split, which is not a typo: the wire value is `canceled` (one
 * l, matching the payload and the database) and the copy says `cancelled` (two,
 * matching every other string in the app).
 */
export function describeOrderClose(
  agg: OrderCloseAggregate,
  format: (value: number) => string = (value) => String(value),
): OrderCloseDescription {
  const filled = agg.status === "filled";

  if (agg.orders === 1) {
    const side = agg.side === "buy" ? "Buy" : "Sell";
    if (!filled) return { title: `${side} order is cancelled` };
    return {
      title:
        agg.minPrice != null
          ? `${side} order filled at ${format(agg.minPrice)}`
          : `${side} order filled`,
    };
  }

  // "mixed" drops the side word rather than picking one of the two.
  const noun =
    agg.side === "mixed" ? "orders" : `${agg.side === "buy" ? "buy" : "sell"} orders`;
  const title = `${agg.orders} ${noun} ${filled ? "filled" : "cancelled"}`;

  return { title, description: priceRange(agg, format) };
}

function priceRange(
  agg: OrderCloseAggregate,
  format: (value: number) => string,
): string | undefined {
  const { minPrice, maxPrice } = agg;
  if (minPrice == null || maxPrice == null) return undefined;
  if (minPrice === maxPrice) return `at ${format(minPrice)}`;
  return `from ${format(minPrice)} to ${format(maxPrice)}`;
}
