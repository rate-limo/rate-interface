"use client";

import { useQuery } from "@tanstack/react-query";
import { applyQuoteDisplay, type QuoteDisplayRow } from "@iter/types/quoteDisplay";

/**
 * An operator's curation of a chain's quote assets — order, and what to hide.
 *
 * NOT the allowlist. `AssetGenerator._quoteOptions` decides what a coin may be
 * quoted in, and the contract enforces it whatever this returns. This only
 * decides which quote the action dock offers first.
 *
 * Degrades to NO curation on any failure, which leaves the caller's own order —
 * markets by depth — exactly as it was before this existed. That is the safe
 * direction: an unreachable identity-service must not empty a picker.
 */
export function useQuoteDisplay(chainId: number | undefined) {
  return useQuery({
    queryKey: ["quote-display", chainId],
    enabled: Boolean(chainId),
    // An operator hiding a quote expects it gone in seconds; this is a handful
    // of rows.
    staleTime: 15_000,
    queryFn: async (): Promise<QuoteDisplayRow[]> => {
      const res = await fetch(`/chains/${chainId}/quotes`);
      if (!res.ok) return [];
      const body = (await res.json().catch(() => null)) as { quotes?: unknown } | null;
      if (!body || !Array.isArray(body.quotes)) return [];
      return body.quotes.flatMap((row) => {
        const q = row as Partial<QuoteDisplayRow>;
        if (typeof q.quoteAddress !== "string") return [];
        return [{
          quoteAddress: q.quoteAddress,
          rank: typeof q.rank === "number" ? q.rank : null,
          hidden: q.hidden === true,
        }];
      });
    },
  });
}

export { applyQuoteDisplay };
