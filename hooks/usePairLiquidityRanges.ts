"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

import { useQuery } from "@tanstack/react-query";

export interface LiquidityHistogramBin {
  minPrice: number;
  maxPrice: number;
  base: number;
  quote: number;
}

export interface LiquidityRangesResponse {
  /**
   * False when the gateway has no pool for this pair at all — a 200-shaped
   * answer recovered from its 404, following the same rule `/swap/route` and
   * `/api/order/preview` already follow here: "these two tokens have no pool"
   * is a correct answer to a well-formed question, and rendering it as a load
   * failure tells the reader to retry something that will never succeed.
   *
   * It is a distinct state from an EMPTY histogram, which means the pool exists
   * and holds no indexed ranges. Collapsing the two says "none indexed" about a
   * market that has no pool to index — on RISE, every order-book-only pair.
   */
  poolExists: boolean;
  pool: string;
  price: number;
  positions: number;
  totalBase: number;
  totalQuote: number;
  histogram: LiquidityHistogramBin[];
  /**
   * The pool's bands as RAW price ranges, before the gateway bins them.
   *
   * The chart needs these rather than `histogram` because the two are binned on
   * different axes. The gateway spans exactly the liquidity it found — one band
   * at ±0.02% is a 0.04%-wide histogram — while the chart also draws the ORDER
   * BOOK, which on the same market spans percent, not hundredths of one. Using
   * the gateway's axis would clamp every resting order into the two end bins.
   *
   * So the chart bins both itself, over the union, and these are its input.
   */
  ranges: LiquidityRange[];
}

export interface LiquidityRange {
  minPrice: number;
  maxPrice: number;
  baseAmount: number;
  quoteAmount: number;
}

export function usePairLiquidityRanges(
  networkName: string,
  baseAddress: string,
  quoteAddress: string,
  bins = 40,
) {
  return useQuery({
    queryKey: ["pair-liquidity-ranges", networkName, baseAddress, quoteAddress, bins],
    enabled: Boolean(networkName && baseAddress && quoteAddress),
    staleTime: 15_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<LiquidityRangesResponse> => {
      const params = new URLSearchParams({ network: networkName, bins: String(bins) });
      const response = await gatewayFetch(
        `/api/gateway/liquidity/ranges/${encodeURIComponent(baseAddress)}/${encodeURIComponent(quoteAddress)}?${params}`,
      );
      // 404 is the gateway's "pool not found", which is a verdict rather than a
      // failure — see `poolExists`. Every other non-ok status is a real error
      // and still throws, so a broken gateway cannot masquerade as an empty
      // pool.
      if (response.status === 404) {
        return {
          poolExists: false,
          pool: "",
          price: 0,
          positions: 0,
          totalBase: 0,
          totalQuote: 0,
          histogram: [],
          ranges: [],
        };
      }
      if (!response.ok) throw new Error(`Could not load pool liquidity ranges (${response.status})`);
      const body = (await response.json()) as Omit<LiquidityRangesResponse, "poolExists">;
      return { ...body, ranges: body.ranges ?? [], poolExists: true };
    },
  });
}
