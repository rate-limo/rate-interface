import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import type { SpotPair, SpotTradeEvent } from "@/types";
import type { LpPosition, PoolLiquidity } from "@/queries/server/liquidity";
import type { BookLevel, PairSnapshot, PairTrade, SnapshotProvenance } from "./types";

/**
 * Composes the live legs into a `PairSnapshot`.
 *
 * Pure, and deliberately so: this repo's vitest runs in the node environment and
 * collects `**\/*.test.ts` only, so there is no way to test a hook. Every rule
 * worth pinning — a failed leg becomes null, a null leg never throws, USD is
 * derived rather than guessed — lives here where it can be held to it. The hook
 * around it (`usePairSnapshot`) only wires sources to this function.
 *
 * **Every leg is independent.** The orderbook socket dropping must not cost the
 * page its trades, and an unreachable liquidity route must not cost it the book.
 * That is the rule this whole slice exists to establish, and the reason is on
 * record: a decorative banner that let one failed fetch escape took every page
 * in the app down on 2026-08-07.
 */

export interface SnapshotLegs {
    /** The pair itself — always present; the page does not render without it. */
    pair: SpotPair;
    /** Live grouped book, or null when the seed failed and the socket has not filled in. */
    book: GroupedOrderbookResult | null;
    /** Live recent trades, or null when that leg failed. */
    trades: SpotTradeEvent[] | null;
    /** Pool existence + realised APR, or null when unreachable or no pool. */
    pool: PoolLiquidity | null;
    /** The connected wallet's LP ranges across all pools, or null when absent. */
    positions: LpPosition[] | null;
}

function toLevels(buckets: GroupedOrderbookResult["bids"]["buckets"] | undefined): BookLevel[] {
    if (!Array.isArray(buckets)) return [];
    return buckets
        .map((b) => ({
            price: Number(b.price),
            size: b.baseLiquidity ?? 0,
            cumulative: b.accumulatedBaseLiquidity ?? 0,
        }))
        // A level with an unparseable price cannot be placed on the ladder, and
        // NaN would poison every derived figure downstream (mid, spread, depth).
        .filter((l) => Number.isFinite(l.price));
}

function toTrades(events: SpotTradeEvent[] | null): PairTrade[] {
    if (!Array.isArray(events)) return [];
    return events
        .filter((t) => t && Number.isFinite(t.price))
        .map((t) => ({
            price: t.price,
            // Base size, matching the ladder's units and what the mock showed.
            amount: t.baseAmount ?? 0,
            side: t.isBid ? ("Buy" as const) : ("Sell" as const),
            timestamp: t.timestamp ?? 0,
            txHash: t.txHash ?? "",
        }));
}

/**
 * The wallet's stake in THIS pool, in USD.
 *
 * Positions are matched on the pair's token addresses in either orientation,
 * rather than on a pool address, because the profile never has to fetch the pool
 * address to ask the question.
 *
 * The conversion is two steps and both matter: ranges are denominated in base and
 * quote, so quote-value is `base x rate + quote`; and only the QUOTE token has a
 * USD price to multiply by. Without `quote.priceUSD` the answer is null — the
 * field is named `yourPositionUsd`, so returning a quote-denominated number
 * would be mislabelling it, which is precisely the mistake this slice refused to
 * make with APR.
 */
function positionUsd(pair: SpotPair, positions: LpPosition[] | null): number | null {
    if (!Array.isArray(positions) || positions.length === 0) return null;

    const baseId = pair.base?.id?.toLowerCase();
    const quoteId = pair.quote?.id?.toLowerCase();
    if (!baseId || !quoteId) return null;

    const rate = pair.price;
    const quoteUsd = pair.quote?.priceUSD;
    if (!Number.isFinite(rate) || !Number.isFinite(quoteUsd) || !quoteUsd) return null;

    const mine = positions.filter((p) => {
        if (!p?.active) return false;
        const b = p.base?.toLowerCase();
        const q = p.quote?.toLowerCase();
        return (b === baseId && q === quoteId) || (b === quoteId && q === baseId);
    });
    if (mine.length === 0) return null;

    const quoteValue = mine.reduce(
        (sum, p) => sum + (p.baseAmount ?? 0) * rate + (p.quoteAmount ?? 0),
        0,
    );
    const usd = quoteValue * quoteUsd;
    return Number.isFinite(usd) ? usd : null;
}

/** Pool TVL in USD, straight off the pair row — no extra call needed. */
function tvlUsd(pair: SpotPair): number | null {
    const base = pair.dayBaseTvlUSD;
    const quote = pair.dayQuoteTvlUSD;
    if (!Number.isFinite(base) && !Number.isFinite(quote)) return null;
    const total = (Number.isFinite(base) ? base : 0) + (Number.isFinite(quote) ? quote : 0);
    // 0 here means the indexer measured no TVL, which is a real answer for a dead
    // market — unlike APR, where 0 and "unmeasurable" are different claims.
    return Number.isFinite(total) ? total : null;
}

export function composePairSnapshot(legs: SnapshotLegs): PairSnapshot {
    const { pair, book, trades, pool, positions } = legs;

    const bids = toLevels(book?.bids?.buckets);
    const asks = toLevels(book?.asks?.buckets);

    // max/min rather than trusting index 0: buckets are ordered walking away from
    // the mid, but deriving the touch from the values cannot be broken by a
    // change in that ordering.
    const bestBid = bids.length ? Math.max(...bids.map((l) => l.price)) : null;
    const bestAsk = asks.length ? Math.min(...asks.map((l) => l.price)) : null;

    return {
        bestBid,
        bestAsk,
        bids,
        asks,
        // Null on purpose, exactly as the mock left them: these are DERIVED from
        // the ladders by lib/pair/derive at render, and computing them here too
        // would let the two disagree.
        depthUpUsd: null,
        depthDownUsd: null,
        trades: toTrades(trades),
        lpAprPct: pool?.aprPct ?? null,
        lpTvlUsd: tvlUsd(pair),
        accruedFees24hQuote: pool?.aprBasis
            ? pool.aprBasis.poolDayQuoteVolume * pool.aprBasis.lpFeeRate
            : null,
        yourPositionUsd: positionUsd(pair, positions),
        provenance: composeProvenance(legs),
    };
}

/** Which legs came back empty, so the UI marks only those as estimated. */
export function composeProvenance(legs: SnapshotLegs): SnapshotProvenance {
    return {
        book: !legs.book,
        trades: !Array.isArray(legs.trades),
        // The liquidity leg is "measured" only if the pool answered. A pool that
        // answered with a null APR is still measured — the null is the finding.
        liquidity: !legs.pool,
    };
}
