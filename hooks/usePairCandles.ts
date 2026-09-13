"use client";

import { useQuery } from "@tanstack/react-query";
import type { Candle } from "@/lib/liquidity/chart";
import type { ChartPeriod } from "@/lib/liquidity/types";

export type PairCandlePeriod = ChartPeriod | "1H" | "1W" | "1Y";

const PERIOD: Record<PairCandlePeriod, { seconds: number; resolution: string }> = {
  "1H": { seconds: 60 * 60, resolution: "1" },
  "1D": { seconds: 24 * 60 * 60, resolution: "60" },
  "7D": { seconds: 7 * 24 * 60 * 60, resolution: "240" },
  "1W": { seconds: 7 * 24 * 60 * 60, resolution: "240" },
  "1M": { seconds: 31 * 24 * 60 * 60, resolution: "1D" },
  "1Y": { seconds: 365 * 24 * 60 * 60, resolution: "1D" },
};

interface HistoryResponse {
  s?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

export type PairCandle = Candle & { timestamp: number; volumeUsd: number };

export function usePairCandles(networkName: string, symbol: string, period: PairCandlePeriod) {
  return useQuery({
    queryKey: ["pair-candles", networkName, symbol, period],
    enabled: Boolean(networkName && symbol),
    staleTime: 30_000,
    queryFn: async (): Promise<PairCandle[]> => {
      const config = PERIOD[period];
      const to = Math.floor(Date.now() / 1000);
      const params = new URLSearchParams({
        network: networkName,
        symbol,
        from: String(to - config.seconds),
        to: String(to),
        resolution: config.resolution,
      });
      const response = await fetch(`/api/gateway/tradingview/history?${params}`);
      if (!response.ok) throw new Error(`Could not load chart history (${response.status})`);
      const history = (await response.json()) as HistoryResponse;
      const size = Math.min(
        history.o?.length ?? 0,
        history.h?.length ?? 0,
        history.l?.length ?? 0,
        history.c?.length ?? 0,
      );
      return Array.from({ length: size }, (_, index) => ({
        o: history.o![index]!,
        h: history.h![index]!,
        l: history.l![index]!,
        c: history.c![index]!,
        timestamp: history.t?.[index] ?? 0,
        volumeUsd: history.v?.[index] ?? 0,
      }));
    },
  });
}
