"use client";

import { useQuery } from "@tanstack/react-query";
import { readSourceBalances, type SourceFunds } from "@/lib/transfer/sourceBalances";

/**
 * The external wallet's USDC across every chain it could bridge from.
 *
 * Includes the chain's GAS balance, not just the asset: a bridge burns on the
 * source chain, so USDC there with no gas to pay for the burn is not a deposit
 * anyone can make.
 *
 * Read over each chain's public RPC rather than through the connected wallet,
 * because an injected wallet is on one chain at a time — see
 * `lib/transfer/sourceBalances.ts` for why that matters and why a failed read is
 * absent rather than zero.
 *
 * Longer `staleTime` than the route list: a balance is the user's own money and
 * does not change because an operator edited something, and two dozen RPC calls
 * is not a thing to repeat on every render of a panel people open and close.
 */
export function useSourceBalances(address: string | null, chainIds: readonly number[]) {
  const key = [...chainIds].sort((a, b) => a - b).join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["source-balances", address?.toLowerCase(), key],
    enabled: address !== null && chainIds.length > 0,
    staleTime: 60_000,
    queryFn: () => readSourceBalances(address ?? "", chainIds),
  });

  return { balances: data ?? new Map<number, SourceFunds>(), isLoading };
}
