"use client";
import { useQuery } from "@tanstack/react-query";
import { getTopTrades, type TopTradesResponse } from "@/queries/server/positions";

/**
 * The venue's best trades across every chain.
 *
 * ## No chain, deliberately
 *
 * The ranking is global — the aggregator fans out and re-ranks — so it does not
 * vary with whichever chain the page is showing. Taking a `networkName` would
 * put the chain in the query key and refetch an identical list on every switch,
 * the same trap `useLeaderboard` had.
 *
 * `viewer` IS a key, because it decides `followedByViewer` on each row:
 * connecting a wallet has to refetch or every follow button stays neutral.
 *
 * `data === null` means the read failed, which the rail renders differently from
 * an empty list. "We could not ask" and "nobody has traded" are different facts.
 */
export function useTopTrades({
  pageSize = 10,
  page = 1,
  viewer,
  enabled = true,
}: {
  pageSize?: number;
  page?: number;
  viewer?: string;
  enabled?: boolean;
} = {}) {
  const { data, isLoading, error } = useQuery<TopTradesResponse | null>({
    queryKey: ["top-trades", pageSize, page, viewer ?? null],
    enabled,
    staleTime: 30_000,
    queryFn: () => getTopTrades({ pageSize, page, viewer }),
  });

  return {
    rows: data?.rows ?? [],
    /** True only when the read failed — not when the venue has no trades yet. */
    failed: data === null,
    chainsMissing: data?.chainsMissing ?? [],
    isLoading: enabled && isLoading,
    error,
  };
}
