"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { gatewayFetch } from "@/lib/realtime/watermark";
import type { SpotPair } from "@/types";
import { PICKER_DEBOUNCE_MS, useDebounced } from "./useAllPairs";

/**
 * The data behind Pro's market picker, one hook per section.
 *
 * The launchpad opens on the order of 100k pairs a day, so the picker no longer
 * pretends to hold every market. Each read here is bounded however big the
 * catalogue gets:
 *
 *  - **Favorites / Recent**: the trader's own list, re-read by pair address.
 *  - **Listed**: graduated markets, by 24h volume.
 *  - **Trending**: launches that traded in the last 24h, by 24h volume.
 *  - **Search**: a name finds active markets by prefix; an address finds any
 *    market exactly. Everything else is reached by its pair link.
 *
 * See apps/gateway/src/api/marketQuery.ts for the server half of these rules.
 */
export const PICKER_PAGE = 50;

async function readPairs(path: string, networkName: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ network: networkName, ...params });
  const response = await gatewayFetch(`/api/gateway/${path}?${query}`);
  if (!response.ok) throw new Error(`Could not load markets (${response.status})`);
  return (await response.json()) as { pairs?: SpotPair[]; kind?: "name" | "address" | null };
}

/** Rows for a list of pair addresses, in the caller's order. */
export function usePairsByIds(networkName: string, ids: string[], enabled = true) {
  const key = ids.join(",");
  return useQuery({
    queryKey: ["pairs", "picker", "ids", networkName, key],
    queryFn: async () => (await readPairs("pairs/ids", networkName, { ids: key })).pairs ?? [],
    enabled: enabled && Boolean(networkName) && ids.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useListedPairs(networkName: string, enabled = true) {
  return useQuery({
    queryKey: ["pairs", "picker", "listed", networkName],
    queryFn: async () => (await readPairs(`pairs/${PICKER_PAGE}/1`, networkName)).pairs ?? [],
    enabled: enabled && Boolean(networkName),
    staleTime: 15_000,
  });
}

export function useTrendingPairs(networkName: string, enabled = true) {
  return useQuery({
    queryKey: ["pairs", "picker", "trending", networkName],
    queryFn: async () => (await readPairs(`pairs/trending/${PICKER_PAGE}/1`, networkName)).pairs ?? [],
    enabled: enabled && Boolean(networkName),
    // The gateway caches this for 30 s; asking more often gains nothing.
    staleTime: 30_000,
  });
}

/** True when `q` is a full address, which the server matches exactly. */
export function isAddressQuery(q: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(q.trim());
}

export function useFindPairs(networkName: string, query: string) {
  const debounced = useDebounced(query.trim(), PICKER_DEBOUNCE_MS);
  const result = useQuery({
    queryKey: ["pairs", "picker", "find", networkName, debounced],
    queryFn: async () => {
      const body = await readPairs("pairs/find", networkName, {
        q: debounced,
        limit: String(PICKER_PAGE),
      });
      return { kind: body.kind ?? null, pairs: body.pairs ?? [] };
    },
    enabled: Boolean(networkName) && debounced !== "",
    // The previous answer stays on screen while the next settles; an emptied
    // list on every keystroke reads as "no such market".
    placeholderData: keepPreviousData,
    staleTime: 6_000,
  });
  return { ...result, isPending: debounced !== query.trim() };
}
