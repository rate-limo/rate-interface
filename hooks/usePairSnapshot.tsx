"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useOrderbook } from "@/hooks/useOrderbook";
import { useRecentTrades } from "@/hooks/useRecentTrades";
import { composePairSnapshot } from "@/lib/pair/snapshot";
import { getLpPositions, getPoolLiquidity, type LpPosition, type PoolLiquidity } from "@/queries/server/liquidity";
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

    const [pool, setPool] = useState<PoolLiquidity | null>(null);
    const [positions, setPositions] = useState<LpPosition[] | null>(null);

    const baseId = pair.base?.id;
    const quoteId = pair.quote?.id;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await getPoolLiquidity(displayNetworkName, baseId, quoteId);
                if (!cancelled) setPool(result);
            } catch (error) {
                // getPoolLiquidity is written not to throw; this is the backstop
                // that keeps a surprise from reaching the page as a rejection.
                if (!cancelled) {
                    console.warn("usePairSnapshot: pool leg failed", error);
                    setPool(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [displayNetworkName, baseId, quoteId]);

    useEffect(() => {
        // No wallet, no position to show. Clearing rather than leaving the previous
        // wallet's ranges on screen after a disconnect.
        if (!address) {
            setPositions(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const result = await getLpPositions(displayNetworkName, address);
                // The pair profile draws RANGES on its depth chart; a band has
                // none, so only that half is relevant here.
                if (!cancelled) setPositions(result?.ranges ?? null);
            } catch (error) {
                if (!cancelled) {
                    console.warn("usePairSnapshot: positions leg failed", error);
                    setPositions(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [displayNetworkName, address]);

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
                positions,
            }),
        [pair, book, trades, pool, positions],
    );
}
