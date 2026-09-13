"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { PonderLinks, supportedChains } from "@/consts";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { getAccountPositions } from "@/queries/server/account";
import { toAccountPositions } from "@/lib/portfolio/positions";
import {
  aggregate,
  partitionByStatus,
  toChainPositions,
  type ChainPositions,
  type CrossChainPositions,
} from "@/lib/portfolio/crossChain";

/**
 * Which chains a cross-chain read actually covers.
 *
 * `supportedChains` ∩ `PonderLinks` — a chain must be BOTH in the rollout and
 * have a gateway host, and the two lists disagree on purpose. `consts/index.ts`
 * spells out the ordering rule: a host that answers is a PREREQUISITE for
 * serving a chain, not the same claim, so `PonderLinks` may legitimately carry
 * an entry the rollout has not adopted yet.
 *
 * Iterating either list alone is the bug this avoids. `supportedChains` alone
 * would fan out to a chain with no host and count it as a failure forever;
 * `PonderLinks` alone would silently serve a chain the venue has not launched.
 */
export function crossChainNetworks(): string[] {
  return supportedChains.filter((name) => Boolean(PonderLinks[name]));
}

/**
 * The same list, minus what the operator has hidden in admin — use this, not
 * `crossChainNetworks`, anywhere a fan-out's result reaches a reader.
 *
 * ## The same bug, one hook over
 *
 * `useVisibleChains`' docstring records the original: hiding a chain in admin
 * removed it from the ChainSwitcher and the TokenPicker "and left its assets in
 * every cross-chain list on Explore. The flag was filtering the PICKERS while
 * the DATA came from a fan-out that had never heard of it." That fix covered the
 * aggregator's surfaces, and `useBalanceNetworks` covered the portfolio's
 * balances — which read chains directly rather than through the aggregator.
 *
 * The positions fan-out beside those balances is the third instance: a hidden
 * chain's orders, LP positions and unrealised PnL still summed into the
 * portfolio's totals, on the same screen where its balances had just stopped
 * appearing. A panel that hides a chain's assets and keeps its positions is
 * worse than one that shows both.
 *
 * ## It can only ever narrow, and only ever cosmetically
 *
 * `useVisibleChains` degrades to `supportedChains` when admin-service is
 * unreachable, so an outage leaves every chain visible rather than emptying the
 * portfolio. That direction is what makes this safe to depend on.
 *
 * ## Memoised on the NAMES
 *
 * `useVisibleChains` builds a fresh array every render, and these hooks are
 * array-driven (`useQueries` takes one query per chain). Feeding that identity
 * straight in refetches forever — the same reason `useBalanceNetworks` keys its
 * memo on the joined names.
 */
export function useCrossChainNetworks(): string[] {
  const visible = useVisibleChains();
  const key = visible.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined
  // names precisely because the array's identity changes every render.
  return useMemo(() => crossChainNetworks().filter((name) => visible.includes(name)), [key]);
}

/**
 * One wallet's positions across every chain, summed.
 *
 * ## Why a fan-out rather than a stored total
 *
 * See `lib/portfolio/crossChain.ts`. Short version: the ledger cannot move
 * (cost basis is an order-dependent fold behind the broker's single-writer
 * lock), and the two figures the UI leads with — value and unrealised PnL — are
 * `holdings × live price`, which `spotPositions` already refuses to store
 * because they are "stale the moment one moves". So the read fans out and the
 * sum happens here, fresh every time.
 *
 * ## One query per chain, deliberately
 *
 * `useQueries` rather than one query that awaits all of them: each chain caches,
 * retries and refetches independently, so a slow or dead gateway costs its own
 * row and nothing else. Under a single query the whole portfolio would wait for
 * the slowest chain, and one failure would blank every chain's numbers.
 *
 * ## A failed chain is not an empty chain
 *
 * `getAccountPositions` answers `null` on failure and never throws, and
 * `toAccountPositions(null, …)` degrades that to an EMPTY account — so by the
 * time the normal single-chain hook sees it, "the gateway is down" and "this
 * wallet holds nothing here" are the same value. That is fine for one chain,
 * where empty is the honest render either way. It is not fine when summing:
 * treating a dead chain as zero produces a confident, smaller portfolio.
 *
 * So the raw `null` is checked BEFORE mapping, and the chain is marked failed.
 * `CrossChainPositions.failedChains` is what a caller shows a caveat from.
 */
export function useCrossChainPositions(address: string | undefined) {
  const networks = useCrossChainNetworks();

  const results = useQueries({
    queries: networks.map((networkName) => ({
      queryKey: ["account-positions", networkName, address],
      enabled: !!address,
      queryFn: async (): Promise<ChainPositions> => {
        if (!address) return toChainPositions(networkName, null);
        // Raw, so `null` still means "could not read" here. Mapping first would
        // erase that distinction — see the note above.
        const raw = await getAccountPositions(networkName, address);
        if (!raw) return toChainPositions(networkName, null);
        return toChainPositions(networkName, toAccountPositions(raw, address));
      },
    })),
  });

  const statuses = useMemo(
    () => results.map((r) => ({ status: r.status, data: r.data })),
    // `status` and `dataUpdatedAt` together change on every transition that
    // alters `data`, and the array length is fixed by NETWORKS, so this is
    // stable. Joined because `results` is a fresh array identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((r) => r.status).join(","), results.map((r) => r.dataUpdatedAt).join(",")],
  );

  const { settled, pending } = useMemo(
    () => partitionByStatus(statuses, networks),
    [statuses, networks],
  );

  const data: CrossChainPositions = useMemo(() => aggregate(settled), [settled]);

  return {
    data,
    /**
     * True while ANY chain has no answer yet.
     *
     * `status === "pending"` rather than `isLoading`, for the reason
     * `partitionByStatus` documents: offline, a paused fetch reports
     * `isLoading: false` while holding no data, and the card would print a
     * settled `$0` for chains it never read. Gated on `address` because a
     * disabled query stays pending forever, and "loading" with nothing to load
     * is a spinner that never stops.
     */
    isLoading: !!address && pending.length > 0,
    /** Chains with no answer yet — neither answered nor failed. */
    pendingChains: pending,
    /** Refetch every chain — what a portfolio's Refresh control should call. */
    refetch: () => results.forEach((r) => void r.refetch()),
    networks,
  };
}
