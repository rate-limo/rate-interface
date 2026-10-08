"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

import { useEffect, useState } from "react";
import type { SwapQuote, SwapToken } from "./types";

interface ApiHop {
  base: string;
  quote: string;
  bookDepthIn: number;
  poolDepthIn: number;
  matchedIn: number;
  matchedOut: number;
  leftoverIn: number;
  remainder: null | {
    depositToLP: {
      suggestedRange: { minPrice: number; maxPrice: number };
      convertsTo: number;
    };
  };
}

interface ApiRouteQuote {
  path: `0x${string}`[];
  amountIn: number;
  estimatedOut: number;
  priceImpactPct: number;
  hops: ApiHop[];
}

function tokenAt(address: string, tokens: SwapToken[]): SwapToken {
  const found = tokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
  if (!found) throw new Error(`Quote returned unknown token ${address}`);
  return found;
}

function toSwapQuote(raw: ApiRouteQuote, tokens: SwapToken[], slippagePct: number): SwapQuote {
  const route = raw.path.map((address) => tokenAt(address, tokens));
  const hops = raw.hops.map((hop, index) => {
    const from = route[index]!;
    const to = route[index + 1]!;
    const placedUsd = hop.leftoverIn * from.priceUsd;
    return {
      from,
      to,
      inUsd: hop.matchedIn * from.priceUsd + placedUsd,
      matchedUsd: hop.matchedIn * from.priceUsd,
      placedUsd,
      depthUsd: (hop.bookDepthIn + hop.poolDepthIn) * from.priceUsd,
    };
  });
  const placements = raw.hops.flatMap((hop, index) => {
    if (hop.leftoverIn <= 0) return [];
    const from = route[index]!;
    const to = route[index + 1]!;
    return [{
      from,
      to,
      inAmount: hop.leftoverIn,
      outAmount: hop.remainder?.depositToLP.convertsTo ?? 0,
      settlesToTarget: index === raw.hops.length - 1,
    }];
  });
  const deliveredUsd = raw.estimatedOut * route.at(-1)!.priceUsd;
  const placedUsd = placements.reduce((sum, placement) => sum + placement.inAmount * placement.from.priceUsd, 0);
  const range = raw.hops.find((hop) => hop.remainder)?.remainder?.depositToLP.suggestedRange;

  return {
    amountIn: raw.amountIn,
    payUsd: raw.amountIn * route[0]!.priceUsd,
    route,
    hops,
    delivered: raw.estimatedOut,
    deliveredUsd,
    placedUsd,
    placements,
    impactPct: raw.priceImpactPct,
    minReceived: raw.estimatedOut * (1 - slippagePct),
    feeUsd: 0,
    execution: {
      path: raw.path,
      lpMinPrice: range?.minPrice ?? 0,
      lpMaxPrice: range?.maxPrice ?? 0,
      lpSlippageLimit: 1_000_000,
    },
  };
}

export function useRouteQuote(args: {
  networkName: string;
  pay: SwapToken;
  get: SwapToken;
  tokens: SwapToken[];
  amountIn: number;
  slippagePct: number;
  enabled: boolean;
}) {
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!args.enabled) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (args.amountIn <= 0 || !args.pay.address || !args.get.address) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setQuote(null);
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          network: args.networkName,
          tokenIn: args.pay.address,
          tokenOut: args.get.address,
          amountIn: String(args.amountIn),
        });
        const response = await gatewayFetch(`/api/gateway/swap/route?${query}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not quote swap");
        // The gateway answers "these two tokens have no market" as a 200 carrying
        // `available: false` and a reason written in terms of the tokens involved.
        // Surface THAT rather than a generic failure: "ETH has no market here yet"
        // is actionable, "Quote unavailable" is not, and the two used to look
        // identical to a user because every non-2xx collapsed into one string.
        if (body && body.available === false) {
          setQuote(null);
          setError(typeof body.reason === "string" ? body.reason : "No route for this pair.");
          return;
        }
        setQuote(toSwapQuote(body as ApiRouteQuote, args.tokens, args.slippagePct));
      } catch (cause) {
        if (!controller.signal.aborted) {
          setQuote(null);
          setError(cause instanceof Error ? cause.message : "Could not quote swap");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [args.enabled, args.networkName, args.pay.address, args.get.address, args.amountIn, args.tokens, args.slippagePct]);

  return { quote, error, loading };
}
