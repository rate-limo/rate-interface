"use client";
import { useQuery } from "@tanstack/react-query";
import { getTokenStats, type StatsWindow, type TokenStatsResponse } from "@/queries/server/tokenStats";

/**
 * The token profile's stats panel data, per timeframe.
 *
 * Refetched on an interval because every figure is a rolling window — a 5m panel
 * that never refreshes is wrong within five minutes, and wrong in the direction
 * that looks like a dead market rather than a stale page.
 */
export function useTokenStats(networkName: string, address: string | undefined, window: StatsWindow) {
  const { data, isLoading, error, refetch } = useQuery<TokenStatsResponse | null>({
    queryKey: ["token-stats", networkName, address?.toLowerCase(), window],
    enabled: !!address && !!networkName,
    // The shortest window this panel offers is 5m; a 30s refresh keeps even that
    // one honest without making the page chatty.
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!address) return null;
      return getTokenStats(networkName, address, window);
    },
  });

  return { data: data ?? null, isLoading, error, refetch };
}
