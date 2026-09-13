"use client";
import { useQuery } from "@tanstack/react-query";
import { getAccountPositions } from "@/queries/server/account";
import { emptyAccountPositions, toAccountPositions } from "@/lib/portfolio/positions";
import type { AccountPositions } from "@/lib/portfolio/types";

/**
 * The Positions tab's data — `GET /api/account/:address/positions`, mapped
 * through `toAccountPositions` so a partial or failed response degrades field by
 * field instead of blanking the tab.
 *
 * A hook of its own rather than a tenth leg of `usePortfolioLive`, mirroring
 * `useAccountProfile`: both read the `/api/account/*` family, which is a
 * different surface from the per-address activity routes that hook fans out
 * over, and keeping them apart means a slow positions read cannot delay the
 * five tabs that have nothing to do with it.
 */
export function useAccountPositions(networkName: string, address: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery<AccountPositions>({
    queryKey: ["account-positions", networkName, address],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      if (!address) return emptyAccountPositions("");
      const raw = await getAccountPositions(networkName, address);
      return toAccountPositions(raw, address);
    },
  });

  return {
    data: data ?? emptyAccountPositions(address ?? ""),
    isLoading,
    error,
    refetch,
  };
}
