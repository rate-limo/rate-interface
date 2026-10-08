import { describe, expect, it } from "vitest";
import type { SpotPair, SpotTradeEvent } from "@/types";
import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import type { LpPosition, PoolLiquidity } from "@/queries/server/liquidity";
import { composePairSnapshot, composeProvenance, type SnapshotLegs } from "./snapshot";

const BASE_ID = "0xBaseAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const QUOTE_ID = "0xQuoteBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const pair = (over: Partial<SpotPair> = {}): SpotPair =>
    ({
        id: "0xpair",
        symbol: "SMKB/SMKQ",
        baseSymbol: "SMKB",
        quoteSymbol: "SMKQ",
        price: 2,
        base: { id: BASE_ID, symbol: "SMKB", priceUSD: 6 },
        quote: { id: QUOTE_ID, symbol: "SMKQ", priceUSD: 3 },
        dayBaseTvlUSD: 400,
        dayQuoteTvlUSD: 600,
        ...over,
    }) as unknown as SpotPair;

const book = (): GroupedOrderbookResult =>
    ({
        bids: {
            side: "bid",
            totalBaseLiquidity: 0,
            totalQuoteLiquidity: 0,
            buckets: [
                { price: "1.99", baseLiquidity: 4, accumulatedBaseLiquidity: 4 },
                { price: "1.98", baseLiquidity: 6, accumulatedBaseLiquidity: 10 },
            ],
        },
        asks: {
            side: "ask",
            totalBaseLiquidity: 0,
            totalQuoteLiquidity: 0,
            buckets: [
                { price: "2.01", baseLiquidity: 3, accumulatedBaseLiquidity: 3 },
                { price: "2.02", baseLiquidity: 5, accumulatedBaseLiquidity: 8 },
            ],
        },
    }) as unknown as GroupedOrderbookResult;

const tradeEvents = (): SpotTradeEvent[] =>
    [
        { price: 2.01, baseAmount: 1.5, isBid: true, timestamp: 100, txHash: "0xa" },
        { price: 1.99, baseAmount: 0.5, isBid: false, timestamp: 90, txHash: "0xb" },
    ] as unknown as SpotTradeEvent[];

const pool = (aprPct: number | null): PoolLiquidity => ({
    exists: true,
    price: 2,
    pairSymbol: "SMKB/SMKQ",
    aprPct,
});

const position = (over: Partial<LpPosition> = {}): LpPosition =>
    ({
        pool: "0xpool",
        base: BASE_ID,
        quote: QUOTE_ID,
        baseAmount: 10,
        quoteAmount: 20,
        minPrice: 1,
        maxPrice: 3,
        active: true,
        inRange: true,
        pairSymbol: "SMKB/SMKQ",
        ...over,
    }) as LpPosition;

const legs = (over: Partial<SnapshotLegs> = {}): SnapshotLegs => ({
    pair: pair(),
    book: book(),
    trades: tradeEvents(),
    pool: pool(12.5),
    positions: [position()],
    bandTokens: null,
    ...over,
});

describe("composePairSnapshot — the happy path", () => {
    it("derives the touch from the ladders", () => {
        const s = composePairSnapshot(legs());
        expect(s.bestBid).toBe(1.99);
        expect(s.bestAsk).toBe(2.01);
    });

    it("maps buckets to levels, keeping size and cumulative", () => {
        const s = composePairSnapshot(legs());
        expect(s.bids).toEqual([
            { price: 1.99, size: 4, cumulative: 4 },
            { price: 1.98, size: 6, cumulative: 10 },
        ]);
    });

    it("maps trades, translating isBid into a side", () => {
        const s = composePairSnapshot(legs());
        expect(s.trades).toHaveLength(2);
        expect(s.trades[0]).toEqual({
            price: 2.01,
            amount: 1.5,
            side: "Buy",
            timestamp: 100,
            txHash: "0xa",
        });
        expect(s.trades[1].side).toBe("Sell");
    });

    it("takes APR from the pool leg and TVL from the pair row", () => {
        const s = composePairSnapshot(legs());
        expect(s.lpAprPct).toBe(12.5);
        expect(s.lpTvlUsd).toBe(1000);
    });

    // base x rate + quote, then x the QUOTE token's USD price.
    // (10 * 2 + 20) = 40 quote, * $3 = $120.
    it("values the wallet's position in USD via the quote token's price", () => {
        expect(composePairSnapshot(legs()).yourPositionUsd).toBe(120);
    });

    // Derived by lib/pair/derive at render; duplicating them here would let the
    // two disagree. The mock left them null for the same reason.
    it("leaves the derived depth fields null", () => {
        const s = composePairSnapshot(legs());
        expect(s.depthUpUsd).toBeNull();
        expect(s.depthDownUsd).toBeNull();
    });
});

describe("composePairSnapshot — every leg fails independently", () => {
    it("survives a missing book, keeping trades and liquidity", () => {
        const s = composePairSnapshot(legs({ book: null }));
        expect(s.bids).toEqual([]);
        expect(s.asks).toEqual([]);
        expect(s.bestBid).toBeNull();
        expect(s.bestAsk).toBeNull();
        expect(s.trades).toHaveLength(2);
        expect(s.lpAprPct).toBe(12.5);
    });

    it("survives missing trades, keeping the book", () => {
        const s = composePairSnapshot(legs({ trades: null }));
        expect(s.trades).toEqual([]);
        expect(s.bestBid).toBe(1.99);
    });

    it("survives a missing pool, keeping TVL from the pair", () => {
        const s = composePairSnapshot(legs({ pool: null }));
        expect(s.lpAprPct).toBeNull();
        expect(s.lpTvlUsd).toBe(1000);
    });

    it("survives missing positions", () => {
        expect(composePairSnapshot(legs({ positions: null })).yourPositionUsd).toBeNull();
        expect(composePairSnapshot(legs({ positions: [] })).yourPositionUsd).toBeNull();
    });

    it("survives every leg failing at once", () => {
        const s = composePairSnapshot(legs({ book: null, trades: null, pool: null, positions: null }));
        expect(s.bids).toEqual([]);
        expect(s.trades).toEqual([]);
        expect(s.lpAprPct).toBeNull();
        expect(s.yourPositionUsd).toBeNull();
    });

    it("never throws, whatever the legs contain", () => {
        expect(() =>
            composePairSnapshot({
                pair: pair(),
                book: {} as GroupedOrderbookResult,
                trades: [{}] as unknown as SpotTradeEvent[],
                pool: {} as PoolLiquidity,
                positions: [{}] as unknown as LpPosition[],
                bandTokens: [{}] as unknown as SnapshotLegs["bandTokens"],
            }),
        ).not.toThrow();
    });
});

describe("composePairSnapshot — refuses to mislabel", () => {
    // A null APR is "not measurable" (no in-range liquidity, or no indexed
    // volume). It must not become 0, which claims the pool earned nothing.
    it("carries a null APR through as null, never zero", () => {
        expect(composePairSnapshot(legs({ pool: pool(null) })).lpAprPct).toBeNull();
    });

    it("keeps a real zero APR distinct from an unmeasurable one", () => {
        expect(composePairSnapshot(legs({ pool: pool(0) })).lpAprPct).toBe(0);
    });

    // The field is yourPositionUsd. Without a USD price for the quote token the
    // honest answer is null, not a quote-denominated number wearing a $ label.
    it("returns null rather than a quote-denominated figure when the quote has no USD price", () => {
        const noUsd = pair({ quote: { id: QUOTE_ID, symbol: "SMKQ", priceUSD: 0 } } as Partial<SpotPair>);
        expect(composePairSnapshot(legs({ pair: noUsd })).yourPositionUsd).toBeNull();
    });

    it("ignores positions in other pools and inactive ranges", () => {
        const other = position({ base: "0xother", quote: "0xelse" });
        const closed = position({ active: false });
        expect(composePairSnapshot(legs({ positions: [other, closed] })).yourPositionUsd).toBeNull();
    });

    it("matches the pool whichever way round the position's tokens are stored", () => {
        const flipped = position({ base: QUOTE_ID, quote: BASE_ID });
        expect(composePairSnapshot(legs({ positions: [flipped] })).yourPositionUsd).toBe(120);
    });

    it("drops levels with an unparseable price rather than poisoning the ladder with NaN", () => {
        const bad = book();
        (bad.bids.buckets as unknown as { price: string }[]).push({ price: "not-a-number" });
        const s = composePairSnapshot(legs({ book: bad }));
        expect(s.bids).toHaveLength(2);
        expect(s.bestBid).toBe(1.99);
    });
});

describe("composeProvenance", () => {
    it("marks nothing as estimated when every leg answered", () => {
        expect(composeProvenance(legs())).toEqual({ book: false, trades: false, liquidity: false });
    });

    it("marks only the legs that failed", () => {
        expect(composeProvenance(legs({ book: null }))).toEqual({
            book: true,
            trades: false,
            liquidity: false,
        });
        expect(composeProvenance(legs({ pool: null })).liquidity).toBe(true);
    });

    // The pool answered; the answer was "not measurable". That is a finding, not
    // a missing leg, so the figure is not marked illustrative.
    it("treats a pool that answered with a null APR as measured", () => {
        expect(composeProvenance(legs({ pool: pool(null) })).liquidity).toBe(false);
    });

    it("treats an empty trades array as measured, not missing", () => {
        expect(composeProvenance(legs({ trades: [] })).trades).toBe(false);
    });
});

/**
 * The band ladder — the leg whose absence made this page say "none" to every LP
 * the deposit UI has ever created.
 */
const bandToken = (over: Record<string, unknown> = {}) =>
    ({
        tokenId: "1",
        base: BASE_ID,
        quote: QUOTE_ID,
        active: true,
        feesUSD: 0,
        bands: [],
        ...over,
    }) as unknown as NonNullable<SnapshotLegs["bandTokens"]>[number];

const rung = (band: number, valueUSD: number, over: Record<string, unknown> = {}) => ({
    band,
    valueUSD,
    // Funded means SHARES — the ladder is keyed on them, never on the broker's
    // USD snapshot, which does not exist for the first minute of a position.
    shares: BigInt(1),
    toleranceBuy: 0.02 * (band + 1),
    toleranceSell: 0.02 * (band + 1),
    open: true,
    vestedPct: 100,
    sharePct: 0,
    spreadFrac: null,
    feeMultiplier: null,
    baseOwned: BigInt(0),
    quoteOwned: BigInt(0),
    ...over,
});

describe("composePairSnapshot — band positions", () => {
    it("reads the band ladder, where the page used to report none", () => {
        const s = composePairSnapshot(
            legs({
                positions: null,
                bandTokens: [bandToken({ bands: [rung(0, 8.73), rung(1, 8.73), rung(2, 8.73)] })],
            }),
        );
        expect(s.yourBands?.map((r) => r.band)).toEqual([0, 1, 2]);
        expect(s.yourPositionUsd).toBeCloseTo(26.19, 6);
        expect(s.yourPositionCount).toBe(1);
    });

    it("carries each rung's tolerance, which is what makes it a band and not a total", () => {
        const s = composePairSnapshot(
            legs({ positions: null, bandTokens: [bandToken({ bands: [rung(0, 10), rung(1, 30)] })] }),
        );
        expect(s.yourBands?.[0]?.toleranceFrac).toBeCloseTo(0.02, 6);
        expect(s.yourBands?.[1]?.toleranceFrac).toBeCloseTo(0.04, 6);
    });

    /**
     * `increaseLiquidity` adds to an existing token but a second `mint` makes
     * another, and from the reader's side both are one stake in one pool.
     */
    it("folds several positions in the same pool into one ladder", () => {
        const s = composePairSnapshot(
            legs({
                positions: null,
                bandTokens: [
                    bandToken({ tokenId: "1", bands: [rung(0, 10), rung(1, 10)] }),
                    bandToken({ tokenId: "2", bands: [rung(1, 30)] }),
                ],
            }),
        );
        expect(s.yourPositionCount).toBe(2);
        expect(s.yourBands?.map((r) => [r.band, r.valueUsd])).toEqual([
            [0, 10],
            [1, 40],
        ]);
        // Recomputed against the SUMMED total, never averaged out of the inputs:
        // each token's own sharePct is a share of a different denominator.
        expect(s.yourBands?.[1]?.sharePct).toBeCloseTo(80, 6);
    });

    it("ignores a position in another pool", () => {
        const s = composePairSnapshot(
            legs({
                positions: null,
                bandTokens: [bandToken({ quote: "0xSomeOtherQuote", bands: [rung(0, 99)] })],
            }),
        );
        expect(s.yourBands).toBeNull();
        expect(s.yourPositionUsd).toBeNull();
    });

    it("ignores a burnt position", () => {
        const s = composePairSnapshot(
            legs({ positions: null, bandTokens: [bandToken({ active: false, bands: [rung(0, 99)] })] }),
        );
        expect(s.yourBands).toBeNull();
    });

    /**
     * "No position" and "a position worth nothing" are different claims, and the
     * whole file turns on keeping them apart.
     */
    it("reports null, not zero, when the wallet holds nothing here", () => {
        const s = composePairSnapshot(legs({ positions: null, bandTokens: [] }));
        expect(s.yourBands).toBeNull();
        expect(s.yourPositionUsd).toBeNull();
        expect(s.yourFeesUsd).toBeNull();
    });

    /**
     * A wallet can hold both generations in one pool, and "your position" means
     * the whole stake. Asserted as the SUM OF THE PARTS rather than a literal, so
     * the test states the rule instead of restating the fixture's arithmetic.
     */
    it("adds a legacy range to the band ladder rather than hiding either", () => {
        const rangeOnly = composePairSnapshot(legs({ bandTokens: [] })).yourPositionUsd;
        const bandOnly = composePairSnapshot(
            legs({ positions: null, bandTokens: [bandToken({ bands: [rung(0, 10)] })] }),
        ).yourPositionUsd;
        const both = composePairSnapshot(
            legs({ bandTokens: [bandToken({ bands: [rung(0, 10)] })] }),
        ).yourPositionUsd;

        expect(rangeOnly).toBeGreaterThan(0);
        expect(bandOnly).toBeCloseTo(10, 6);
        expect(both).toBeCloseTo((rangeOnly as number) + (bandOnly as number), 6);
    });

    /**
     * The failure that reached a real deposit: the position was on chain and the
     * broker had not valued it yet, so every rung was worth 0 and the ladder
     * vanished — putting a funded wallet back on the word "none". Shares are the
     * position; the dollars are a valuation of it.
     */
    it("lists a funded band the broker has not valued yet", () => {
        const s = composePairSnapshot(
            legs({
                positions: null,
                bandTokens: [bandToken({ bands: [rung(0, 0), rung(1, 0)] })],
            }),
        );
        expect(s.yourBands?.map((r) => r.band)).toEqual([0, 1]);
        // Unvalued, which is NOT worthless — the UI renders an em-dash, not "none".
        expect(s.yourPositionUsd).toBeNull();
        // Split evenly rather than 0%, so the rungs do not read as empty bands.
        expect(s.yourBands?.map((r) => r.sharePct)).toEqual([50, 50]);
    });

    it("ignores a band the position holds no shares in", () => {
        const s = composePairSnapshot(
            legs({
                positions: null,
                bandTokens: [
                    bandToken({ bands: [rung(0, 10), rung(1, 0, { shares: BigInt(0) })] }),
                ],
            }),
        );
        expect(s.yourBands?.map((r) => r.band)).toEqual([0]);
    });
});
