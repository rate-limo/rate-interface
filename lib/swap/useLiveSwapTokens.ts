"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { PonderLinks, chainIds, supportedChains } from "@/consts";
import type { SwapToken } from "./types";
import { WRAPPED_NATIVE, correctWrappedSymbol, nativeTokenFor } from "./wrap";

interface PairToken {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUSD: number;
  logoURI?: string;
}

async function fetchTokens(url: string): Promise<PairToken[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load swap markets (${response.status})`);
  const body = await response.json();
  return Array.isArray(body.tokens) ? body.tokens : [];
}

/**
 * One chain's swap token list, without the hook around it.
 *
 * Extracted so `lib/portfolio/useBalances.ts` can fetch every chain's list
 * through `useQueries` — an array-driven hook — instead of calling
 * `useLiveSwapTokens` in a loop, which would make the hook COUNT a function of
 * the chain list and break the rules of hooks. Same query key and same
 * `staleTime` on both sides, so the two share react-query's cache rather than
 * fetching the same list twice.
 */
export async function fetchSwapTokens(networkName: string): Promise<SwapToken[]> {
  const network = encodeURIComponent(networkName);
  const tokens = await fetchTokens(`/api/gateway/swap/tokens?network=${network}`);
  const chainId = chainIds[networkName] ?? 0;
  const listed = tokens.map((token) =>
    // The wrapped token arrives under whatever `adminTokenMeta` says, which on
    // RISE is "ETH" — the name of the asset it is NOT. Corrected before anything
    // downstream reads a symbol, so the native entry appended below is the only
    // thing called ETH.
    correctWrappedSymbol({
      address: token.id,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      priceUsd: token.priceUSD,
      logoURI: token.logoURI,
      chainId,
    }),
  );

  /**
   * The native asset, which the gateway cannot serve because it has no contract
   * to index. Without this entry a wallet holding native ETH had nothing to
   * select: the list offered only WETH, `balanceOf` on it read zero, and the
   * amount slider disabled itself with no way forward.
   *
   * Priced from the wrapped token it converts 1:1 with, and appended rather than
   * prepended so an existing user's list order does not shift under them.
   * `nativeTokenFor` returns null wherever native is not a distinct asset — on
   * Arc, where the gas asset IS the USDC ERC-20, no entry is added at all.
   */
  const wrapped = WRAPPED_NATIVE[chainId];
  const twin = wrapped
    ? listed.find((t) => t.address.toLowerCase() === wrapped.address.toLowerCase())
    : undefined;
  const nativeToken = nativeTokenFor(chainId, twin?.priceUsd ?? 0);
  return nativeToken ? [...listed, nativeToken] : listed;
}

export function useLiveSwapTokens(networkName: string, enabled: boolean) {
  return useQuery({
    queryKey: ["swap-tokens", networkName],
    enabled: enabled && Boolean(PonderLinks[networkName]),
    staleTime: 30_000,
    queryFn: () => fetchSwapTokens(networkName),
  });
}

/**
 * Every served chain's swap tokens at once — the token picker's default view.
 *
 * The picker used to browse ONE chain at a time, defaulting to the card's. That
 * made "find me USDC" a question you could only ask per network, which is the
 * opposite of what a picker is for.
 *
 * ## Tokens are not folded across chains
 *
 * USDC on RISE and USDC on Arc are two contracts with their own price and
 * liquidity, and only one of them is swappable from the card's current chain.
 * Both appear, each badged with its own chain, and the row carries `chainId` so
 * the card can re-home when a cross-chain one is chosen.
 *
 * ## Shares the single-chain cache
 *
 * Same query key as `useLiveSwapTokens`, so a picker opened on the card's chain
 * reuses what SwapCard already fetched, and filtering to one chain and back is
 * a cache hit rather than a refetch.
 */
export function useAllSwapTokens(
  enabled: boolean,
  /** Restrict to these networks; omit for every served chain. */
  chains?: readonly string[],
): { tokens: SwapToken[]; isLoading: boolean; chainsLoaded: number; chainsTotal: number } {
  const restrictKey = chains?.join(",") ?? "";
  const activeChains = useMemo(() => {
    const served = supportedChains.filter((name) => Boolean(PonderLinks[name]));
    if (!restrictKey) return served;
    const wanted = new Set(restrictKey.split(","));
    return served.filter((name) => wanted.has(name));
    // Keyed on the joined string, not the array — a fresh literal each render
    // would rebuild the query list forever.
  }, [restrictKey]);

  return useQueries({
    queries: activeChains.map((networkName) => ({
      queryKey: ["swap-tokens", networkName],
      enabled,
      staleTime: 30_000,
      queryFn: () => fetchSwapTokens(networkName),
    })),
    // `combine` is memoised by react-query, unlike a useMemo over `results`,
    // which is a new array on every render.
    combine: (results) => ({
      tokens: results.flatMap((r) => r.data ?? []),
      // Loading only while NOTHING has answered: one slow chain must not hold
      // the whole list behind a skeleton.
      isLoading: results.length > 0 && results.every((r) => r.isLoading),
      chainsLoaded: results.filter((r) => r.isSuccess).length,
      chainsTotal: results.length,
    }),
  });
}
