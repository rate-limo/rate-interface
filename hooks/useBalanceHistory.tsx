"use client";
import { useQuery } from "@tanstack/react-query";
import { getBalanceHistory } from "@/queries/server/profile";

/**
 * Days behind each timeframe button. One query, three widths — the table is
 * keyed `(account, index)` with a row per UTC day, so it has always BEEN the
 * series; only a read wider than "latest plus the one before" was missing.
 *
 * 1D asks for TWO days, not one, and that is the fix for a real defect rather
 * than a fudge. `accountBalanceDayBuckets` is keyed `(account, index)` — at
 * most one row per UTC day — so `days: 1` bounds the window to today and can
 * return at most one point. `hasHistory` needs two to draw a line, so the
 * DEFAULT tab could never render a chart no matter how long a wallet had been
 * recording, and switching to 1W made history appear, which read as 1D being
 * broken.
 *
 * Two days is what "since yesterday" actually needs: a point to draw from and a
 * point to draw to.
 */
export const TIMEFRAME_DAYS = { "1D": 2, "1W": 7, "1M": 30 } as const;
export type Timeframe = keyof typeof TIMEFRAME_DAYS;

export interface BalancePoint {
  /** UTC day ordinal — `Math.floor(ms / 86_400_000)`, NOT a timestamp. */
  index: number;
  /** Day start in ms, sent so a client never has to know the above. */
  startedAt: number;
  balanceUsd: number;
  totalTokens: number;
}

export interface BalanceChange {
  usd: number;
  percentage: number;
  /** The day the change is measured FROM, so a UI can say so instead of
   * implying a clean rolling window it does not have. */
  fromIndex: number | null;
}

/**
 * A wallet's recorded USD value over time.
 *
 * ## The series is sparse, and that is load-bearing
 *
 * A wallet only gets a row on days it was seen, so `points` has holes. They are
 * absent rather than zero-filled — a zero would draw a portfolio crashing to
 * nothing and recovering, which never happened. Anything plotting this must
 * position by `index`, not by array position, or a three-week gap renders as
 * one step.
 *
 * ## The figures are self-reported
 *
 * The browser computes the total from its own multicall and posts it; the
 * server cannot re-derive it. The write is now signed, so the number is
 * ATTRIBUTABLE — that wallet asserted it about itself and nobody can assert one
 * on anyone else's behalf — but it is not verified. `selfReported` rides along
 * on the response so a consumer cannot render it without having been told.
 *
 * ## Most wallets have nothing
 *
 * Recording became an explicit action when the write was signed (a wallet
 * prompt cannot hang off a background balance read), so a wallet that has never
 * recorded has no series at all. `hasHistory` says so plainly; the caller shows
 * the value without a chart rather than an empty axis pretending to be one.
 */
export function useBalanceHistory(
  networkName: string,
  address: string | undefined,
  timeframe: Timeframe,
) {
  const days = TIMEFRAME_DAYS[timeframe];

  const { data, isLoading, error, refetch } = useQuery<{
    points: BalancePoint[];
    latestUsd: number | null;
    change: BalanceChange | null;
    selfReported: boolean;
  } | null>({
    queryKey: ["balance-history", networkName, address?.toLowerCase(), days],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      if (!address) return null;
      const raw = await getBalanceHistory(networkName, address, days);
      if (!raw) return null;
      return {
        points: Array.isArray(raw.points) ? (raw.points as BalancePoint[]) : [],
        latestUsd: typeof raw.latestUsd === "number" ? raw.latestUsd : null,
        change: (raw.change as BalanceChange | null) ?? null,
        selfReported: raw.selfReported === true,
      };
    },
  });

  const points = data?.points ?? [];

  return {
    points,
    latestUsd: data?.latestUsd ?? null,
    change: data?.change ?? null,
    selfReported: data?.selfReported ?? true,
    /** Two points is the minimum that can draw a line; one is a dot, and a
     * single reading cannot express a change over any window. */
    hasHistory: points.length >= 2,
    /** True only when the read failed — not when the wallet has no history. */
    failed: data === null && !isLoading,
    isLoading,
    error,
    refetch,
  };
}
