"use client";

import { formatUnits } from "viem";
import { useGasPrice } from "wagmi";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";

/**
 * Gas price for the display chain, shaped for the status bar.
 *
 * Deliberately never reports a plain `0`: on an L2 a real sub-centigwei price
 * is normal, but rendering "0" reads as a dead feed rather than as cheap gas.
 * Anything that rounds away becomes "<0.01", and a failed or unconfigured read
 * becomes `unavailable` so the caller can show an em-dash instead of a number
 * it can't stand behind.
 */
export type GasReading =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ok"; gwei: string };

export function useNetworkGas(): GasReading {
  const { displayChainId } = useMarketPageContext();

  const { data, isLoading, isError } = useGasPrice({
    chainId: displayChainId,
    query: {
      refetchInterval: 30_000,
      // One retry: a chain that isn't in the wagmi config will never succeed,
      // and hammering it just to render one chip isn't worth it.
      retry: 1,
    },
  });

  if (isLoading) return { state: "loading" };
  if (isError || data === undefined) return { state: "unavailable" };

  const gwei = Number(formatUnits(data, 9));
  if (!Number.isFinite(gwei) || gwei <= 0) return { state: "unavailable" };

  return { state: "ok", gwei: gwei < 0.01 ? "<0.01" : gwei.toFixed(2) };
}
