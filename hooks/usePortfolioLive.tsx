"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventBus } from "@/utils/events";
import { useVisibleRefetchInterval } from "@/lib/portfolio/useVisiblePolling";
import { getSpotAccountOrders } from "@/queries/server/orders";
import { getSpotAccountOrderHistories } from "@/queries/server/orderhistories";
import { getSpotAccountTradeHistories } from "@/queries/server/tradehistories";
import { getLpPositions, getPoolLiquidity } from "@/queries/server/liquidity";
import { lpFeesUsdByToken } from "@/lib/portfolio/bandFees";
import { fetchLpPositions } from "@/hooks/useLpPositions";
import { toCreatorTokens, toHistoryRows, toLpPositions, toOpenOrders, toStopOrders, toTradeRows } from "@/lib/portfolio/live";
import { getStopOrderHistories, getStopOrders } from "@/queries/server/stoporders";
import { getCreatorTokens } from "@/queries/server/tokens";
import { getBasePairs } from "@/queries/server/pairs";
import { readLaunchPool } from "@/lib/portfolio/launchPoolRead";
import type { LaunchPoolRead } from "@/lib/portfolio/launchPool";
import { crossChainNetworks } from "@/hooks/useCrossChainPositions";
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
  rewards: { summary: { earnedPts: 0, claimablePts: 0, epochPts: 0, epoch: 0, referralPts: 0 }, rows: [] },
  referralSummary: { code: "", link: "", referred: 0, active: 0, earnedPts: 0, cutPct: 0 },
  creator: [],
  partial: false,
};

const PAGE_SIZE = 50;

export function usePortfolioLive(networkName: string, address: string | undefined) {
  /*
   * POLL, because on-chain work lands AFTER the transaction does.
   *
   * This had no interval, so it fetched on mount and then sat. A deposit,
   * order or swap confirms in the wallet and reaches these tables seconds
   * later — indexer, then broker, then gateway — so the user who acts and
   * immediately opens their portfolio is looking at the answer from BEFORE
   * they acted, with nothing on screen to say more is coming. Reported as "LP
   * positions do not update after providing liquidity"; the underlying deposit
   * was a separate bug, but this is why a WORKING one would still have looked
   * broken for a minute.
   *
   * Paused in a hidden tab: this is nine gateway reads per pass, and a tab
   * nobody is looking at does not need them. Same helper the balances use.
   *
   * FOUR seconds, down from fifteen. The window this closes is the one a user
   * actually experiences: place an order, switch to the portfolio, and find the
   * answer from before they acted with nothing on screen to say more is coming.
   * Fifteen seconds of that reads as a broken page, which is how it was
   * reported.
   *
   * The cost is bounded and was checked rather than assumed. Nine reads per
   * pass at 4 s is ~2.25 requests a second from one open tab, but they are nine
   * DIFFERENT endpoint classes, so each sees roughly one request per 4 s —
   * about 15 per minute against the gateway's 120-per-60 s class limit. The
   * hidden-tab pause is what keeps that true for someone with the page parked
   * in a background tab all day, and it matters roughly four times as much now.
   */
  const refetchInterval = useVisibleRefetchInterval(4_000);

  const { data, isLoading, error, refetch } = useQuery<PortfolioLive>({
    queryKey: ["portfolio-live", networkName, address],
    enabled: !!address && !!networkName,
    refetchInterval,
    // A poll must not blank the screen while it runs — the previous answer
    // stays until the next one lands.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      // `enabled` already gates on this; the check is what lets TS see it, and
      // it keeps the fetchers' non-optional contract honest.
      if (!address) return EMPTY_LIVE;

      const [orders, stopOrders, stopHistory, history, trades, swaps, lps, points, creator, lpTokens] = await Promise.allSettled([
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
        // Every served chain, not the page's: a launch belongs to the chain it
        // was made on and each row carries that network. Read from the page's
        // chain alone, a coin launched on RISE was missing from a portfolio
        // pinned to Arc (found by the ladder-launch e2e, 2026-10-02).
        creatorTokensEverywhere(networkName, address),
        // LP v2: one row per TOKEN, its bands inside -- the same read /pool uses.
        fetchLpPositions(networkName, address),
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
      const l = leg(lps, "liquidity/positions") ?? { ranges: [] };
      const tokens = leg(lpTokens, "lp-positions") ?? [];
      // getPoints never rejects, so this leg cannot mark the result partial —
      // it degrades to zeros internally, which for points is a true reading.
      const pts = points.status === "fulfilled" ? points.value : EMPTY_POINTS;
      const launchedByChain = leg(creator, "creator tokens") ?? [];

      const creatorRows = await Promise.all(
        launchedByChain.map(async ({ network, tokens: launched }) => {
          const pairsByBase = new Map<string, Record<string, unknown>>();
          await Promise.all(
            launched.map(async (token) => {
              const symbol = String(token.symbol ?? "");
              if (!symbol) return;
              try {
                const result = await getBasePairs(network, symbol);
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
          // The coin's band pool and own fee, from chain. After graduation the
          // order book is empty and everything the creator seeded is in the
          // pool, which the gateway's pair snapshot does not report.
          const launchPools = new Map<string, LaunchPoolRead>();
          await Promise.all(
            launched.map(async (token) => {
              const coin = String(token.id ?? "");
              const pair = pairsByBase.get(String(token.symbol ?? "").toUpperCase()) as
                | { base?: { decimals?: number; priceUSD?: number }; quote?: { id?: string; decimals?: number; priceUSD?: number } }
                | undefined;
              const quote = pair?.quote?.id;
              if (!coin.startsWith("0x") || !quote) return;
              const read = await readLaunchPool(network, {
                coin: coin as `0x${string}`,
                quote: quote as `0x${string}`,
                baseDecimals: Number(pair?.base?.decimals ?? 18),
                quoteDecimals: Number(pair?.quote?.decimals ?? 18),
                baseUsd: Number(pair?.base?.priceUSD),
                quoteUsd: Number(pair?.quote?.priceUSD),
              });
              if (read) launchPools.set(coin.toLowerCase(), read);
            }),
          );
          return toCreatorTokens(launched, network, pairsByBase, launchPools);
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
      // LP tokens feed the SAME map, keyed identically, so a pool holding both
      // generations costs one lookup.
      for (const t of tokens) {
        if (!t.active || !t.base || !t.quote) continue;
        markets.set(`${t.baseSymbol}/${t.quoteSymbol}`, { base: t.base, quote: t.quote });
      }
      const priceByPair = new Map<string, number | null>();
      await Promise.all(
        [...markets].map(async ([key, m]) => {
          // getPoolLiquidity already swallows non-ok and returns null, so a
          // missing APR degrades to an em-dash rather than failing the tab.
          const pool = await getPoolLiquidity(networkName, m.base, m.quote);
          aprByPair.set(key, pool?.aprPct ?? null);
          priceByPair.set(key, pool?.price ?? null);
        }),
      );

      /*
       * Lifetime fees per LP token -- the rest of the LP table. Never throws the tab
       * away: an outright failure leaves the map empty, which renders em-dashes.
       */
      let feesByToken = new Map<string, number | null>();
      if (tokens.length > 0) {
        try {
          feesByToken = await lpFeesUsdByToken(networkName, tokens, priceByPair);
        } catch (error) {
          partial = true;
          console.warn("usePortfolioLive: LP fees failed", error);
        }
      }

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
        lps: toLpPositions(l.ranges, networkName, aprByPair, tokens, feesByToken),
        rewards: { summary: toRewardSummary(pts), rows: toRewardRows(pts) },
        // Summary only. There are no live referee ROWS: they would want each
        // referee's address, join date and volume, and /points withholds the
        // referral graph on purpose while `theirVolumeUsd` has no source
        // anywhere. Publishing other people's wallets is a product and privacy
        // call, not a wiring one — so the table shows the count and says so.
        referralSummary: toReferralSummary(pts, code, origin),
        creator: creatorRows.flat(),
        partial,
      };
    },
  });

  // A launch, band deposit or withdrawal, or presale commitment of THIS wallet
  // arrives as one socket frame the instant the broker commits it; until
  // 2026-09-19 those published nothing and this hook learned of them on its
  // next 15 s poll. The frame carries no row, so the answer is a refetch.
  useEffect(() => {
    if (!address) return;
    const onActivity = (e: { account: string }) => {
      if (e.account.toLowerCase() === address.toLowerCase()) void refetch();
    };
    eventBus.on("spot-account-activity", onActivity);
    return () => {
      eventBus.off("spot-account-activity", onActivity);
    };
  }, [address, refetch]);

  return { data: data ?? EMPTY_LIVE, isLoading, error, refetch };
}

/**
 * The wallet's launches on every served chain, the page's chain first.
 * `getCreatorTokens` already degrades a failed chain to an empty list.
 */
async function creatorTokensEverywhere(pageNetwork: string, address: string) {
  const networks = [pageNetwork, ...crossChainNetworks().filter((n) => n !== pageNetwork)];
  return Promise.all(
    networks.map(async (network) => ({
      network,
      tokens: (await getCreatorTokens(network, address, PAGE_SIZE, 1)).tokens ?? [],
    })),
  );
}
