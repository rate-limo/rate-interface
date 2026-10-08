"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

import { useEffect, useState } from "react";
import { PonderLinks } from "@/consts";
import { eventBus } from "@/utils/events";
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
 * Both reads are REST. The chart's marker moves with the price the user types,
 * but the DEPTH does not depend on it, so typing must never refetch: that would
 * put a network call behind every keystroke to redraw something that did not
 * change.
 *
 * ## It used to fetch once per (pair, step) and then never again
 *
 * Which meant the chart drew the liquidity that existed when the card mounted,
 * for as long as it stayed on that pair. Deposit or withdraw from the pool the
 * chart is drawing and the bars did not move — not late, never. The rule above
 * is right about TYPING and was applied to the whole effect, so the one thing
 * that genuinely changes the depth could not reach it either.
 *
 * `spotAccountActivity` is the signal. The broker publishes it on
 * `spotAccount:<owner>` the instant a band deposit or withdrawal commits, the
 * socket forwards it onto the event bus, and a band-liquidity frame invalidates
 * what this is holding. It is the same frame `usePortfolioLive` already
 * refetches on.
 *
 * **What this does NOT cover, stated plainly: somebody ELSE's deposit or
 * withdrawal.** That frame goes to their account topic, not to this viewer, and
 * there is no venue-wide or per-pool liquidity topic to subscribe to instead —
 * the gateway serves `spotAccount:`, `spotBar:`, `spotOrderbook:<pair>` and
 * `spotTrade:<pair>` and nothing for pool depth. So this closes the case a user
 * can see themselves cause, and a pool-level topic is what would close the rest.
 * A poll interval was the alternative and is worse: it puts a request behind
 * every card on a timer to catch an event that is rare.
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
  /** The MARKET's own name, always canonical — see `inverted`. */
  pairSymbol?: string | null;
  /**
   * True when the route answered a question asked in the other token order.
   *
   * `base` here is whatever the user is PAYING, so half of all requests are
   * inverted and buying the base token is the inverted one. The gateway states
   * `price` and `ranges` in the order asked, but `pairSymbol` names the real
   * book — flipping it there would name a market that does not exist. So the
   * flip for display happens here, where the label sits beside the figures.
   */
  inverted?: boolean;
  ranges?: PoolRange[];
}

/**
 * `BASE/QUOTE` read the other way round, for labelling an inverted chart.
 *
 * Anything that is not exactly two parts is left alone: a symbol this cannot
 * parse is still the market's name, and a mangled one is worse than a
 * canonical one sitting beside inverted figures.
 */
function flipPairSymbol(symbol: string): string {
  const parts = symbol.split("/");
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]}/${parts[0]}` : symbol;
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
  // Bumped by a band-liquidity frame, and in the dep array below so the read
  // re-runs. A counter rather than a boolean: two withdrawals in a row must
  // produce two fetches, and a flag that is already true produces one.
  const [liquidityEpoch, setLiquidityEpoch] = useState(0);
  const base = pay.address;
  const quote = get?.address ?? "";

  useEffect(() => {
    const onActivity = (e: { kind?: string }) => {
      if (e.kind === "bandLiquidityAdded" || e.kind === "bandLiquidityRemoved") {
        setLiquidityEpoch((n) => n + 1);
      }
    };
    eventBus.on("spot-account-activity", onActivity);
    return () => {
      eventBus.off("spot-account-activity", onActivity);
    };
    // No account filter: the frame only ever reaches this browser for the
    // wallet it is subscribed as, and the chart is not per-wallet — any band
    // movement this viewer is told about is one the pool actually took.
  }, []);

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
      gatewayFetch(`${host}/orderbook/blocks/${base}/${quote}/${step}/50/false?${net}`).then((r) => {
        // A non-ok body is not a book. Parsing it anyway yields `{}`, whose
        // missing `buckets` reads downstream as a market with no orders — the
        // one answer this chart must never invent.
        if (!r.ok) throw new Error(`orderbook ${r.status}`);
        return r.json() as Promise<GroupedOrderbookResult>;
      }),
      gatewayFetch(`${host}/liquidity/depth/${base}/${quote}?${net}`).then((r) => {
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

      const symbol = depth?.pairSymbol ?? "";
      setState({
        bids,
        asks,
        ranges: depth?.ranges ?? [],
        mid,
        pairSymbol: depth?.inverted && symbol ? flipPairSymbol(symbol) : symbol,
        loading: false,
      });
    });

    return () => {
      disposed = true;
    };
  }, [networkName, base, quote, step, unit, liquidityEpoch]);

  return state;
}
