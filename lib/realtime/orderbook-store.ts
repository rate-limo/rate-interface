"use client";

import type {
  GroupedOrder,
  GroupedOrderbookResult,
  SpotOrderBlockEvent,
} from "@/types";

const MAX_DEPTH = 100;
const DUST = 0.0000001;
const FLUSH_MS = 250;
/**
 * Levels kept per side, nearest the touch. Five times what is ever rendered.
 *
 * The maps are keyed by PRICE and only shrink when a delta arrives saying that
 * exact price is now empty. A level that simply stops being mentioned — the
 * common shape once a market has walked away from it — stays forever, so a tab
 * left open on an active venue accumulates an entry for every price ever
 * touched. Each is small; the point is that nothing bounded it.
 *
 * Pruning beyond this cap costs the display NOTHING: `computeSide` renders the
 * nearest `MAX_DEPTH` and its totals are summed over that same slice, so no
 * figure on screen reads a level past it. The price would have to walk through
 * five hundred grouped levels before a pruned one mattered, and a reconnect or
 * sequence gap reloads the whole book from a REST snapshot anyway.
 */
const RETAIN_PER_SIDE = MAX_DEPTH * 5;

interface Level {
  base: number;
  quote: number;
}

/**
 * Orderbook state held OUTSIDE React in two price→level maps. WebSocket
 * deltas mutate the maps in place; a computed immutable snapshot is produced
 * at most once per FLUSH_MS and consumed via useSyncExternalStore — so
 * message rate no longer drives render rate, and per-message object churn is
 * gone.
 */
export class OrderbookStore {
  private bids = new Map<number, Level>();
  private asks = new Map<number, Level>();
  private dirty = false;
  private listeners = new Set<() => void>();
  private snapshot: GroupedOrderbookResult;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private step: string,
    private symbol: string,
    initial?: GroupedOrderbookResult | null,
  ) {
    this.snapshot = initial ?? emptyBook(step);
    if (initial) this.loadGrouped(initial);
  }

  /** Replace all levels from a REST/WS snapshot. */
  applySnapshot(book: GroupedOrderbookResult): void {
    this.bids.clear();
    this.asks.clear();
    this.loadGrouped(book);
    this.dirty = true;
  }

  /** Apply one grouped-level delta (absolute liquidity at a price). */
  applyDelta(event: SpotOrderBlockEvent): void {
    const side = event.isBid ? this.bids : this.asks;
    if (event.baseLiquidity < DUST && event.quoteLiquidity < DUST) {
      side.delete(event.price);
    } else {
      side.set(event.price, {
        base: event.baseLiquidity,
        quote: event.quoteLiquidity,
      });
    }
    this.dirty = true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), FLUSH_MS);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): GroupedOrderbookResult => this.snapshot;

  private loadGrouped(book: GroupedOrderbookResult): void {
    for (const b of book.bids?.buckets ?? []) {
      this.bids.set(Number(b.price), {
        base: b.baseLiquidity,
        quote: b.quoteLiquidity,
      });
    }
    for (const a of book.asks?.buckets ?? []) {
      this.asks.set(Number(a.price), {
        base: a.baseLiquidity,
        quote: a.quoteLiquidity,
      });
    }
  }

  /**
   * Drop levels far from the touch, keeping the nearest `RETAIN_PER_SIDE`.
   *
   * Runs on flush rather than per delta: it is O(n log n) in the side's size and
   * a delta arrives per message, while a flush is capped at one per FLUSH_MS.
   * Skipped entirely until a side is actually over the cap, so the ordinary
   * market — tens of levels — never pays for it.
   */
  private prune(side: Map<number, Level>, order: "asc" | "desc"): void {
    if (side.size <= RETAIN_PER_SIDE) return;
    const prices = [...side.keys()].sort((a, b) => (order === "desc" ? b - a : a - b));
    for (const price of prices.slice(RETAIN_PER_SIDE)) side.delete(price);
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;

    // Bounded before the snapshot is computed, so the maps can never outgrow
    // the window the snapshot reads from.
    this.prune(this.bids, "desc");
    this.prune(this.asks, "asc");

    const bids = computeSide(this.bids, "desc");
    const asks = computeSide(this.asks, "asc");
    const totalLiquidityInQuote =
      bids.totalQuoteLiquidity + asks.totalQuoteLiquidity;

    const bidHead = Number(bids.buckets[0]?.price ?? 0);
    const askHead = Number(asks.buckets[0]?.price ?? 0);
    const spread = bidHead && askHead ? Math.abs(askHead - bidHead) : 0;
    const spreadPercentage =
      bidHead + askHead > 0
        ? Number(((spread / (bidHead + askHead)) * 100).toFixed(2))
        : 0;

    this.snapshot = {
      bids,
      asks,
      buyPercent: pct(bids.totalQuoteLiquidity, totalLiquidityInQuote),
      sellPercent: pct(asks.totalQuoteLiquidity, totalLiquidityInQuote),
      totalLiquidityInQuote,
      spread,
      spreadPercentage,
      symbol: this.symbol,
      step: this.step,
    };

    for (const listener of this.listeners) listener();
  }
}

function computeSide(
  levels: Map<number, Level>,
  order: "asc" | "desc",
): GroupedOrderbookResult["bids"] {
  const prices = [...levels.keys()].sort((a, b) =>
    order === "desc" ? b - a : a - b,
  );
  const capped = prices.slice(0, MAX_DEPTH);

  let totalBase = 0;
  let totalQuote = 0;
  for (const price of capped) {
    const level = levels.get(price)!;
    totalBase += level.base;
    totalQuote += level.quote;
  }

  let accBase = 0;
  let accQuote = 0;
  let accPct = 0;
  const buckets: GroupedOrder[] = capped.map((price) => {
    const level = levels.get(price)!;
    const percentage =
      totalBase > 0 ? Math.min((level.base / totalBase) * 100, 100) : 0;
    accBase += level.base;
    accQuote += level.quote;
    accPct += percentage;
    return {
      price: String(price),
      baseLiquidity: level.base,
      quoteLiquidity: level.quote,
      percentage,
      accumulatedBaseLiquidity: accBase,
      accumulatedQuoteLiquidity: accQuote,
      accumulatedPercentage: accPct,
    };
  });

  return {
    side: order === "desc" ? "bid" : "ask",
    totalBaseLiquidity: totalBase,
    totalQuoteLiquidity: totalQuote,
    buckets,
  } as GroupedOrderbookResult["bids"];
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Number(((part / total) * 100).toFixed(2));
}

function emptyBook(step: string, symbol = ""): GroupedOrderbookResult {
  return {
    bids: { side: "bid", totalBaseLiquidity: 0, totalQuoteLiquidity: 0, buckets: [] },
    asks: { side: "ask", totalBaseLiquidity: 0, totalQuoteLiquidity: 0, buckets: [] },
    buyPercent: 0,
    sellPercent: 0,
    totalLiquidityInQuote: 0,
    spread: 0,
    spreadPercentage: 0,
    symbol,
    step,
  };
}
