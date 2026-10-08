"use client";

import { useMemo } from "react";
import { formatUnits, parseUnits } from "viem";
import { useLadderBook } from "@/hooks/useLadderBook";
import { quoteLadderBuy, type LadderBuyQuote } from "@/lib/launch/ladderBuy";
import type { SwapQuote, SwapToken } from "@/lib/swap/types";
import type { SwapExecutionConfig } from "@/components/Swap/execution";

export interface LadderTrade {
  /** A buy walked across the ladder, when this trade is one. */
  buy: LadderBuyQuote | null;
  /** The quote to SHOW: the walk for a buy, the live quote otherwise. */
  quote: SwapQuote | null;
  /** The fill-or-refund order to SEND, or undefined for an ordinary swap. */
  order: SwapExecutionConfig["ladder"];
  /** True when this is a ladder trade either way — the refund note applies. */
  active: boolean;
}

/**
 * The swap card's and the Action Dock's ONE answer to "is this a launch coin
 * still selling its ladder, and if so what does this trade do" — see
 * lib/launch/ladderBuy for the rule.
 *
 * A BUY is quoted by walking the five steps' remaining amounts: the gateway's
 * route knows nothing of the ladder, and the pool it would route through is
 * closed until graduation. `maxPrice` is the highest step reached plus the
 * slippage setting; `minBaseOut` is the expected fill net of the coin's taker
 * fee, less the slippage. A SELL keeps the live quote: its floor and its
 * minimum are that quote lowered by the slippage. Both go through
 * `LadderBuyer`, which refunds whatever cannot fill in the same transaction.
 */
export function useLadderTrade(args: {
  networkName: string;
  pay: SwapToken;
  get: SwapToken | null | undefined;
  amountIn: number;
  /** Fraction, e.g. 0.005 for 0.5%. */
  slippage: number;
  liveQuote: SwapQuote | null | undefined;
  enabled: boolean;
}): LadderTrade {
  const { networkName, pay, get, amountIn, slippage, liveQuote, enabled } = args;
  const buyBook = useLadderBook(networkName, enabled ? get?.address : undefined, pay.address);
  const sellBook = useLadderBook(networkName, enabled ? pay.address : undefined, get?.address);

  return useMemo(() => {
    const none: LadderTrade = { buy: null, quote: liveQuote ?? null, order: undefined, active: false };
    if (!enabled || !get || !(amountIn > 0)) return none;

    if (buyBook.active) {
      let raw: bigint;
      try {
        raw = parseUnits(amountIn.toFixed(pay.decimals), pay.decimals);
      } catch {
        return none;
      }
      const buy = quoteLadderBuy(buyBook.steps, raw, pay.decimals, slippage * 100, buyBook.takerFeeNum);
      const delivered = Number(formatUnits(buy.netCoinsOut, get.decimals));
      const quote: SwapQuote | null = liveQuote
        ? { ...liveQuote, amountIn, delivered, deliveredUsd: delivered * get.priceUsd, placements: [], placedUsd: 0, minReceived: Number(formatUnits(buy.minBaseOut, get.decimals)) }
        : {
            amountIn,
            payUsd: amountIn * pay.priceUsd,
            route: [pay, get],
            hops: [],
            delivered,
            deliveredUsd: delivered * get.priceUsd,
            placedUsd: 0,
            placements: [],
            impactPct: 0,
            minReceived: Number(formatUnits(buy.minBaseOut, get.decimals)),
            feeUsd: 0,
          };
      return {
        buy,
        quote,
        order: buy.limitPrice > BigInt(0)
          ? { side: "buy", base: get.address, quote: pay.address, price: buy.limitPrice, minOut: buy.minBaseOut }
          : undefined,
        active: true,
      };
    }

    if (sellBook.active && liveQuote && liveQuote.delivered > 0) {
      const floor = Math.max(1, Math.floor((liveQuote.delivered / amountIn) * (1 - slippage) * 1e8));
      let minOut: bigint;
      try {
        minOut = parseUnits((liveQuote.delivered * (1 - slippage)).toFixed(get.decimals), get.decimals);
      } catch {
        return none;
      }
      return {
        buy: null,
        quote: liveQuote,
        order: { side: "sell", base: pay.address, quote: get.address, price: BigInt(floor), minOut },
        active: true,
      };
    }
    return none;
  }, [enabled, get, amountIn, buyBook, sellBook, pay, slippage, liveQuote]);
}
