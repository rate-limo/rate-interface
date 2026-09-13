"use client";
import { useQuery } from "@tanstack/react-query";
import { getSpotAccountTradeHistories } from "@/queries/server";
import type { SpotTrade } from "@/types";

/**
 * A wallet's trade history, read-only.
 *
 * ## Why this is not `useTradeHistory`
 *
 * That hook exists for the wallet YOU are signed in as, and it does three things
 * beyond fetching: it subscribes to `eventBus`, splices incoming fills into the
 * cached page, and toasts each one.
 *
 * All three are wrong on a public profile, and the middle one is a correctness
 * bug rather than noise. The WebSocket is opened by `OrderPageProvider` against
 * the CONNECTED wallet, but `eventBus` is a global singleton and that hook's
 * effect does not filter on the `address` it was called with — so viewing
 * `/profile/<someone-else>` while your own order fills would unshift YOUR trade
 * into THEIR history and toast it at you. The row would look like theirs.
 *
 * The live splice is also pointless here: a stranger's page is not a trading
 * surface, nobody is watching it for their own fill, and the WS is subscribed to
 * the wrong account to deliver theirs anyway.
 *
 * So this is the plain read — same gateway route, same fetcher, no event bus, no
 * toasts. `useTradeHistory` keeps its job on `/portfolio`, unchanged.
 */
export function useAccountTrades(
  networkName: string,
  address: string | undefined,
  pageSize = 15,
  page = 1,
) {
  const { data, isLoading, error, refetch } = useQuery<{
    trades: SpotTrade[];
    totalCount: number;
    totalPages: number;
  }>({
    queryKey: ["account-trades", networkName, address?.toLowerCase(), pageSize, page],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      const data = await getSpotAccountTradeHistories(networkName, address, pageSize, page);
      // `noAddress` is the fetcher's own guard, not a failure — it answers with
      // an empty page rather than throwing when there is nothing to ask about.
      if (data.noAddress) return { trades: [], totalCount: 0, totalPages: 0 };
      return {
        trades: data.tradeHistories ?? [],
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 0,
      };
    },
  });

  return {
    data: data ?? { trades: [], totalCount: 0, totalPages: 0 },
    isLoading,
    /** True when the read failed — distinct from an empty result, which is a
     * fact about the wallet rather than about the request. */
    failed: !!error,
    error,
    refetch,
  };
}
