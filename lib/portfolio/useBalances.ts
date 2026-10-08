"use client";

import { useCallback, useMemo } from "react";
import { useVisibleRefetchInterval } from "./useVisiblePolling";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { foldIndexedCoins, type IndexedCoinBalance } from "./indexedCoins";

/**
 * How often the INDEXED coin balances re-read while the tab is visible.
 *
 * 12s, and it can be this frequent because it is one indexed query per chain
 * against our own gateway rather than a multicall against a public RPC. A
 * creator watching for a deposit is the case this exists for, and the broker
 * has already folded the Transfer by the time it is asked.
 */
const COIN_POLL_MS = 12_000;
import { formatUnits } from "viem";
import { useQueries } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { PonderLinks, chainIds, networkNameToSlug, supportedChains } from "@/consts";
import { fetchSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import type { SwapToken } from "@/lib/swap/types";
import { multicall3For } from "@/lib/customChains";
import { withFeeTokens } from "@/lib/wallet/feeTokenRows";
import type { BalancesResult, ChainBalances, TokenBalance } from "./types";

const balanceOfAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

/** Multicall3's own balance reader. Standard across every deployment of it. */
const getEthBalanceAbi = [{
  type: "function",
  name: "getEthBalance",
  stateMutability: "view",
  inputs: [{ name: "addr", type: "address" }],
  outputs: [{ name: "balance", type: "uint256" }],
}] as const;

/**
 * Which chains a balance read covers — `supportedChains` ∩ `PonderLinks`.
 *
 * Both halves matter and the lists differ on purpose: `consts/index.ts` states
 * that a gateway host which answers is a PREREQUISITE for serving a chain, not
 * the same claim, so `PonderLinks` may carry an entry the rollout has not
 * adopted. Iterating `supportedChains` alone would read a chain with no token
 * list; iterating `PonderLinks` alone would show a chain the venue has not
 * launched.
 *
 * Computed once at module load. That is not just a micro-optimisation — the
 * hooks below are array-driven, and a list whose LENGTH changed between renders
 * would change the number of contract calls in a single `useReadContracts`,
 * which is fine, but a list that changed identity every render would refetch
 * forever.
 *
 * It is the BUILD's list, though, and the operator's is narrower — see
 * `useBalanceNetworks` below.
 */
const NETWORKS: readonly string[] = supportedChains.filter((name) => Boolean(PonderLinks[name]));

/**
 * The chains a balance read should actually cover — the build's list, minus what
 * the operator has hidden in admin.
 *
 * ## The same bug, one surface later
 *
 * `useVisibleChains`' own docstring records this: hiding a chain in admin
 * removed it from the ChainSwitcher and the TokenPicker "and left its assets in
 * every cross-chain list on Explore. The flag was filtering the PICKERS while
 * the DATA came from a fan-out that had never heard of it."
 *
 * That fix covered the aggregator's four surfaces. The portfolio was not one of
 * them, and it reads chains directly rather than through the aggregator — so a
 * chain an operator had taken down still showed its balances here, and still
 * counted toward the "Net worth · all chains" figure beside them. A hidden chain
 * is one the venue is not serving; a wallet's money on it is not part of what
 * this venue can show you.
 *
 * ## It can only ever narrow
 *
 * `useVisibleChains` degrades to `supportedChains` when admin-service cannot be
 * reached, so an outage leaves every chain visible rather than emptying the
 * panel. That direction is deliberate and is the one this hook depends on: a
 * balance panel that blanks because a config service is down would be a far
 * worse failure than one showing a chain that is briefly hidden.
 *
 * ## Memoised on the NAMES, not the array
 *
 * `useVisibleChains` builds a fresh array every render. Feeding that identity
 * straight into the array-driven hooks below is the refetch-forever loop the
 * note above warns about, so the join is what the memo keys on.
 */
function useBalanceNetworks(): readonly string[] {
  const visible = useVisibleChains();
  const key = visible.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined
  // names precisely because the array's identity changes every render.
  return useMemo(() => NETWORKS.filter((name) => visible.includes(name)), [key]);
}

/**
 * A wallet's token balances across every chain.
 *
 * ## This used to be one chain wearing a plural type
 *
 * The signature has always returned `chains: ChainBalances[]`, and
 * `ProfileHeader` has always printed "Net worth · all chains" beside the total.
 * The implementation returned `chains: [chain]` — one entry, always. The shape
 * and the label were both cross-chain; only the reads were not, so the heading
 * was wrong rather than merely incomplete.
 *
 * ## Two array-driven hooks, because a loop would break the rules of hooks
 *
 * The obvious fan-out is `useBalance`/`useReadContracts` once per chain, and it
 * is not allowed: hook COUNT must be stable across renders, and a per-chain
 * loop makes it a function of a list. Both hooks here take arrays instead, so
 * N chains cost the same two hook calls as one:
 *
 *  - `useQueries` fetches every chain's token list. The list is per-chain (a
 *    token address means nothing on another chain), so there is no merging it.
 *  - `useReadContracts` reads every balance on every chain in ONE call, because
 *    wagmi takes `chainId` PER CONTRACT.
 *
 * Native balance rides in that same array via **Multicall3's `getEthBalance`**
 * rather than a separate `useBalance` per chain. `useBalance` is not
 * array-driven, so it would reintroduce the loop; Multicall3 is configured for
 * every chain in `lib/customChains.ts`, so the native read becomes an ordinary
 * contract call and joins the batch. A chain missing that address simply
 * contributes no native row rather than breaking the batch.
 *
 * ## A failed chain reports `error`, never an empty wallet
 *
 * `ChainBalances.state` already had `"error"`; nothing ever set it, because a
 * single-chain read that failed rendered as an empty list and that was honest
 * enough. Summing changes that: a chain that failed and a chain holding nothing
 * both contribute 0, and only one of them means the total is trustworthy. The
 * state is set per chain and `totalUsd` covers the chains that answered, so a
 * caller can say the figure is a floor.
 */
export function useWalletBalances(
  _networkName: string,
  address?: `0x${string}`,
): BalancesResult {
  // Every read below is driven by this list, so hiding a chain in admin removes
  // it from the balances AND from the net-worth total they sum into.
  const networks = useBalanceNetworks();
  /**
   * The INDEXED read is polled; the RPC read is not.
   *
   * A first cut polled the multicall every 20s. That is the wrong thing to put
   * on a timer: it is a per-chain RPC read against endpoints the portfolio spec
   * calls rate-limited, and it costs the same whether or not anything moved. The
   * indexed read is one query against our own gateway, so it is cheap enough to
   * ask repeatedly — and for a launched coin it is also the FASTER answer, since
   * the broker folds the Transfer log as it arrives.
   *
   * So: launched coins update on their own, and everything else updates when the
   * reader asks. The Assets panel's refresh control is that ask, and it was
   * already there.
   */
  const coinPollInterval = useVisibleRefetchInterval(COIN_POLL_MS);
  // Token lists, one query per chain. Array-driven, so no hook-order problem.
  const tokenQueries = useQueries({
    queries: networks.map((networkName) => ({
      queryKey: ["swap-tokens", networkName],
      enabled: Boolean(address) && Boolean(PonderLinks[networkName]),
      staleTime: 30_000,
      queryFn: () => fetchSwapTokens(networkName),
      // The token LIST is not polled: it changes when a market is added, not
      // when a balance moves, and `staleTime` already refreshes it often
      // enough. Only the balance read below is on a timer.
    })),
  });

  /**
   * Every read, flattened, each tagged with the chain it belongs to so the
   * results can be put back afterwards. `useReadContracts` returns a flat array
   * in request order, so the index map is the only way home.
   */
  /**
   * Launched-coin balances, one query per chain.
   *
   * Per-chain rather than through the aggregator on purpose: `consts/index.ts`
   * draws that line — "reads that are RANKED belong [in the aggregator] … lists
   * a caller merely concatenates can stay on the per-chain gateways". A wallet's
   * holdings across chains are a concatenation; nothing here is re-ranked.
   */
  const coinQueries = useQueries({
    queries: networks.map((networkName) => ({
      queryKey: ["indexed-coin-balances", networkName, address ?? ""] as const,
      enabled: Boolean(address) && Boolean(PonderLinks[networkName]),
      refetchInterval: coinPollInterval,
      refetchIntervalInBackground: false,
      queryFn: async (): Promise<{ covered: boolean; balances: IndexedCoinBalance[] }> => {
        const response = await fetch(
          `${PonderLinks[networkName]}/api/wallet/${address}/coin-balances`,
        );
        // A chain that cannot answer contributes nothing, exactly like a failed
        // RPC read: the panel degrades per chain and never blanks on one.
        if (!response.ok) return { covered: false, balances: [] };
        const body = (await response.json()) as {
          covered?: boolean;
          balances?: IndexedCoinBalance[];
        };
        return {
          covered: body.covered === true,
          balances: Array.isArray(body.balances) ? body.balances : [],
        };
      },
    })),
  });

  /**
   * Coins the indexer already answers for, per chain, as lowercased addresses.
   *
   * Only from a chain reporting `covered`, and only `launched` rows: those are
   * the two conditions under which the indexed balance is exact and complete.
   * Anything else has to stay on the RPC read.
   *
   * Empty while the coin queries are still in flight, which is the safe
   * direction — the plan then includes everything, exactly as before, and
   * narrows on the next render rather than dropping a token on a guess.
   */
  const indexedByChain = useMemo(() => {
    const map = new Map<string, Set<string>>();
    networks.forEach((networkName, i) => {
      const data = coinQueries[i]?.data;
      if (!data?.covered) return;
      map.set(
        networkName,
        new Set(
          data.balances
            .filter((coin) => coin.launched && coin.balance > 0)
            .map((coin) => coin.token.toLowerCase()),
        ),
      );
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const plan = useMemo(() => {
    const contracts: {
      address: `0x${string}`;
      abi: typeof balanceOfAbi | typeof getEthBalanceAbi;
      functionName: "balanceOf" | "getEthBalance";
      args: readonly [`0x${string}`];
      chainId: number;
    }[] = [];
    const index: { networkName: string; token: SwapToken }[] = [];

    if (!address) return { contracts, index };

    networks.forEach((networkName, i) => {
      const chainId = chainIds[networkName];
      // Plus the fee tokens no market lists (Tempo's AlphaUSD/BetaUSD/ThetaUSD).
      const tokens = withFeeTokens(chainId, tokenQueries[i]?.data ?? []);
      if (!chainId) return;

      for (const token of tokens) {
        const isNative = token.symbol === "ETH";
        if (isNative) {
          const multicall = multicall3For(chainId);
          // No Multicall3 for this chain means no native row, not a broken
          // batch — the ERC-20 reads beside it still answer.
          if (!multicall) continue;
          contracts.push({
            address: multicall,
            abi: getEthBalanceAbi,
            functionName: "getEthBalance",
            args: [address] as const,
            chainId,
          });
        } else {
          // Already answered exactly by the indexer, so reading it again over
          // RPC buys nothing and costs a multicall slot on an endpoint that
          // rate-limits. The fold adds the indexed row in its place.
          if (indexedByChain.get(networkName)?.has(token.address.toLowerCase())) continue;
          contracts.push({
            address: token.address as `0x${string}`,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [address] as const,
            chainId,
          });
        }
        index.push({ networkName, token });
      }
    });

    return { contracts, index };
  }, [address, tokenQueries, indexedByChain]);

  const balanceQuery = useReadContracts({
    contracts: plan.contracts,
    allowFailure: true,
    query: {
      enabled: Boolean(address && plan.contracts.length),
    },
  });

  const chains = useMemo<ChainBalances[]>(() => {
    return networks.map((networkName, i) => {
      const tokenQuery = tokenQueries[i];
      const loading = Boolean(address) && (tokenQuery?.isLoading || balanceQuery.isLoading);
      // The token list failing is this chain's failure. The batch failing is
      // every chain's, and is reported on each — a partial read is still a
      // read we cannot trust to sum.
      const failed = Boolean(tokenQuery?.isError) || balanceQuery.isError;

      const rows: TokenBalance[] = [];
      plan.index.forEach((entry, slot) => {
        if (entry.networkName !== networkName) return;
        const raw = balanceQuery.data?.[slot]?.result;
        const amount = typeof raw === "bigint" ? Number(formatUnits(raw, entry.token.decimals)) : 0;
        if (amount <= 0) return;
        rows.push({
          symbol: entry.token.symbol,
          name: entry.token.name,
          amount: amount.toLocaleString("en-US", { maximumFractionDigits: 8 }),
          usdValue: amount * entry.token.priceUsd,
          logoURI: entry.token.logoURI,
        });
      });

      // The addresses behind `rows`, index-aligned, so the fold can tell which
      // coins the RPC read already covered. Rebuilt from `plan.index` rather
      // than carried on TokenBalance: the row shape is what the panel renders,
      // and an address on it would be a field no surface displays.
      const rowAddresses: string[] = [];
      plan.index.forEach((entry, slot) => {
        if (entry.networkName !== networkName) return;
        const raw = balanceQuery.data?.[slot]?.result;
        const amount = typeof raw === "bigint" ? Number(formatUnits(raw, entry.token.decimals)) : 0;
        if (amount <= 0) return;
        rowAddresses.push(entry.token.address);
      });

      // Launched coins, folded in. `covered: false` means this chain does not
      // index coin transfers at all, which is NOT the same as holding none —
      // see the gateway route. Treating it as "none" would hide a creator's own
      // coin, so an uncovered chain contributes nothing and the RPC read stands
      // alone, exactly as before this existed.
      const coins = coinQueries[i]?.data;
      const withCoins = coins?.covered
        ? foldIndexedCoins(rows, coins.balances, rowAddresses)
        : rows;

      return {
        network: networkName,
        slug: networkNameToSlug[networkName] ?? networkName,
        state: loading ? "loading" : failed ? "error" : "ok",
        tokens: withCoins,
        totalUsd: withCoins.reduce((sum, token) => sum + token.usdValue, 0),
        updatedAgo: "just now",
      };
    });
    // `coinQueries` is a new array each render; its DATA is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    balanceQuery.data,
    balanceQuery.isError,
    balanceQuery.isLoading,
    plan.index,
    tokenQueries,
    coinQueries.map((q) => q.dataUpdatedAt).join(","),
  ]);

  const refetchAll = useCallback(() => {
    tokenQueries.forEach((query) => void query.refetch());
    coinQueries.forEach((query) => void query.refetch());
    void balanceQuery.refetch();
  }, [balanceQuery, tokenQueries, coinQueries]);

  const refetchChain = useCallback(
    (network: string) => {
      const i = networks.indexOf(network);
      if (i >= 0) {
        void tokenQueries[i]?.refetch();
        void coinQueries[i]?.refetch();
      }
      void balanceQuery.refetch();
    },
    [balanceQuery, tokenQueries, coinQueries],
  );

  return {
    chains,
    // Only the chains that ANSWERED. A chain in error contributes nothing
    // rather than a zero, so the total is a floor and never a confident
    // understatement — same rule the cross-chain positions sum follows.
    totalUsd: chains
      .filter((chain) => chain.state === "ok")
      .reduce((sum, chain) => sum + chain.totalUsd, 0),
    loading: chains.some((chain) => chain.state === "loading"),
    refetchAll,
    refetchChain,
  };
}
