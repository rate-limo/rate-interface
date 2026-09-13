"use client";

import { useGasPrice } from "wagmi";
import { formatUnits } from "viem";
import { wagmiChains } from "@/lib/customChains";

/**
 * What a transaction on this chain will cost in gas, in the chain's OWN asset.
 *
 * ## Why this exists
 *
 * The trade review's last row before the button read `Network fee · $0`, fed by
 * `quote.feeUsd` — which is the venue's TAKER fee, not gas, and which the live router
 * quote returns as `0` regardless. So the one number a user checks before signing was
 * mislabelled and, separately, always zero.
 *
 * Two different fees were sharing one row. They are now two rows, and this supplies the
 * one that was never being measured.
 *
 * ## Denominated per chain, never in dollars
 *
 * "Network fee" is not one currency here: gas is ETH on RISE and USDC on Arc, where the
 * native asset IS USDC at 18 decimals. A `$` figure would need a price for each chain's
 * gas asset — a second source that can disagree with the first — so this reports the
 * asset the wallet will actually be debited in, which is also what the user must hold.
 *
 * ## An estimate, and labelled as one
 *
 * `gasLimit` is the caller's expectation for the operation, and the real cost depends on
 * how many levels an order crosses. Reporting it as exact would be a claim this cannot
 * support; `state: "ok"` carries a figure the caller renders with an `est.` qualifier.
 *
 * Unknown is `unavailable`, never `0`. A zero fee is indistinguishable from a measured
 * one, and this venue's fees are small enough that a reader would believe it — the same
 * rule the status bar's gas chip already follows with its em-dash.
 */
export type NetworkFee =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ok"; amount: string; symbol: string };

/** Typical gas for the operations this app submits, measured on Arc and RISE. */
export const GAS_LIMITS = {
  /** A plain ERC-20 approval. Measured 56,048 on Arc. */
  approve: BigInt(60_000),
  /** One order against the book. `gasLevelsFor` sizes the real one per crossing. */
  order: BigInt(320_000),
} as const;

export function useNetworkFee(chainId: number | undefined, gasLimit: bigint): NetworkFee {
  const { data, isLoading, isError } = useGasPrice({
    chainId,
    query: { refetchInterval: 30_000, retry: 1, enabled: chainId !== undefined },
  });

  if (chainId === undefined || isLoading) return { state: "loading" };
  if (isError || data === undefined) return { state: "unavailable" };

  const chain = wagmiChains.find((c) => c.id === chainId);
  if (!chain) return { state: "unavailable" };

  const wei = data * gasLimit;
  const value = Number(formatUnits(wei, chain.nativeCurrency.decimals));
  if (!Number.isFinite(value) || value <= 0) return { state: "unavailable" };

  return {
    state: "ok",
    // Four significant figures, trailing zeros trimmed: Arc lands near 0.0017 and RISE
    // near 0.0000000000002, and one fixed precision cannot render both.
    amount: trimZeros(value < 0.0001 ? value.toExponential(2) : value.toPrecision(4)),
    symbol: chain.nativeCurrency.symbol,
  };
}

function trimZeros(value: string): string {
  return value.includes("e") ? value : value.replace(/\.?0+$/, "");
}
