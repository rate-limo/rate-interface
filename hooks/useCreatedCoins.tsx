"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getCreatorTokens } from "@/queries/server/tokens";
import { getCreatorAuctions } from "@/queries/server/profile";
import { useCrossChainNetworks } from "@/hooks/useCrossChainPositions";
import { mergeCreatedCoins, toAuctionRow, toLaunchRow, type CreatedCoinRow } from "@/lib/profile/coins";

/**
 * The Coins tab's rows — launches and auctions, on every chain.
 *
 * ## Why this fans out
 *
 * It read ONE chain, the one in `?chain=`, while the Open and Closed tabs
 * immediately beside it read every chain. So the same page mixed two
 * conventions, and a creator's work simply vanished depending on which chain
 * they happened to be looking at: wallet 0x9E7A…850E has FOUR launched coins on
 * Arc and EIGHTEEN on RISE, and never saw more than one of those numbers.
 *
 * A wallet is the same wallet everywhere — the argument `lib/portfolio/crossChain.ts`
 * makes for positions — and "coins you created" is a claim about the wallet, not
 * about a network.
 *
 * ## `networkName` still matters, as an ORDER
 *
 * It no longer selects what is fetched, but the chain being viewed is the one
 * whose coins the reader is most likely looking for, so it sorts first. Kept as
 * the first parameter so every call site is unchanged.
 *
 * ## Paging moved to the client, because it has to
 *
 * Each source pages its own list, and page 2 of four separate lists is not page
 * 2 of their union — the previous version documented that hazard for two sources
 * on one chain and solved it by refusing to offer a page it could not fill. With
 * N chains it stops being solvable that way, so this fetches a bounded slab per
 * chain and pages over the merged result, where the arithmetic is exact.
 *
 * `FETCH_LIMIT` is the honest edge: a chain with more launches than that is
 * truncated, and `truncated` says so rather than letting the count quietly lie.
 */

/**
 * How many coins to pull per chain per source.
 *
 * Well past any real creator on a testnet (the busiest wallet has 18), and small
 * enough that four chains is four ordinary requests. Raising it is cheap; the
 * reason it is bounded at all is that this runs on the DEFAULT tab of a public
 * profile, so it is the read most likely to be pointed at a stranger's wallet.
 */
const FETCH_LIMIT = 100;

/** A created coin that remembers which chain it is on — same reason
 *  `TaggedPosition` exists: the same symbol ships on several chains, and the
 *  address alone stops identifying a row once the lists are merged. */
export type TaggedCoinRow = CreatedCoinRow & { networkName: string };

interface ChainCoins {
  networkName: string;
  coins: TaggedCoinRow[];
  totalCount: number;
  /** True when this chain returned a full slab and may be hiding more. */
  truncated: boolean;
  /** True when the read failed — its coins are absent, not zero. */
  failed: boolean;
}

async function fetchChainCoins(networkName: string, address: string): Promise<ChainCoins> {
  const [launches, auctions] = await Promise.all([
    getCreatorTokens(networkName, address, FETCH_LIMIT, 1),
    getCreatorAuctions(networkName, address, FETCH_LIMIT, 1),
  ]);

  const launchRows = launches.tokens.map(toLaunchRow);
  const auctionList = Array.isArray(auctions?.auctions)
    ? (auctions.auctions as Record<string, unknown>[])
    : [];
  const auctionRows = auctionList.map(toAuctionRow);

  const auctionTotal = Number(auctions?.totalCount ?? 0);
  const totalCount = launches.totalCount + (Number.isFinite(auctionTotal) ? auctionTotal : 0);

  return {
    networkName,
    coins: mergeCreatedCoins(launchRows, auctionRows).map((coin) => ({ ...coin, networkName })),
    totalCount,
    truncated: launchRows.length >= FETCH_LIMIT || auctionRows.length >= FETCH_LIMIT,
    failed: false,
  };
}

export function useCreatedCoins(
  /** The chain being viewed. Sorts first; no longer decides what is fetched. */
  networkName: string,
  address: string | undefined,
  pageSize = 10,
  page = 1,
) {
  // Narrowed by the operator's admin overrides — see useCrossChainNetworks.
  const networks = useCrossChainNetworks();

  const results = useQueries({
    queries: networks.map((chain) => ({
      // No `page` in the key: the fetch is per chain and whole, and the page is
      // applied below. Keying on it would refetch every chain on every paginate.
      queryKey: ["created-coins", chain, address?.toLowerCase()],
      enabled: !!address,
      queryFn: async (): Promise<ChainCoins> => {
        if (!address) {
          return { networkName: chain, coins: [], totalCount: 0, truncated: false, failed: false };
        }
        return fetchChainCoins(chain, address);
      },
    })),
  });

  const statuses = useMemo(
    // Same joined-key memo as `useCrossChainPositions` — `results` is a fresh
    // array identity every render, and `status` + `dataUpdatedAt` together change
    // on exactly the transitions that alter `data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => results.map((r) => ({ status: r.status, data: r.data })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((r) => r.status).join(","), results.map((r) => r.dataUpdatedAt).join(",")],
  );

  const data = useMemo(() => {
    const answered = statuses
      .filter((r) => r.status === "success" && r.data)
      .map((r) => r.data as ChainCoins);
    const failedChains = statuses
      .map((r, i) => (r.status === "error" ? (networks[i] ?? "") : null))
      .filter((n): n is string => !!n);

    const all = answered.flatMap((c) => c.coins);
    /**
     * Viewed chain first, then newest.
     *
     * Not one global sort by `createdAt`: the chains' clocks are independent and
     * the reader arrived on a specific one. Within a chain, newest-first is what
     * the single-chain list already did.
     */
    const sorted = [...all].sort((a, b) => {
      const home = (row: TaggedCoinRow) => (row.networkName === networkName ? 0 : 1);
      if (home(a) !== home(b)) return home(a) - home(b);
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    const start = Math.max(0, (page - 1) * pageSize);
    return {
      coins: sorted.slice(start, start + pageSize),
      /**
       * The count of what was actually merged, NOT the sum of the servers'
       * totals. Those two agree except when a chain truncated, and a badge that
       * exceeds the list beneath it is the exact complaint this tab already had
       * from the gateway's own off-by-one.
       */
      totalCount: sorted.length,
      totalPages: Math.ceil(sorted.length / pageSize),
      failedChains,
      answeredChains: answered.map((c) => c.networkName),
      /** True when some chain had more coins than one slab. */
      truncated: answered.some((c) => c.truncated),
    };
  }, [statuses, networks, networkName, page, pageSize]);

  return {
    data,
    /** True while ANY chain has no answer yet — same rule as the positions read:
     *  `status === "pending"` rather than `isLoading`, so a paused fetch offline
     *  is not mistaken for a settled empty answer. */
    isLoading: !!address && statuses.some((r) => r.status === "pending"),
    /**
     * True when EVERY chain failed. The Coins tab is the DEFAULT tab, so a down
     * gateway rendering "this wallet hasn't created any coins" states something
     * about the wallet that was never read — the one claim this page must not
     * make. One chain failing is a caveat (`data.failedChains`), not a failure.
     */
    failed: !!address && statuses.length > 0 && statuses.every((r) => r.status === "error"),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
