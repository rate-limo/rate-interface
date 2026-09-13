"use client";
import { useQuery } from "@tanstack/react-query";
import {
  getEarnersLeaderboard,
  getLpLeaderboard,
  getPnlLeaderboard,
  type LeaderboardResponse,
  type PnlMetric,
  type PnlWindow,
} from "@/queries/server/leaderboard";

/** Which board the left column is showing. */
export type LeaderboardBoard = "pnl" | "earners" | "lps";

/**
 * The left column's data — one hook over both boards, because they are two tabs
 * of one control and switching between them must not remount the column.
 *
 * ## There is no chain here, on purpose
 *
 * Both boards are GLOBAL: the aggregator fans out to every chain and re-ranks,
 * so the answer does not vary with whichever chain the page happens to be
 * showing. Taking a `networkName` would be worse than redundant — it would put
 * the chain in the query key, refetching an identical board on every chain
 * switch, and gate `enabled` on a chain being selected, so a global ranking
 * would sit empty until the user picked one.
 *
 * `data` is `null` (not an empty list) when the read FAILS, so the column can
 * tell "nobody has traded yet" apart from "we could not ask" and say the honest
 * thing for each.
 *
 * Keyed on `viewer`, so connecting a wallet refetches and the rows come back
 * with `followedByViewer` populated rather than the button staying neutral until
 * a manual reload.
 */
export function useLeaderboard({
  board,
  window: w,
  metric,
  pageSize = 20,
  page = 1,
  viewer,
}: {
  board: LeaderboardBoard;
  window: PnlWindow;
  metric: PnlMetric;
  pageSize?: number;
  page?: number;
  viewer?: string;
}) {
  const { data, isLoading, error } = useQuery<LeaderboardResponse | null>({
    queryKey: ["leaderboard", board, w, metric, pageSize, page, viewer ?? null],
    queryFn: () => {
      if (board === "pnl") return getPnlLeaderboard({ window: w, metric, pageSize, page, viewer });
      // The LP board takes no window or metric: realised PnL and fees are
      // lifetime accumulators, exactly as the PnL board's own `all` is.
      if (board === "lps") return getLpLeaderboard(pageSize, page, viewer);
      return getEarnersLeaderboard({ season: "current", pageSize, page, viewer });
    },
  });

  return {
    /** Null means the route answered 404 or failed — NOT "no rows". */
    data: data ?? null,
    rows: data?.rows ?? [],
    isLoading,
    error,
  };
}
