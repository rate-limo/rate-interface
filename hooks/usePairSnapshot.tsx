"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useOrderbook } from "@/hooks/useOrderbook";
import { useRecentTrades } from "@/hooks/useRecentTrades";
import { useLpPositions } from "@/hooks/useLpPositions";
import { composePairSnapshot } from "@/lib/pair/snapshot";
import { getPoolLiquidity } from "@/queries/server/liquidity";
import type { PairSnapshot } from "@/lib/pair/types";
import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import type { SpotPair } from "@/types";

/**
 * The pair profile's live data, assembled from three independent legs.
 *
 * This hook is deliberately thin: every rule worth testing lives in
 * `composePairSnapshot`, which is pure, because this repo's vitest runs in the
 * node environment and cannot render a hook. What is left here is wiring.
 *
 * ## Two legs are the terminal's, reused as-is
 *
 * `useOrderbook` and `useRecentTrades` already exist, already subscribe over the
 * websocket, and already power `/trade/pro` through `TradePageProvider`. The
 * profile uses them directly rather than mounting that provider, which also
 * carries order tickets, wallet state and layout — a reading surface has no
 * business holding the trading surface's state.
 *
 * Both hooks catch their own failures and expose `status`/`error`; a leg that
 * failed arrives here as an empty book or an empty trade list, and the composer
 * turns that into nulls.
 *
 * ## The third leg is a plain read, and it must not throw
 *
 * `getPoolLiquidity`/`getLpPositions` return null on any non-ok response rather
 * than throwing — see the note in `queries/server/liquidity.ts` for the outage
 * that convention exists to prevent. The effect below still carries its own
 * try/catch, because "this query promises not to throw" is a weaker guarantee
 * than "this effect cannot take the page down".
 */
export function usePairSnapshot({
    pair,
    step,
    seed,
}: {
    pair: SpotPair;
    /** Price-grouping step, computed server-side by getDefaultScale. */
    step: string;
    /** Server-fetched first book, so the page paints with real depth. Null if that read failed. */
    seed: GroupedOrderbookResult | null;
}): PairSnapshot {
    const { displayNetworkName, address } = useMarketPageContext();

    const { data: book } = useOrderbook(
        displayNetworkName,
        pair,
        pair.base,
        pair.quote,
        step,
        11,
        false,
        // The store seeds from this and then maintains itself over the socket. A
        // null seed is survivable: the hook's own resync fetches one on mount.
        (seed ?? undefined) as GroupedOrderbookResult,
    );

    const { data: trades } = useRecentTrades(displayNetworkName, pair.base, pair.quote);

    const baseId = pair.base?.id;
    const quoteId = pair.quote?.id;

    /**
     * The pool leg, on a live query rather than a one-shot effect.
     *
     * It WAS a `useEffect` keyed on `[network, baseId, quoteId]`. None of those
     * change when somebody trades, so realised APR and 24h LP fees held whatever
     * they were when the tab opened — reported by a user as "the page does not
     * update after buying or selling".
     *
     * The interval follows `useLiveTokenStats`, which already solved this for the
     * token profile and states the rule in its own comment: the socket says WHEN,
     * the poll still says WHAT. These figures are derived from a trailing 24h
     * window server-side, so a minute's granularity is the honest resolution —
     * polling faster would redraw the same number.
     */
    const { data: pool = null } = useQuery({
        queryKey: ["pair-pool-liquidity", displayNetworkName, baseId, quoteId],
        enabled: Boolean(baseId && quoteId),
        // getPoolLiquidity returns null rather than throwing (see its own note);
        // `?? null` keeps react-query from treating undefined as "no data yet".
        queryFn: async () => (await getPoolLiquidity(displayNetworkName, baseId as string, quoteId as string)) ?? null,
        refetchInterval: 60_000,
    });

    /**
     * The wallet's BAND positions — the leg that was missing entirely.
     *
     * `useLpPositions` is the reader that already knows how to do this: it joins
     * the gateway's per-token ledger with `BandPositionManager.portfolio()` in one
     * call, so each band arrives with its tolerance, its USD value and its vesting
     * ramp. The profile previously called `getLpPositions`, which returns only the
     * Pool.sol RANGE half of the same response and drops `lpPositions` — so every
     * band position, which is every position the deposit UI creates, reached this
     * page as an empty list and rendered as the word "none".
     *
     * Reusing the hook rather than re-reading the route also means one cache entry
     * for the portfolio, the pool page and this one.
     */
    const { data: bandTokens = null } = useLpPositions(displayNetworkName, address);

    return useMemo(
        () =>
            composePairSnapshot({
                pair,
                // The stores hand back an empty shape rather than null before the
                // first fill; treat "no levels at all" as a leg that has not
                // answered, so the UI marks it rather than showing an empty book
                // as a measured fact.
                book: book?.bids?.buckets?.length || book?.asks?.buckets?.length ? book : null,
                trades: trades ?? null,
                pool,
                // The Pool.sol RANGE leg is gone from this page: the gateway
                // returns [] for it on every chain Rate has opened since bands
                // shipped, and `useLpPositions` covers the generation that
                // actually has positions. Kept in the composer's signature so a
                // chain with legacy ranges can be wired back without a type change.
                positions: null,
                bandTokens,
            }),
        [pair, book, trades, pool, bandTokens],
    );
}
