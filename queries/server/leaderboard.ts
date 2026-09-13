"use server";
import { AggregatorLink } from "@/consts";

/**
 * The two leaderboard reads behind the social layout's LEFT column.
 *
 * ## Both are served by the AGGREGATOR, not a gateway
 *
 * `apps/aggregator` fans out to every per-chain gateway and re-ranks. That
 * indirection is the point rather than an accident of deployment: market data is
 * partitioned one database per chain and no table carries a `chainId`, so no
 * single gateway can answer "who is winning" — it can only answer "who is
 * winning HERE". This file used to ask one chain and present the result as a
 * global board.
 *
 * The gateway routes still exist and are still correct; they are what the
 * aggregator consumes. See `apps/gateway/src/api/leaderboard.ts` for the two
 * things that shaped them: the PnL board answers only `all` (realised PnL is a
 * lifetime accumulator and fills carry no cost basis, so a windowed figure needs
 * the ledger replayed), and the earners board reads the frozen snapshot for a
 * closed season but sums the points ledger for an open one.
 *
 * Never throws, matching `getAccountProfile` and `getPoints`: a failed
 * leaderboard read must cost the left column its rows and nothing else on the
 * page. A `null` return means "could not read", which the column renders
 * differently from an empty board — those are different facts.
 */

/** Which figure the PnL board ranks on. See the note above on why this is a choice. */
export type PnlMetric = "realized" | "net";
export type PnlWindow = "1d" | "1w" | "1m" | "all";

export interface LeaderboardRow {
  account: string;
  /** Resolved from `admin.accountProfiles`; null when the wallet is unclaimed. */
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Dollars for the PnL board, points for the earners board. */
  value: number;
  /** Whether `viewer` follows this account. Null when no viewer was supplied —
   *  distinct from false, exactly as `TokenTrader.followedByViewer` is. */
  followedByViewer: boolean | null;

  /**
   * LP board only, and optional for that reason — every other board leaves them
   * undefined rather than sending zeros, so a renderer can tell "this board has
   * no fee concept" from "this wallet earned nothing".
   */
  realizedPnlUSD?: number;
  feesUSD?: number;
  totalUSD?: number;
  /** Basis still deployed. Deliberately NOT part of the ranking — see below. */
  openCostUSD?: number;
  /** Open positions marked to the band's live reserves, minus their basis. */
  unrealizedPnlUSD?: number;
  /** Unix seconds of the snapshot behind it; 0 when nothing was valued. */
  valuedAt?: number;
  positions?: number;
  openPositions?: number;
  pools?: number;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  /**
   * Which chains the ranking was assembled from, and which could not be
   * reached. Present only from the aggregator — a per-chain gateway has no way
   * to know, and no reason to.
   *
   * A board built from a subset is not the same claim as a complete one, so the
   * column has to be able to say so instead of quietly ranking fewer traders.
   */
  chainsUsed?: string[];
  chainsMissing?: string[];
  /** False when a chain filled its over-fetch page and may hold further rows
   *  belonging on this one — best-effort rather than provably the global top N. */
  exhaustive?: boolean;
  totalCount?: number;
  pageSize: number;
  page: number;
}

/**
 * Read a board from the AGGREGATOR, not a per-chain gateway.
 *
 * A leaderboard is the one thing on these pages that a single chain cannot
 * answer: market data is partitioned one database per chain and no table carries
 * a `chainId`, so a global ranking has to be assembled from every chain's answer
 * and re-ranked. Pointing this at `PonderLinks[networkName]` — which it did
 * until now — silently showed ONE chain's ranking under a heading that claims to
 * rank everyone.
 *
 * `networkName` is gone from the signature rather than ignored: keeping a
 * parameter the function no longer honours is how a caller comes to believe it
 * still scopes the request.
 */
async function readLeaderboard(path: string): Promise<LeaderboardResponse | null> {
  const url = `${AggregatorLink}${path}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    // A 404 is the expected answer until the route ships, and it is not worth a
    // console line on every render — anything else is a real fault worth seeing.
    if (response.status === 404) return null;
    if (!response.ok) {
      console.warn(`getLeaderboard: ${response.status} from ${url}`);
      return null;
    }
    return (await response.json()) as LeaderboardResponse;
  } catch (error) {
    console.warn(`getLeaderboard: request failed for ${url}`, error);
    return null;
  }
}

export async function getPnlLeaderboard(
  {
    window: w,
    metric,
    pageSize,
    page,
    viewer,
  }: {
    window: PnlWindow;
    metric: PnlMetric;
    pageSize: number;
    page: number;
    viewer?: string;
  },
): Promise<LeaderboardResponse | null> {
  const q = new URLSearchParams({ metric });
  if (viewer) q.set("viewer", viewer);
  return readLeaderboard(`/api/leaderboard/pnl/${w}/${pageSize}/${page}?${q.toString()}`);
}

/**
 * The LP board: who has actually made money providing liquidity.
 *
 * Ranked on realised PnL PLUS claimed fees, because those are the two ways
 * providing pays and an LP judging a pool needs both. They arrive as separate
 * fields as well as a total — the broker keeps them apart on purpose, since one
 * number answers "did I make money" while destroying "was providing here worth
 * it".
 *
 * Open positions contribute their basis to `openCostUSD` but NOT to the
 * ranking: valuing one needs a live read of the pool's reserves, and ranking
 * wallets on an approximation nobody can reproduce is worse than saying what is
 * still deployed and leaving it out.
 */
export async function getLpLeaderboard(
  pageSize = 10,
  page = 1,
  viewer?: string,
): Promise<LeaderboardResponse | null> {
  const q = new URLSearchParams();
  if (viewer) q.set("viewer", viewer);
  return readLeaderboard(`/api/leaderboard/lps/${pageSize}/${page}?${q.toString()}`);
}

export async function getEarnersLeaderboard(
  {
    season,
    pageSize,
    page,
    viewer,
  }: { season: number | "current"; pageSize: number; page: number; viewer?: string },
): Promise<LeaderboardResponse | null> {
  const q = new URLSearchParams();
  if (viewer) q.set("viewer", viewer);
  return readLeaderboard(`/api/leaderboard/earners/${season}/${pageSize}/${page}?${q.toString()}`);
}

/**
 * One wallet's standing on a merged board.
 *
 * Mirrors the aggregator's response. `rank` and `exhaustive` must be read
 * TOGETHER — see the field notes.
 */
export interface BoardRank {
  /** Competition rank, or null when this wallet is not in the merged set. */
  rank: number | null;
  /** Wallets on the merged board. The denominator a rank is meaningless without. */
  totalCount: number;
  /**
   * Whether the merged set is the whole board.
   *
   * The two reasons `rank` can be null are not interchangeable. `exhaustive`
   * true means every chain returned its complete board and this wallet is
   * genuinely unranked; false means the fan-out's window may simply not have
   * reached it. Rendering the second as "Unranked" tells a top-500 trader they
   * have no standing, so a caller must render it as nothing at all.
   */
  exhaustive: boolean;
}

/** Shared by both rank reads — the shape check is the same for either board. */
async function readRank(path: string): Promise<BoardRank | null> {
  const url = `${AggregatorLink}${path}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<BoardRank>;
    // A rank is supplementary, so a malformed answer renders as absent rather
    // than as a zero — `rank: 0` would print "#0" beside a real denominator.
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
 * Where this wallet stands on the GLOBAL PnL board.
 *
 * The aggregator's, not a gateway's. `getPnlRank` in `queries/server/profile.ts`
 * reads one chain and is still what the share card uses; this is for surfaces
 * that sit beside the merged rail, where a per-chain number would contradict the
 * row the reader just clicked.
 */
export async function getGlobalPnlRank(address: string): Promise<BoardRank | null> {
  if (!address) return null;
  return readRank(`/api/leaderboard/pnl/rank/${encodeURIComponent(address)}`);
}

/** …and on the global LP board, ranked on capital provided. */
export async function getGlobalLpRank(address: string): Promise<BoardRank | null> {
  if (!address) return null;
  return readRank(`/api/leaderboard/lps/rank/${encodeURIComponent(address)}`);
}
