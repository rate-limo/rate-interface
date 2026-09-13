"use client";

import { useQuery } from "@tanstack/react-query";
import type { BoardRank } from "@/queries/server/leaderboard";

/**
 * Where a wallet stands on the two global boards.
 *
 * ## Its own query, not a field on the profile
 *
 * The same argument `getPnlRank`'s docstring makes: a rank is a property of
 * every wallet on the venue, and the profile read is a property of one. Folding
 * it in would make opening any profile pay for an aggregate over both boards
 * across every chain — and this is a MODAL, opened by a single click on a
 * leaderboard row, so it has to paint before that finishes.
 *
 * So the strip arrives late and the modal does not wait for it. That is also why
 * a failure renders nothing rather than an error: a rank is supplementary, and a
 * profile without one is complete.
 *
 * ## Both boards in one query
 *
 * They are two requests, but they are never wanted separately — the strip shows
 * both or the wallet has neither — so one cache entry keeps them arriving
 * together instead of the pills popping in one at a time.
 */
export interface BoardRanks {
  pnl: BoardRank | null;
  lp: BoardRank | null;
}

async function readRank(path: string): Promise<BoardRank | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<BoardRank>;
    if (typeof body.totalCount !== "number") return null;
    return {
      rank: typeof body.rank === "number" ? body.rank : null,
      totalCount: body.totalCount,
      exhaustive: body.exhaustive !== false,
    };
  } catch {
    return null;
  }
}

/**
 * The PnL metric to rank on, defaulting to the RAIL'S OWN DEFAULT.
 *
 * `LeaderboardColumn` opens on `metric: "net"`, and the rank must agree with the
 * board a reader is looking at or the two contradict each other on screen. This
 * is not hypothetical arithmetic: measured on the live boards the moment these
 * routes shipped, ranks 2 and 3 SWAP between the two metrics —
 *
 *     realized   #1 QuietGoldenLeopard  #2 LuckyTawnyFerret  #3 JollyFrostyPanther
 *     net        #1 QuietGoldenLeopard  #2 JollyFrostyPanther  #3 LuckyTawnyFerret
 *
 * — so a strip defaulting to `realized` under a rail showing `net` would have
 * told two of the three wallets on this venue the wrong standing, today, with
 * both numbers visible at once.
 *
 * It is a parameter rather than a constant so a caller that KNOWS which metric
 * its reader selected can pass it; nobody does yet, because the modal opens from
 * surfaces with no metric of their own.
 */
export type PnlRankMetric = "net" | "realized";

export function useBoardRanks(
  address: string | undefined,
  metric: PnlRankMetric = "net",
): BoardRanks | undefined {
  const { data } = useQuery({
    queryKey: ["board-ranks", address?.toLowerCase(), metric],
    enabled: Boolean(address),
    // A rank moves when anyone trades, but nobody watches a modal for it to
    // tick. Long enough that reopening the same profile is free.
    staleTime: 60_000,
    queryFn: async (): Promise<BoardRanks> => {
      const encoded = encodeURIComponent(address as string);
      // One failing board must not cost the other its pill, so these settle
      // independently rather than racing through a single `Promise.all` reject.
      const [pnl, lp] = await Promise.all([
        readRank(`/api/aggregator/leaderboard/pnl/rank/${encoded}?metric=${metric}`),
        readRank(`/api/aggregator/leaderboard/lps/rank/${encoded}`),
      ]);
      return { pnl, lp };
    },
  });

  return data;
}
