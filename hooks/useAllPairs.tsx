import { gatewayFetch } from "@/lib/realtime/watermark";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { SpotPair } from "@/types";
import type { SpotPairData } from "./usePairs";

/**
 * Every market on a chain, searched SERVER-side.
 *
 * `usePairs` reads the listing-gated routes, which is right for a ranking and
 * wrong for a picker. Pro's market selector filtered
 * `defaultSpotPairData.pairs` — one gated page, already in memory — with
 * `String.includes`, so it could only ever find what that page already held.
 * On RISE it holds nothing: all four of that chain's markets are
 * `verified: false`, so the gated route answers `totalCount: 0` and the picker
 * offered no markets at all on the chain carrying the venue's real volume.
 *
 * This reads `/api/pairs/all/:pageSize/:page?q=` instead — ungated, ranked by
 * 24h quote volume, and filtered by the gateway rather than by the browser.
 * That distinction is the entire fix: filtering a page you already hold cannot
 * find the rows that page never contained. It is the same lesson the ⌘K modal
 * learned when it replaced `ExploreSearch`.
 *
 * ## Single chain, on purpose
 *
 * Pro is bound to `?chain=`, so this takes one `networkName` and does not fan
 * out. Offering a market that needs a network switch is worse than not
 * offering it — an injected wallet has to be standing on the chain to sign,
 * which is the wallet's rule and not something the app can paper over. The ⌘K
 * modal is the cross-chain surface and stays separate.
 */

/** Long enough to collapse a burst of typing into one request, short enough
 * that the list feels attached to the keyboard. Matches `useSearch`. */
export const PICKER_DEBOUNCE_MS = 200;

const EMPTY: SpotPairData & { degraded?: boolean } = {
  pairs: [],
  totalCount: 0,
  totalPages: 0,
  pageSize: 0,
};

/** The trailing-edge debounce, split out so the hook below reads as one idea. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function useAllPairs(networkName: string, query = "", pageSize = 50, page = 1) {
  const debounced = useDebounced(query.trim(), PICKER_DEBOUNCE_MS);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["pairs", "all", networkName, debounced, pageSize, page],
    queryFn: async (): Promise<SpotPairData & { degraded?: boolean }> => {
      const params = new URLSearchParams({ network: networkName });
      if (debounced) params.set("q", debounced);
      const response = await gatewayFetch(`/api/gateway/pairs/all/${pageSize}/${page}?${params}`);

      // A gateway that predates `/pairs/all` answers 404. Falling back to the
      // gated route keeps the two deployable in either order — the same rule
      // `OrderPageProvider` follows for a gateway older than the ws coalescer,
      // and it matters more here: shipping this app first would otherwise take
      // the picker from "works on Arc" to empty on BOTH chains, which is worse
      // than the bug being fixed.
      //
      // The fallback is exactly today's behaviour, filter included — a gated
      // page, narrowed in the browser. It stops being used the moment the
      // gateway deploys, with no second release needed.
      if (response.status === 404) {
        const gated = await gatewayFetch(`/api/gateway/pairs/${pageSize}/${page}?network=${encodeURIComponent(networkName)}`);
        if (!gated.ok) throw new Error(`Could not load markets (${gated.status})`);
        const data = (await gated.json()) as SpotPairData;
        const needle = debounced.toLowerCase();
        const pairs = needle
          ? (data.pairs ?? []).filter((p) => p.symbol?.toLowerCase().includes(needle))
          : (data.pairs ?? []);
        return { ...data, pairs, degraded: true };
      }

      if (!response.ok) throw new Error(`Could not load markets (${response.status})`);
      return (await response.json()) as SpotPairData;
    },
    enabled: Boolean(networkName),
    // The previous page's rows stay on screen while the next query settles.
    // Without it every keystroke empties the list to "no markets", which reads
    // as "no such market" rather than "still looking" — the exact failure this
    // hook exists to fix, reintroduced one layer up.
    placeholderData: keepPreviousData,
    staleTime: 6000,
  });

  const result = error ? EMPTY : (data ?? EMPTY);

  return {
    pairs: result.pairs as SpotPair[],
    totalCount: result.totalCount,
    /** True only for the FIRST load. A refetch behind `keepPreviousData` must
     * not render a spinner over rows that are still on screen. */
    isLoading,
    /** True whenever a request is in flight, including a background refetch —
     * for a subtle "searching" affordance, never for a skeleton. */
    isFetching,
    /** Whether the settled query differs from what the user has typed. Lets a
     * caller say "searching" during the debounce window instead of showing a
     * stale count as though it answered the new query. */
    isPending: debounced !== query.trim(),
    /** True while answering from the pre-`/pairs/all` gated route. The picker
     * says so rather than silently presenting a gated page as the whole book —
     * on RISE that page is empty, and "no markets" with no explanation is the
     * failure this hook exists to remove. */
    degraded: Boolean(result.degraded),
    error,
  };
}
