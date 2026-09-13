"use client";
import { useQuery } from "@tanstack/react-query";
import {
  EMPTY_SNAPSHOT,
  fetchUsdBalance,
  type BalanceSnapshot,
} from "@/lib/balances/report";

/**
 * The wallet's latest recorded USD balance, with the change since its previous
 * snapshot.
 *
 * This used to be `getTraderByAddress`, a Strapi read of a `traders` row with
 * its `usd_balances` relation populated — and the only field anything consumed
 * was `usd_balances[0]`. Nothing writes Strapi any more (see
 * `lib/balances/report.ts`), so the read moved with the write; leaving it would
 * have kept rendering the last figure the CMS received before the cutover.
 *
 * `networkName` is gone from the signature. A day bucket is keyed by account
 * alone and the figure reported is already the cross-chain total, so keying the
 * query by network would have produced one cache entry per chain for a value
 * that does not vary by chain.
 */
export const useTrader = (address: string) => {
  const { data, isLoading, error } = useQuery<BalanceSnapshot>({
    queryKey: ["usd-balance", address],
    enabled: !!address,
    queryFn: () => fetchUsdBalance(address),
  });

  return {
    // EMPTY_SNAPSHOT rather than `{}`: every field is explicitly null, so a
    // consumer that forgets to handle "no data" renders a dash instead of
    // `$0.00`, which would claim an empty wallet.
    data: data ?? EMPTY_SNAPSHOT,
    isLoading,
    error,
  };
};
