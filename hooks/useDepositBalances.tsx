"use client";

import { useMemo } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";

/**
 * What the wallet can actually spend on a band deposit, read as ERC-20.
 *
 * NOT `tokenListWithBalance`. That list substitutes the wagmi NATIVE balance
 * onto whichever row matches a chain's `iter_native` entry, and on every chain
 * but Arc that row is the WRAPPED token — RISE's "ETH" is the WETH contract at
 * `0x008fCD63…`. A band deposit moves the ERC-20 through the position manager
 * with `transferFrom`, so the substituted figure describes a different balance
 * than the one being spent: an LP holding 0.5 native ETH and no WETH would have
 * been shown 0.5, passed the check, and had the approval spent before the
 * transfer failed.
 *
 * Arc is the case that makes the distinction legible rather than academic:
 * there the gas asset IS the USDC ERC-20 at `0x3600…`, one pool of funds behind
 * two interfaces, which is exactly why its `iter_native` group is deliberately
 * empty. Reading the ERC-20 is correct on both shapes without knowing which one
 * it is looking at.
 *
 * A FAILED read is absent from the map, never zero — the same rule the picker
 * and `checkDepositBalance` follow. An RPC that refuses must not be able to
 * block a deposit the wallet can afford.
 */
export function useDepositBalances(
  tokens: readonly { symbol: string; address?: string; decimals?: number }[],
): ReadonlyMap<string, number> | undefined {
  const { address } = useAccount();

  // A stable key, so a fresh array literal on every render does not restart the
  // read — this sits on a step whose amount fields re-render on each keystroke.
  const key = tokens
    .filter((t) => t.address)
    .map((t) => `${t.symbol}:${t.address}:${t.decimals ?? 18}`)
    .join("|");
  const list = useMemo(
    () =>
      key
        .split("|")
        .filter(Boolean)
        .map((entry) => {
          const [symbol, addr, decimals] = entry.split(":");
          return { symbol: symbol!, address: addr!, decimals: Number(decimals) };
        }),
    [key],
  );

  const { data } = useReadContracts({
    // Per contract, so one unreadable token does not discard the other's answer.
    allowFailure: true,
    contracts: list.map((t) => ({
      address: t.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address as `0x${string}`],
    })),
    query: { enabled: Boolean(address) && list.length > 0 },
  });

  return useMemo(() => {
    if (!address || !data) return undefined;
    const held = new Map<string, number>();
    list.forEach((token, i) => {
      const row = data[i];
      if (!row || row.status !== "success") return;
      held.set(token.symbol, Number(formatUnits(row.result as bigint, token.decimals)));
    });
    return held.size > 0 ? held : undefined;
  }, [address, data, list]);
}
