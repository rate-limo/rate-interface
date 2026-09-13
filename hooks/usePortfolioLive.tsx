"use client";
import { useQuery } from "@tanstack/react-query";
import { getSpotAccountOrders } from "@/queries/server/orders";
import { getSpotAccountOrderHistories } from "@/queries/server/orderhistories";
import { getSpotAccountTradeHistories } from "@/queries/server/tradehistories";
import { getLpPositions, getPoolLiquidity } from "@/queries/server/liquidity";
import { toCreatorTokens, toHistoryRows, toLpPositions, toOpenOrders, toStopOrders, toTradeRows } from "@/lib/portfolio/live";
import { getStopOrderHistories, getStopOrders } from "@/queries/server/stoporders";
import { getCreatorTokens } from "@/queries/server/tokens";
import { getBasePairs } from "@/queries/server/pairs";
import { mergeActivity } from "@/lib/portfolio/activity";
import { toSwapRows } from "@/lib/portfolio/swaps";
import { getSpotAccountSwaps } from "@/queries/server/swaps";
import { EMPTY_POINTS } from "@/lib/portfolio/rewards";
import { getPoints } from "@/queries/server/points";
import { toRewardRows, toRewardSummary } from "@/lib/portfolio/rewards";
import { toReferralSummary } from "@/lib/portfolio/referrals";
import { fetchReferralCode } from "@/lib/referral/link";
import type {
  ActivityRow,
  CreatorToken,
  HistoryRow,
  LpPosition,
  OpenOrder,
  StopOrder,
  ReferralSummary,
  RewardRow,
  RewardSummary,
} from "@/lib/portfolio/types";

/**
 * The three portfolio tabs that have a real source.
 *
 * Open orders, Order history and Trades come from
 * `/api/{orders,orderhistory,tradehistory}/:address/:pageSize/:page`. Those
 * routes and their fetchers already existed and had no callers; `PortfolioView`
 * built every tab from `indexerData()`.
 *
 * Creator ownership comes from `/api/tokens/creator/:address/:pageSize/:page`
 * and each row is enriched with its current indexed base pair. Referee rows are
 * the remaining fixture because no public route exposes that graph.
 *
 * ## Each leg fails on its own
 *
 * `Promise.allSettled`, not `all`. The three are independent questions, and one
 * rate-limited endpoint must not blank the other two tabs — the same rule the
 * balances panel follows for per-chain RPC reads, and the opposite of what the
 * trade banner used to do to the whole page.
 *
 * A rejected leg yields an empty array and warns. Empty is honest here: these
 * are lists, and "no rows" is what a wallet with no activity legitimately has.
 * The distinction the UI needs is loading-vs-loaded, which react-query gives it.
 */
export interface PortfolioLive {
  orders: OpenOrder[];
  stopOrders: StopOrder[];
  stopOrderHistory: StopOrder[];
  history: HistoryRow[];
  /** Swaps and orders in one timeline — see lib/portfolio/activity. */
  trades: ActivityRow[];
  lps: LpPosition[];
  rewards: { summary: RewardSummary; rows: RewardRow[] };
  /** Summary only — the referee rows stay on the mock. See the hook body. */
  referralSummary: ReferralSummary;
  creator: CreatorToken[];
  /** True when at least one leg failed, so the page can say so rather than imply emptiness. */
  partial: boolean;
}

export const EMPTY_LIVE: PortfolioLive = {
  orders: [],
  stopOrders: [],
  stopOrderHistory: [],
  history: [],
  trades: [],
  lps: [],
  rewards: { summary: { earnedPts: 0, claimablePts: 0, epochPts: 0, epoch: 0 }, rows: [] },
  referralSummary: { code: "", link: "", referred: 0, active: 0, earnedPts: 0, cutPct: 0, boostPct: 0, maxBoostPct: 0 },
  creator: [],
  partial: false,
};

const PAGE_SIZE = 50;

export function usePortfolioLive(networkName: string, address: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery<PortfolioLive>({
    queryKey: ["portfolio-live", networkName, address],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      // `enabled` already gates on this; the check is what lets TS see it, and
      // it keeps the fetchers' non-optional contract honest.
      if (!address) return EMPTY_LIVE;

      const [orders, stopOrders, stopHistory, history, trades, swaps, lps, points, creator] = await Promise.allSettled([
        getSpotAccountOrders(networkName, address, PAGE_SIZE, 1),
        getStopOrders(networkName, address, PAGE_SIZE, 1),
        getStopOrderHistories(networkName, address, PAGE_SIZE, 1),
        getSpotAccountOrderHistories(networkName, address, PAGE_SIZE, 1),
        getSpotAccountTradeHistories(networkName, address, PAGE_SIZE, 1),
        // The card's own history. A leg of its own rather than derived from
        // trades: a swap is one row per ROUTE and the trades feed is one per
        // order, so neither can be reconstructed from the other.
        getSpotAccountSwaps(networkName, address, PAGE_SIZE, 1),
        getLpPositions(networkName, address),
        getPoints(address),
        getCreatorTokens(networkName, address, PAGE_SIZE, 1),
      ]);

      let partial = false;
      const leg = <T,>(r: PromiseSettledResult<T>, name: string): T | null => {
        if (r.status === "fulfilled") return r.value;
        partial = true;
        console.warn(`usePortfolioLive: ${name} failed for ${networkName}`, r.reason);
        return null;
      };

      const o = leg(orders, "orders");
      const so = leg(stopOrders, "stoporders");
      const sh = leg(stopHistory, "stoporderhistory");
      const h = leg(history, "orderhistory");
      const t = leg(trades, "tradehistory");
      const sw = leg(swaps, "liquidity/swaps");
      // Both halves, or two empty lists — a failed leg must not make one of them
      // undefined and take the mapper down with it.
      const l = leg(lps, "liquidity/positions") ?? { ranges: [], bands: [] };
      // getPoints never rejects, so this leg cannot mark the result partial —
      // it degrades to zeros internally, which for points is a true reading.
      const pts = points.status === "fulfilled" ? points.value : EMPTY_POINTS;
      const launched = leg(creator, "creator tokens")?.tokens ?? [];

      const pairsByBase = new Map<string, Record<string, unknown>>();
      await Promise.all(
        launched.map(async (token) => {
          const symbol = String(token.symbol ?? "");
          if (!symbol) return;
          try {
            const result = await getBasePairs(networkName, symbol);
            const pair = result.pairs[0];
            if (pair) {
              pairsByBase.set(symbol.toUpperCase(), pair as unknown as Record<string, unknown>);
            }
          } catch (error) {
            partial = true;
            console.warn(`usePortfolioLive: creator pair failed for ${symbol}`, error);
          }
        }),
      );

      // Pool APR is a POOL-level figure and there is no per-position accrual, so
      // it is fetched once per distinct market the wallet actually has a
      // position in — not once per position. A wallet with eight ranges in one
      // pool costs one extra request, not eight.
      const aprByPair = new Map<string, number | null>();
      const markets = new Map<string, { base: string; quote: string }>();
      for (const p of l.ranges) {
        if (!p.active || !p.base || !p.quote) continue;
        markets.set(p.pairSymbol ?? `${p.base}/${p.quote}`, { base: p.base, quote: p.quote });
      }
      await Promise.all(
        [...markets].map(async ([key, m]) => {
          // getPoolLiquidity already swallows non-ok and returns null, so a
          // missing APR degrades to an em-dash rather than failing the tab.
          const pool = await getPoolLiquidity(networkName, m.base, m.quote);
          aprByPair.set(key, pool?.aprPct ?? null);
        }),
      );

      /*
       * The wallet's own code, minted on first ask.
       *
       * `/referral/code/:address` is a read that REGISTERS — see
       * `lib/referral/link`. Calling it here is deliberate rather than
       * incidental: the standing rule is that everyone leaves holding a code,
       * and a portfolio visit is exactly the moment one becomes shareable.
       *
       * It throws on failure, so it is caught here and degrades to no code —
       * which `toReferralSummary` renders as an empty link rather than a `/r/`
       * that resolves to nobody. A referral panel is not worth a blank tab.
       */
      let code: string | null = null;
      try {
        code = (await fetchReferralCode(address)).code;
      } catch (error) {
        console.warn("usePortfolioLive: referral code lookup failed", error);
      }

      // window is unavailable on the server; the summary needs an origin to
      // build a link that is not wrong.
      const origin = typeof window === "undefined" ? "" : window.location.origin;

      return {
        orders: toOpenOrders(o?.orders ?? [], networkName),
        stopOrders: toStopOrders(so?.orders ?? [], networkName),
        stopOrderHistory: toStopOrders(sh?.orderHistories ?? [], networkName),
        history: toHistoryRows(h?.orderHistories ?? [], networkName),
        // Merged, not concatenated. A card swap and the fills underneath it are
        // the same money, and both feeds return it — see lib/portfolio/activity.
        trades: mergeActivity(
          toSwapRows(sw?.swaps ?? [], networkName),
          toTradeRows(t?.tradeHistories ?? [], networkName, address),
        ),
        lps: toLpPositions(l.ranges, networkName, aprByPair, l.bands),
        rewards: { summary: toRewardSummary(pts), rows: toRewardRows(pts) },
        // Summary only. The referee ROWS stay on the mock deliberately: they
        // want each referee's address, join date and volume, and /points
        // withholds the referral graph on purpose while `theirVolumeUsd` has no
        // source anywhere. Publishing other people's wallets is a product and
        // privacy call, not a wiring one.
        referralSummary: toReferralSummary(pts, code, origin),
        creator: toCreatorTokens(launched, networkName, pairsByBase),
        partial,
      };
    },
  });

  return { data: data ?? EMPTY_LIVE, isLoading, error, refetch };
}
