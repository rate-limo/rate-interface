import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import type { SpotPair, SpotTradeEvent } from "@/types";
import type { LpPosition, PoolLiquidity } from "@/queries/server/liquidity";
import type { LpToken } from "@/lib/liquidity/positions";
import type { BookLevel, PairSnapshot, PairTrade, SnapshotProvenance, YourBandRung } from "./types";

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
    /**
     * The wallet's BAND positions across all pools, or null when absent.
     *
     * A separate leg from `positions` because they are separate generations, not
     * two spellings of one thing: `positions` are Pool.sol ranges, `bandTokens`
     * are ERC-1155 ladders. The profile read only the former, so every position
     * the band UI creates rendered as the word "none" — the gateway returns both
     * halves on one response and the web read dropped this one.
     */
    bandTokens: LpToken[] | null;
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

/**
 * The wallet's BAND positions in THIS pool.
 *
 * Matched on token addresses in either orientation, like `positionUsd` above and
 * for the same reason: the profile never has to learn the pool address to ask
 * the question. Inactive tokens are excluded — a burnt position is not a stake.
 */
function myBandTokens(pair: SpotPair, tokens: LpToken[] | null): LpToken[] {
    if (!Array.isArray(tokens) || tokens.length === 0) return [];
    const baseId = pair.base?.id?.toLowerCase();
    const quoteId = pair.quote?.id?.toLowerCase();
    if (!baseId || !quoteId) return [];
    return tokens.filter((t) => {
        if (!t?.active) return false;
        const b = t.base?.toLowerCase();
        const q = t.quote?.toLowerCase();
        return (b === baseId && q === quoteId) || (b === quoteId && q === baseId);
    });
}

/**
 * The ladder, folded across every position the wallet holds here.
 *
 * An LP can hold several ERC-1155 tokens in one pool — `increaseLiquidity` adds
 * to an existing one, but a second `mint` makes another — and they are the same
 * stake from the reader's side, so the rungs are summed by band index rather
 * than listed per token.
 *
 * `sharePct` is RECOMPUTED from the summed values instead of being averaged out
 * of the inputs: each token's `sharePct` is a share of THAT token, and averaging
 * shares of different denominators is meaningless. Returns null rather than an
 * empty array when nothing is funded — `yourBands` is documented as "no position
 * here", and an empty ladder would claim a position with no bands, which cannot
 * exist.
 */
function bandLadder(tokens: LpToken[]): YourBandRung[] | null {
    if (tokens.length === 0) return null;

    const byBand = new Map<number, YourBandRung>();
    for (const token of tokens) {
        for (const band of token.bands ?? []) {
            /**
             * FUNDED means SHARES, never dollars.
             *
             * `valueUSD` comes from the broker's periodic band-reserve snapshot,
             * so a position is worth 0 to the gateway for the first minute of
             * its life — and keying the ladder on it put a brand-new deposit
             * back in the state this panel exists to end: a funded wallet told
             * it has none. Measured end to end: the profile said "none" ~40s
             * after a deposit whose shares were already on chain, and the same
             * response carried real values minutes later.
             *
             * Shares are the position. The dollars are a valuation of it, and
             * "not valued yet" renders as an em-dash below.
             */
            if (band.shares <= BigInt(0)) continue;
            const rung = byBand.get(band.band);
            if (!rung) {
                byBand.set(band.band, {
                    band: band.band,
                    toleranceFrac: band.toleranceBuy ?? band.toleranceSell,
                    valueUsd: band.valueUSD,
                    sharePct: 0,
                    open: band.open,
                    vestedPct: band.vestedPct,
                });
                continue;
            }
            rung.valueUsd += band.valueUSD;
            // A band the LP holds through two tokens is open or closed once —
            // it is a property of the POOL's band, not of either token.
            rung.open = rung.open ?? band.open;
            rung.toleranceFrac = rung.toleranceFrac ?? band.toleranceBuy ?? band.toleranceSell;
        }
    }
    if (byBand.size === 0) return null;

    const rungs = [...byBand.values()].sort((a, b) => a.band - b.band);
    const total = rungs.reduce((sum, r) => sum + r.valueUsd, 0);
    // An even split while nothing is valued, the same fallback
    // `mergeLpPositions` already applies per token — a row of 0% bars would
    // read as empty bands rather than as an unvalued position.
    for (const rung of rungs) {
        rung.sharePct = total > 0 ? (rung.valueUsd / total) * 100 : 100 / rungs.length;
    }
    return rungs;
}

/** A ladder's total, or null while the broker has not valued it. */
function ladderUsd(ladder: YourBandRung[] | null): number | null {
    if (!ladder) return null;
    const total = ladder.reduce((sum, r) => sum + r.valueUsd, 0);
    return total > 0 ? total : null;
}

/**
 * Add two figures that are each "null means unknown, not zero".
 *
 * `(a ?? 0) + (b ?? 0)` would turn two unknowns into a measured 0.00, which is
 * the exact claim every null in this file exists to avoid making.
 */
function sumOrNull(a: number | null, b: number | null): number | null {
    if (a === null && b === null) return null;
    return (a ?? 0) + (b ?? 0);
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

    const myBands = myBandTokens(pair, legs.bandTokens);
    const ladder = bandLadder(myBands);

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
        /**
         * Both generations, added. A wallet can hold a v3 range AND a band ladder
         * in the same pool, and "your position" means the whole stake — showing
         * one and hiding the other would be a subtler version of the bug this
         * replaced. Null survives only when NEITHER leg has anything, so the UI
         * still says "none" rather than "$0.00" for a wallet with no position.
         */
        yourPositionUsd: sumOrNull(
            positionUsd(pair, positions),
            // 0 across a ladder that HAS shares means unvalued, not worthless —
            // see the note in `bandLadder`. Null renders an em-dash beside a
            // ladder that still lists every funded band.
            ladderUsd(ladder),
        ),
        yourBands: ladder,
        yourPositionCount: myBands.length,
        yourFeesUsd: myBands.length > 0 ? myBands.reduce((sum, t) => sum + (t.feesUSD ?? 0), 0) : null,
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
