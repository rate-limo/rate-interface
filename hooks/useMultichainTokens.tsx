"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AggregatorLink } from "@/consts";

import type { SpotToken } from "@/types";
import type { TokenRanking, TokenSource } from "./useTokens";
import { useAggregatorChains } from "@/lib/chains/useVisibleChains";

/**
 * One ranked token list across every served chain, from the AGGREGATOR.
 *
 * ## The fan-out moved out of the browser on 2026-09-04
 *
 * This hook used to ask each gateway itself and re-rank the answers with
 * `lib/multichain/mergeTokens`. That was the documented stopgap — the previous
 * version of this docstring said "`apps/aggregator` is where that belongs and
 * already does it for leaderboards; until it serves tokens, the client asks each
 * chain and merges" — and it now serves tokens, so this asks once.
 *
 * Two reasons it belongs there and not here, both already stated by
 * `apps/aggregator/src/api.ts`. A correct page needs over-fetching and
 * re-ranking (page 1 of a chain is not page 1 of the union), which is a rule no
 * client should be trusted to repeat identically — and there were two
 * implementations of it in this app alone, one here and one in
 * `useMultichainPairs`. And the fan-out cost N requests per render per caller;
 * it is now one, shared by react-query across every consumer of the same key.
 *
 * ## A failing chain still must not empty the page
 *
 * Unchanged, only relocated: the aggregator fans out with `allSettled` and
 * reports `chainsUsed` / `chainsMissing`, so a chain being down removes its rows
 * and leaves the rest ranked. `chainsLoaded` / `chainsTotal` are derived from
 * those, so a caller can still say "3 of 4 chains" rather than implying the list
 * is complete. Total failure is a 502 rather than an empty 200 — an empty
 * ranking is indistinguishable from "nothing has traded" and would be believed.
 */
export type MultichainToken = SpotToken & { chain: string };


export function useMultichainTokens(
  pageSize = 20,
  page = 1,
  ranking: TokenRanking | "" = "",
  source: TokenSource = "listed",
  /**
   * Restrict to these networks. Omit for every served chain.
   *
   * Passed through as `?chains=` so the AGGREGATOR narrows its own fan-out.
   * Filtering at the source rather than after the merge is the rule that has
   * always applied here: merging every chain and then discarding rows returns
   * fewer than `pageSize`, so a filtered view shows four rows where it asked for
   * twenty and looks like the chain has almost nothing on it.
   */
  chains?: readonly string[],
): {
  tokens: MultichainToken[];
  isLoading: boolean;
  chainsLoaded: number;
  chainsTotal: number;
} {
  // Omitting `chains` means "every VISIBLE chain", not "every served chain" — a
  // chain an operator has hidden must not rank in a cross-chain list just
  // because this caller passed nothing. See `useAggregatorChains`.
  const resolved = useAggregatorChains(chains);
  // Joined, not the array: a caller passing a fresh literal every render would
  // otherwise mint a new query key forever.
  const restrictKey = resolved.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["aggregated-tokens", pageSize, page, ranking, source, restrictKey] as const,
    staleTime: 30_000,
    queryFn: async () => {
      const segment = ranking === "" ? "" : `${ranking}/`;
      const params = new URLSearchParams();
      if (source !== "listed") params.set("source", source);
      if (restrictKey) params.set("chains", restrictKey);
      const query = params.toString();
      const response = await fetch(
        `${AggregatorLink}/api/tokens/${segment}${pageSize}/${page}${query ? `?${query}` : ""}`,
      );
      if (!response.ok) throw new Error(`aggregator: ${response.status}`);
      return (await response.json()) as {
        tokens?: MultichainToken[];
        chainsUsed?: string[];
        chainsMissing?: string[];
      };
    },
  });

  return useMemo(() => {
    const used = data?.chainsUsed ?? [];
    const missing = data?.chainsMissing ?? [];
    return {
      tokens: Array.isArray(data?.tokens) ? data.tokens : [],
      isLoading,
      chainsLoaded: used.length,
      // Derived from the answer, not from this app's `supportedChains`: the
      // aggregator's upstream set is where the rows actually came from, and a
      // chain it does not serve is not a chain that failed.
      chainsTotal: used.length + missing.length,
    };
  }, [data, isLoading]);
}
