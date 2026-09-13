"use client";

import { useEffect, useState } from "react";
import { PonderLinks } from "@/consts";
import type { SwapToken } from "@/lib/swap/types";
import type { BookLevel, PoolRange } from "@/lib/swap/depth";
import type { GroupedOrderbookResult } from "@/types";

/**
 * The two liquidity sources a conditional order is placed against: the order
 * book and the pool, for ONE pair.
 *
 * One pair, deliberately. A conditional order rests on a single book — the card
 * already refuses to place one on a multi-hop route and says so — so there is no
 * meaningful depth chart for a route, only for the market the order lands on.
 *
 * Both reads are REST and happen once per (pair, step). The chart's marker moves
 * with the price the user types, but the DEPTH does not depend on it, so typing
 * must never refetch: that would put a network call behind every keystroke to
 * redraw something that did not change.
 */
export interface SwapDepth {
  bids: BookLevel[];
  asks: BookLevel[];
  ranges: PoolRange[];
  mid: number;
  pairSymbol: string;
  loading: boolean;
}

interface DepthResponse {
  exists?: boolean;
  price?: number | null;
  pairSymbol?: string | null;
  ranges?: PoolRange[];
}

const EMPTY: SwapDepth = { bids: [], asks: [], ranges: [], mid: 0, pairSymbol: "", loading: false };

export function useSwapDepth(
  networkName: string,
  pay: SwapToken,
  get: SwapToken | null,
  step: string,
  unit: "base" | "quote",
): SwapDepth {
  const [state, setState] = useState<SwapDepth>(EMPTY);
  const base = pay.address;
  const quote = get?.address ?? "";

  useEffect(() => {
    // Both reads go through the SAME-ORIGIN proxy, never at the gateway host
    // directly. The gateway rejects arbitrary browser origins — a direct fetch
    // from a dev server fails CORS before it is sent, and `Promise.allSettled`
    // below turns that into an empty chart rather than an error. Measured: the
    // direct call is `TypeError: Failed to fetch`, the proxied one is 200.
    // `app/api/gateway/[...path]` exists for exactly this and prefixes /api/.
    const host = PonderLinks[networkName] ? `/api/gateway` : "";
    const net = `network=${encodeURIComponent(networkName)}`;
    if (!host || !base || !quote) {
      setState(EMPTY);
      return;
    }
    let disposed = false;
    setState((s) => ({ ...s, loading: true }));

    // Settled, not all: the pool half failing must not cost the book half. A
    // chart with book depth and no pool hatch is still true; showing nothing
    // because one of two reads failed is a worse answer than a partial one.
    void Promise.allSettled([
      fetch(`${host}/orderbook/blocks/${base}/${quote}/${step}/50/false?${net}`).then((r) => {
        // A non-ok body is not a book. Parsing it anyway yields `{}`, whose
        // missing `buckets` reads downstream as a market with no orders — the
        // one answer this chart must never invent.
        if (!r.ok) throw new Error(`orderbook ${r.status}`);
        return r.json() as Promise<GroupedOrderbookResult>;
      }),
      fetch(`${host}/liquidity/depth/${base}/${quote}?${net}`).then((r) => {
        if (!r.ok) throw new Error(`pool depth ${r.status}`);
        return r.json() as Promise<DepthResponse>;
      }),
    ]).then(([bookRes, depthRes]) => {
      if (disposed) return;

      const book = bookRes.status === "fulfilled" ? bookRes.value : null;
      const depth = depthRes.status === "fulfilled" ? depthRes.value : null;

      // `GroupedOrder.price` is a STRING on the wire. Number() rather than
      // parseFloat: parseFloat("1.2abc") is 1.2, which would silently admit a
      // malformed level as a real one. A NaN here is filtered by `cumulativeBook`.
      const level = (b: { price: string; baseLiquidity: number; quoteLiquidity: number }): BookLevel => ({
        price: Number(b.price),
        // The bucket's own liquidity, as the grouper computed it — never
        // re-derived here. `groupOrdersByStep` is the single source of truth for
        // how orders become levels, and a second implementation of that is
        // exactly the drift this codebase keeps deleting.
        size: unit === "base" ? b.baseLiquidity : b.quoteLiquidity,
      });

      const bids = (book?.bids?.buckets ?? []).map(level);
      const asks = (book?.asks?.buckets ?? []).map(level);

      // Mid from the pool's indexed price when the book is one-sided or empty —
      // a chart still has an axis even with nothing resting on one side.
      const bestBid = bids.length ? Math.max(...bids.map((b) => b.price)) : 0;
      const bestAsk = asks.length ? Math.min(...asks.map((a) => a.price)) : 0;
      const bookMid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
      const mid = bookMid > 0 ? bookMid : (depth?.price ?? 0);

      setState({
        bids,
        asks,
        ranges: depth?.ranges ?? [],
        mid,
        pairSymbol: depth?.pairSymbol ?? "",
        loading: false,
      });
    });

    return () => {
      disposed = true;
    };
  }, [networkName, base, quote, step, unit]);

  return state;
}
