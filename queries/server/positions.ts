"use server";
import { AggregatorLink } from "@/consts";

/**
 * The venue's best trades, across every chain — the social layout's RIGHT rail.
 *
 * ## Trades, not traders
 *
 * `queries/server/leaderboard.ts` ranks WALLETS: one row per person, values
 * summed across chains. This ranks POSITIONS: one row per (account, token), so a
 * trader holding three good positions occupies three rows. Both are "top" lists
 * and they answer different questions — which is why they are separate reads
 * rather than one with a flag.
 *
 * ## Why the aggregator and not a gateway
 *
 * Same reason as the boards: market data is partitioned one database per chain
 * and no table carries a `chainId`, so a gateway can only rank the trades it can
 * see. Asking one for "the best trades" gets the best trades ON THAT CHAIN under
 * a heading that claims otherwise.
 *
 * Never throws — a failed read costs the rail its rows and nothing else.
 */

export interface TopTradeRow {
  account: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followedByViewer: boolean | null;
  token: string;
  symbol: string | null;
  logoURI: string | null;
  amount: number;
  costUSD: number;
  /** Live price × amount. Null when the token has no price. */
  valueUSD: number | null;
  realizedPnlUSD: number;
  /** Null for an unpriced or closed position — never 0, which would read as
   *  "did not move" rather than "cannot be priced". */
  unrealizedPnlUSD: number | null;
  /** realised + unrealised, and what the row is ranked on. */
  value: number;
  closed: boolean;
  tradeCount: number;
  /** Which chain this trade happened on. Added by the aggregator's merge. */
  chain: string;
}

export interface TopTradesResponse {
  rows: TopTradeRow[];
  pageSize: number;
  page: number;
  chainsUsed?: string[];
  chainsMissing?: string[];
  exhaustive?: boolean;
}

export async function getTopTrades({
  pageSize,
  page,
  viewer,
}: {
  pageSize: number;
  page: number;
  viewer?: string;
}): Promise<TopTradesResponse | null> {
  const q = new URLSearchParams();
  if (viewer) q.set("viewer", viewer);
  const url = `${AggregatorLink}/api/leaderboard/positions/${pageSize}/${page}?${q.toString()}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getTopTrades: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as TopTradesResponse;
  } catch (error) {
    console.warn(`getTopTrades: request failed for ${url}`, error);
    return null;
  }
}
