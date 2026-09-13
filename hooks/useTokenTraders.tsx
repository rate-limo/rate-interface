"use client";
import { useQuery } from "@tanstack/react-query";
import { getTokenTraders, type TokenTradersResponse } from "@/queries/server/tokenTraders";

/**
 * The token profile's trader leaderboard.
 *
 * Refetched on an interval, but a slower one than the stats panel: a position is
 * a running total rather than a rolling window, so it does not go stale on its
 * own the way a 5m volume figure does — it only moves when someone trades.
 */
export function useTokenTraders(
  networkName: string,
  address: string | undefined,
  viewer?: string,
  pageSize = 25,
) {
  const { data, isLoading, error, refetch } = useQuery<TokenTradersResponse | null>({
    queryKey: ["token-traders", networkName, address?.toLowerCase(), viewer?.toLowerCase(), pageSize],
    enabled: !!address && !!networkName,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!address) return null;
      return getTokenTraders(networkName, address, pageSize, 1, viewer);
    },
  });

  return { data: data ?? null, isLoading, error, refetch };
}
