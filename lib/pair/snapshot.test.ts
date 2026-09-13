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
