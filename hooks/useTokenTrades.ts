"use client";

import { useQuery } from "@tanstack/react-query";
import { getSpotAccountTradeHistories } from "@/queries/server/tradehistories";
import type { RawThesisTradeRow } from "@/lib/thesis/candidates";

// Same server action + per-address route usePortfolioLive already reads
// (`/api/tradehistory/:address/:pageSize/:page`), called directly from a
// client hook the way usePortfolioLive does — no live/websocket concerns
// here, this is a one-shot read to populate a trade picker.
const PAGE_SIZE = 100;

/**
 * A wallet's own recent trades, raw — unfiltered by token. Callers narrow
 * with `selectThesisCandidates` (lib/thesis/candidates.ts) or similar rather
 * than this hook re-deriving what counts as "this token's" trade.
 */
export function useTokenTrades(networkName: string, address: string | undefined) {
  return useQuery<RawThesisTradeRow[]>({
    queryKey: ["thesis-candidate-trades", networkName, address],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      if (!address) return [];
      const data = await getSpotAccountTradeHistories(networkName, address, PAGE_SIZE, 1);
      return (data.tradeHistories ?? []) as unknown as RawThesisTradeRow[];
    },
  });
}
