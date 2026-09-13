/**
 * Collapses the per-fill event stream into one toast per (transaction, market, side).
 *
 * `MatchingLib.matchAt` emits one `OrderMatched` per resting order it consumes,
 * capped by the engine's `maxMatches` (20 by default, and `setMaxMatches` has no
 * upper bound). One market order sweeping the book therefore produced up to
 * twenty separate toasts, and sonner's own id-dedup never collapsed them because
 * the ids were keyed on the *maker's* order id, which differs per fill.
 *
 * Keying on the transaction fixes that: sonner replaces a toast when the id
 * repeats, so N fills update one toast in place instead of stacking N. The
 * aggregate is what makes the replacement meaningful — otherwise the surviving
 * toast would report only whichever fill happened to land last.
 *
 * The key includes pair and side, not just txHash: a routed multi-hop swap
 * settles across more than one market in a single transaction, and summing sizes
 * across markets would add quantities denominated in different tokens.
 */

/**
 * What the account being notified did, already resolved by the caller.
 *
 * Deliberately not `isBid`: the two call sites read the flag through opposite
 * conventions — `useOrders` receives the RESTING order's side and phrases an ask
 * as "bought" (the maker acquires quote), while `useTradeHistory` receives the
 * taker's side and phrases a bid as "bought". Taking a pre-resolved side keeps
 * both correct instead of forcing one convention on the other.
 */
export type FillSide = "buy" | "sell";

export interface FillInput {
  txHash: string;
  pair: string;
  side: FillSide;
  /** Size of THIS fill, in `symbol` units. */
  matched: number;
  price: number;
  symbol: string;
  /**
   * Size still resting after this fill. Makers have one; takers do not, so it is
   * optional and omitted rather than passed as zero — zero is a real value here
   * ("fully filled") and must stay distinguishable from "not applicable".
   */
  placed?: number;
  /** The order's original size, when known. Enables the progress percentage. */
  orderSize?: number;
}

export interface FillAggregate {
  key: string;
  txHash: string;
  pair: string;
  side: FillSide;
  /** How many separate fills this transaction produced so far. */
  fills: number;
  /** Sum of `matched` across them. */
  size: number;
  /** Size-weighted mean price. */
  avgPrice: number;
  symbol: string;
  placed?: number;
  orderSize?: number;
}

export interface FillAggregatorOptions {
  /**
   * How long an aggregate stays live after its last fill.
   *
   * Deliberately close to the toast's own lifetime rather than generously long.
   * A transaction's fills all land in one block, so this only has to outlive the
   * socket's delivery jitter — and once the toast has expired, folding a late
   * straggler into the old aggregate would raise a FRESH toast restating a total
   * the user already read and dismissed. Past the window the straggler starts its
   * own aggregate and reports only itself, which is the honest reading.
   */
  ttlMs?: number;
  now?: () => number;
}

export interface FillAggregator {
  /** Fold one fill in and return the running aggregate for its transaction. */
  add: (input: FillInput) => FillAggregate;
  reset: () => void;
  /** Live aggregate count. Exposed for tests. */
  readonly size: number;
}

export function fillKey(input: Pick<FillInput, "txHash" | "pair" | "side">): string {
  return `${input.txHash}:${input.pair}:${input.side}`;
}

interface Entry {
  agg: FillAggregate;
  notional: number;
  touchedAt: number;
}

export function createFillAggregator(options?: FillAggregatorOptions): FillAggregator {
  const ttlMs = options?.ttlMs ?? 8_000; // 2x the 4s toast lifetime
  const now = options?.now ?? Date.now;
  const live = new Map<string, Entry>();

  const prune = (at: number) => {
    for (const [key, entry] of live) {
      if (at - entry.touchedAt > ttlMs) live.delete(key);
    }
  };

  return {
    add(input: FillInput): FillAggregate {
      const at = now();
      prune(at);

      const key = fillKey(input);
      const prev = live.get(key);

      const fills = (prev?.agg.fills ?? 0) + 1;
      const size = (prev?.agg.size ?? 0) + input.matched;
      const notional = (prev?.notional ?? 0) + input.matched * input.price;

      const agg: FillAggregate = {
        key,
        txHash: input.txHash,
        pair: input.pair,
        side: input.side,
        fills,
        size,
        // Falling back to the latest price rather than 0 when the summed size is
        // zero: dust fills can round to nothing, and a reported price of 0 reads
        // as a real (catastrophic) execution rather than as "no size yet".
        avgPrice: size > 0 ? notional / size : input.price,
        symbol: input.symbol,
        // Last write wins for both: `placed` shrinks with every fill, so the most
        // recent one is the remaining size.
        placed: input.placed ?? prev?.agg.placed,
        orderSize: input.orderSize ?? prev?.agg.orderSize,
      };

      live.set(key, { agg, notional, touchedAt: at });
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

/**
 * Fraction of the original order filled so far, across every transaction — not
 * just this one. Derived from `placed` rather than from the summed fill size,
 * because an order may have been partly filled before the transaction being
 * reported here. Null when the inputs cannot support the claim.
 */
export function filledFraction(agg: Pick<FillAggregate, "placed" | "orderSize">): number | null {
  const { placed, orderSize } = agg;
  if (placed == null || orderSize == null || orderSize <= 0) return null;
  const filled = orderSize - placed;
  if (filled < 0) return null;
  return Math.min(filled / orderSize, 1);
}

export interface FillDescription {
  title: string;
  description?: string;
}

/**
 * Renders an aggregate as toast copy. Kept separate from the accumulation so the
 * wording is testable without a toast library, and pure so the caller supplies
 * its own number formatting.
 */
export function describeFill(
  agg: FillAggregate,
  format: (value: number) => string = (value) => String(value),
): FillDescription {
  const verb = agg.side === "buy" ? "Bought" : "Sold";
  const price = agg.fills > 1 ? `avg ${format(agg.avgPrice)}` : format(agg.avgPrice);
  const title = `${verb} ${format(agg.size)} ${agg.symbol} at ${price}`;

  const parts: string[] = [];
  if (agg.fills > 1) parts.push(`${agg.fills} fills`);

  const fraction = filledFraction(agg);
  if (fraction != null) parts.push(`${Math.round(fraction * 100)}% filled`);

  if (agg.placed != null) {
    parts.push(
      agg.placed > 0 ? `${format(agg.placed)} ${agg.symbol} still resting` : "order complete",
    );
  }

  return { title, description: parts.length > 0 ? parts.join(" · ") : undefined };
}
