"use client";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/realtime/ws-url";
import type { ThesisMark } from "@/lib/chart/marks";

/** What the reader has narrowed the marks to. Both default to off. */
export interface MarkFilters {
  /** Only callouts by wallets the viewer follows. Needs `viewer`. */
  friendsOnly: boolean;
  /** Hide callouts anchored to a trade smaller than this, in USD. 0 is off. */
  minUsd: number;
}

/**
 * The callouts to draw on a chart, for a symbol and a visible time range.
 *
 * ## The filters are sent, not applied here
 *
 * `/tradingview/marks` caps its answer by stake before returning it, so
 * narrowing in the browser would filter the biggest fifty callouts rather than
 * the coin's callouts — a chart that shows fewer friends the busier the coin
 * gets. The route's own doc has the long version; the short one is that these
 * two parameters have to travel.
 *
 * ## Empty on failure, never an error state
 *
 * A chart whose marks fail to load is a chart, and the previous implementation
 * (the TradingView datafeed's `getMarks`) took the same position for the same
 * reason. There is nothing a reader can do about it and nothing worth saying, so
 * the marks are simply absent.
 */
export function useThesisMarks({
  networkName,
  symbol,
  from,
  to,
  viewer,
  filters,
  enabled = true,
}: {
  networkName: string;
  symbol: string;
  /** Unix seconds. The visible range, widened by the caller. */
  from: number;
  to: number;
  viewer?: string;
  filters: MarkFilters;
  enabled?: boolean;
}) {
  const friendsOnly = filters.friendsOnly && !!viewer;

  const { data, isLoading } = useQuery({
    // `from`/`to` are in the key, so panning refetches — but the caller rounds
    // them to whole buckets before passing them in, so a pixel of pan does not.
    queryKey: [
      "thesis-marks",
      networkName,
      symbol,
      from,
      to,
      friendsOnly ? viewer?.toLowerCase() : null,
      filters.minUsd,
    ],
    enabled: enabled && !!networkName && !!symbol && to > from,
    queryFn: async (): Promise<ThesisMark[]> => {
      const api = getApiUrl(networkName);
      if (!api) return [];
      const params = new URLSearchParams({
        symbol,
        from: String(from),
        to: String(to),
      });
      if (filters.minUsd > 0) params.set("minUsd", String(filters.minUsd));
      if (friendsOnly && viewer) {
        params.set("friendsOnly", "true");
        params.set("viewer", viewer);
      }
      try {
        const res = await fetch(`${api}/api/tradingview/marks?${params}`);
        if (!res.ok) return [];
        const body = (await res.json()) as { marks?: ThesisMark[] };
        return Array.isArray(body.marks) ? body.marks : [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  return { marks: data ?? [], isLoading: enabled && isLoading };
}
