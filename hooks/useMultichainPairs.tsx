"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AggregatorLink } from "@/consts";
import type { SpotPair } from "@/types";
import { useAggregatorChains } from "@/lib/chains/useVisibleChains";

/**
 * One pair list across every supported chain — the market counts, the Pools tab
 * and the Launches tab.
 *
 * The tokens half of Explore went cross-chain first (`useMultichainTokens`),
 * which left the page half-converted: a token table listing every chain sat
 * above a Markets tile counting one, and the tape read "1 chains". This is the
 * other half.
 *
 * ## Pairs are NOT folded, for the same reason tokens are not
 *
 * WBTC/USDC on two chains is two order books with their own depth and their own
 * price. Folding them by symbol would invent a market that nobody can trade.
 * Identity is (chain, pair address), so both appear and every row carries its
 * chain.
 *
 * Contrast the leaderboards, which DO fold: one wallet address is one person.
 * The difference is whether the thing being merged is the same thing on both
 * chains, and a market is not.
 *
 * ## `totalCount` is summed, and that is the point
 *
 * The Markets tile reads it. Per chain the gateways each report their own count,
 * so summing is what turns "5 markets" into the venue's real total — the number
 * the tile was always meant to show.
 *
 * ## Ranked on quote TVL
 *
 * The gateway's default pair order cannot survive a merge for the same reason
 * the token list's could not: it is keyed on an address, which across chains
 * interleaves meaninglessly. `dayQuoteTvlUSD` is the measure the venue already
 * treats as the real one — it is what graduation gates on — and null sorts last,
 * so a pair with no figure never leads the list.
 */
export interface MultichainPair extends SpotPair {
  chain: string;
}

export function useMultichainPairs(
  pageSize = 20,
  page = 1,
  options: "" | "unlisted" | "new" | "top-gainer" | "top-loser" = "",
  /** Restrict to these networks; omit for every served chain. Same filter the
   *  token lists take, so one control can govern the whole page. */
  chains?: readonly string[],
): {
  data: { pairs: MultichainPair[]; totalCount: number; totalPages: number; pageSize: number };
  isLoading: boolean;
  chainsLoaded: number;
  chainsTotal: number;
} {
  // Every VISIBLE chain when the caller names none — a hidden chain must not
  // supply pools to a cross-chain list. See `useAggregatorChains`.
  const resolved = useAggregatorChains(chains);
  const restrictKey = resolved.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["aggregated-pairs", pageSize, page, options, restrictKey] as const,
    staleTime: 6_000,
    queryFn: async () => {
      const segment = options === "" ? "" : `${options}/`;
      const query = restrictKey ? `?chains=${encodeURIComponent(restrictKey)}` : "";
      const response = await fetch(
        `${AggregatorLink}/api/pairs/${segment}${pageSize}/${page}${query}`,
      );
      if (!response.ok) throw new Error(`aggregator: ${response.status}`);
      return (await response.json()) as {
        pairs?: MultichainPair[];
        totalCount?: number;
        totalPages?: number;
        chainsUsed?: string[];
        chainsMissing?: string[];
      };
    },
  });

  return useMemo(() => {
    const used = data?.chainsUsed ?? [];
    const missing = data?.chainsMissing ?? [];
    return {
      data: {
        pairs: Array.isArray(data?.pairs) ? data.pairs : [],
        // Summed across chains by the aggregator, not the page length: this is
        // what the Markets tile reports, and a page is not a total.
        totalCount: Number(data?.totalCount ?? 0),
        totalPages: Number(data?.totalPages ?? 1),
        pageSize,
      },
      isLoading,
      chainsLoaded: used.length,
      chainsTotal: used.length + missing.length,
    };
  }, [data, isLoading, pageSize]);
}
