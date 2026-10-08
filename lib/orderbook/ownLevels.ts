/**
 * Which book levels hold the connected wallet's own resting orders.
 *
 * The book is grouped SERVER-side (`packages/orderbook-core`, `group_side`):
 * a bid lands in the bucket `floor(price / step) * step`, an ask in
 * `ceil(price / step) * step`. Marking a level means reproducing that exactly,
 * or the dot sits one row off from the order it stands for.
 *
 * Plain float division is not enough: 0.000005 / 0.000001 is 4.999999999999999
 * in float64, which floors to 4 and would mark the 0.000004 bid. The ratio is
 * snapped to the nearest integer when it is within float noise of one, and only
 * then floored or ceiled.
 *
 * Keys go through `levelKey`, the same function the rows key their flash on, so
 * a row checks itself with one `Map.get`.
 */
import { stepDecimals } from "@/lib/format/price";
import { levelKey } from "./flash";

export interface OwnOrderLike {
  isBid: boolean;
  price: number | string;
  /** Resting amount, in `assetSymbol` — quote for a bid, base for an ask. */
  placed: number | string;
  assetSymbol?: string;
  base?: string;
  quote?: string;
}

export interface OwnLevel {
  /** Sum of the resting amounts of the wallet's orders on this level. */
  size: number;
  symbol: string;
  count: number;
}

export interface OwnLevels {
  bids: Map<string, OwnLevel>;
  asks: Map<string, OwnLevel>;
}

export const NO_OWN_LEVELS: OwnLevels = { bids: new Map(), asks: new Map() };

/** Tolerance for "this ratio is really an integer": far above float64 noise at
 * these magnitudes, far below a real off-grid price (a millionth of a tick). */
const SNAP = 1e-6;

/** The bucket a price lands in at `step`, on one side, as the server groups it. */
export function bucketPrice(price: number | string, step: number | string, isBid: boolean): number | null {
  const p = Number(price);
  const s = Number(step);
  if (!Number.isFinite(p) || !Number.isFinite(s) || s <= 0) return null;
  const ratio = p / s;
  const nearest = Math.round(ratio);
  const k = Math.abs(ratio - nearest) < SNAP ? nearest : isBid ? Math.floor(ratio) : Math.ceil(ratio);
  // Rounded back to the tick's decimals so 5 * 0.000001 keys as 0.000005, not
  // 0.0000049999999999.
  return Number((k * s).toFixed(stepDecimals(step)));
}

/**
 * The wallet's resting orders on THIS market, grouped by the level they show
 * on. Orders on other markets are dropped by base/quote (case-insensitive), and
 * an order with nothing left resting marks nothing.
 */
export function ownLevels(
  orders: readonly OwnOrderLike[] | null | undefined,
  step: number | string,
  market: { base: string; quote: string },
): OwnLevels {
  if (!orders?.length) return NO_OWN_LEVELS;
  const base = market.base.toLowerCase();
  const quote = market.quote.toLowerCase();
  const out: OwnLevels = { bids: new Map(), asks: new Map() };
  for (const order of orders) {
    if (order.base && order.base.toLowerCase() !== base) continue;
    if (order.quote && order.quote.toLowerCase() !== quote) continue;
    const placed = Number(order.placed);
    if (!(placed > 0)) continue;
    const bucket = bucketPrice(order.price, step, order.isBid);
    if (bucket === null) continue;
    const side = order.isBid ? out.bids : out.asks;
    const key = levelKey(bucket);
    const prev = side.get(key);
    side.set(key, {
      size: (prev?.size ?? 0) + placed,
      symbol: prev?.symbol ?? order.assetSymbol ?? "",
      count: (prev?.count ?? 0) + 1,
    });
  }
  return out;
}
