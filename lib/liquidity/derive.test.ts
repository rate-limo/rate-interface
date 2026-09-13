import { describe, expect, it } from "vitest";
import { derivePools, median, poolTotals, splitPools, type RawPairRow } from "./derive";

const FEE = 0.001;

/** A pair row with sane defaults; override just what a case is about. */
function pair(over: Partial<RawPairRow> = {}): RawPairRow {
  return {
    symbol: "ETH/USDC",
    baseSymbol: "ETH",
    quoteSymbol: "USDC",
    price: 1635,
    dayBaseTvlUSD: 500_000,
    dayQuoteTvlUSD: 500_000,
    dayBaseVolumeUSD: 100_000,
    dayQuoteVolumeUSD: 100_000,
    ...over,
  };
}

describe("derivePools", () => {
  it("sums the two sides for TVL and volume, then derives fees and APR", () => {
    const [p] = derivePools([pair()], FEE);
    expect(p.tvlUsd).toBe(1_000_000);
    expect(p.volume24hUsd).toBe(200_000);
    // 200k × 0.001 × LP_FEE_SHARE. The share is the point: the taker fee is split
    // between the pool and the protocol on chain, so the whole fee is the venue's
    // revenue. This asserted 200 — the un-split figure — while every surface
    // reading it is labelled for LPs, so the test was pinning a 2x overstatement.
    expect(p.fees24hUsd).toBe(100);
    // 200/day × 365 = 73,000 on 1M TVL = 7.3%
    expect(p.aprPct).toBeCloseTo(3.65, 6);
  });

  it("treats pg's string numerics as numbers", () => {
    const [p] = derivePools(
      [pair({ dayBaseTvlUSD: "500000", dayQuoteTvlUSD: "500000", price: "1635" })],
      FEE,
    );
    expect(p.tvlUsd).toBe(1_000_000);
    expect(p.rate).toBe(1635);
  });

  it("coerces null and non-numeric fields to zero instead of NaN", () => {
    const [p] = derivePools(
      [pair({ dayBaseTvlUSD: null, dayQuoteTvlUSD: undefined, price: "not-a-number" })],
      FEE,
    );
    expect(p.tvlUsd).toBe(0);
    expect(p.rate).toBe(0);
    expect(Number.isNaN(p.aprPct)).toBe(false);
  });

  it("reports APR as null, not 0%, when there is no TVL to divide by", () => {
    // Volume against an empty book yields a number that is arithmetic rather
    // than information, and 0% is indistinguishable from a real zero yield.
    // The row renders an em-dash. Same degrade rule as the status bar chips.
    const [p] = derivePools([pair({ dayBaseTvlUSD: 0, dayQuoteTvlUSD: 0 })], FEE);
    expect(p.tvlUsd).toBe(0);
    expect(p.aprPct).toBeNull();
  });

  it("splits out the quote side, which is what the graduation threshold reads", () => {
    // A launch pool's TVL is mostly the creator's own seeded mint; only the
    // quote half decides whether it lists.
    const [p] = derivePools([pair({ dayBaseTvlUSD: 96_700, dayQuoteTvlUSD: 41_200 })], FEE);
    expect(p.tvlUsd).toBe(137_900);
    expect(p.quoteTvlUsd).toBe(41_200);
  });

  it("treats anything other than verified === true as unlisted", () => {
    // `verified` is nullable and defaults to false; a null must never read as
    // listed, or an ungraduated market lands in the headline totals.
    expect(derivePools([pair({ verified: true })], FEE)[0].listed).toBe(true);
    expect(derivePools([pair({ verified: false })], FEE)[0].listed).toBe(false);
    expect(derivePools([pair({ verified: null })], FEE)[0].listed).toBe(false);
    expect(derivePools([pair({})], FEE)[0].listed).toBe(false);
  });

  it("drops pairs with neither liquidity nor flow", () => {
    const rows = [
      pair({ symbol: "LIVE/USDC" }),
      pair({
        symbol: "DEAD/USDC",
        dayBaseTvlUSD: 0,
        dayQuoteTvlUSD: 0,
        dayBaseVolumeUSD: 0,
        dayQuoteVolumeUSD: 0,
      }),
    ];
    expect(derivePools(rows, FEE).map((p) => p.symbol)).toEqual(["LIVE/USDC"]);
  });

  it("keeps a pair that has TVL but no volume — it is still providable", () => {
    const rows = [pair({ dayBaseVolumeUSD: 0, dayQuoteVolumeUSD: 0 })];
    const [p] = derivePools(rows, FEE);
    expect(p.tvlUsd).toBe(1_000_000);
    expect(p.aprPct).toBe(0);
  });

  it("sorts by TVL descending", () => {
    const rows = [
      pair({ symbol: "SMALL/USDC", dayBaseTvlUSD: 1, dayQuoteTvlUSD: 1 }),
      pair({ symbol: "BIG/USDC", dayBaseTvlUSD: 9_000, dayQuoteTvlUSD: 9_000 }),
      pair({ symbol: "MID/USDC", dayBaseTvlUSD: 500, dayQuoteTvlUSD: 500 }),
    ];
    expect(derivePools(rows, FEE).map((p) => p.symbol)).toEqual([
      "BIG/USDC",
      "MID/USDC",
      "SMALL/USDC",
    ]);
  });

  it("falls back to base/quote for the label when symbol is missing", () => {
    const [p] = derivePools([pair({ symbol: null })], FEE);
    expect(p.symbol).toBe("ETH/USDC");
  });

  it("says so rather than rendering a bare slash when nothing identifies the pair", () => {
    const [p] = derivePools([pair({ symbol: null, baseSymbol: null, quoteSymbol: null })], FEE);
    expect(p.symbol).toBe("Unknown pair");
  });
});

describe("median", () => {
  it("takes the middle of an odd-length set", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("averages the two middles of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("is zero for an empty set rather than NaN", () => {
    expect(median([])).toBe(0);
  });
});

describe("poolTotals", () => {
  it("sums the money columns and takes the median APR", () => {
    const pools = derivePools(
      [
        pair({ symbol: "A/USDC" }),
        pair({ symbol: "B/USDC", dayBaseTvlUSD: 250_000, dayQuoteTvlUSD: 250_000 }),
      ],
      FEE,
    );
    const t = poolTotals(pools);
    expect(t.totalTvlUsd).toBe(1_500_000);
    expect(t.totalVolume24hUsd).toBe(400_000);
    expect(t.totalFees24hUsd).toBeCloseTo(200, 6);
    // 7.3% and 14.6% -> median of two values is their mean
    expect(t.medianAprPct).toBeCloseTo(5.475, 6);
  });

  it("ignores zero-APR pools when taking the median", () => {
    const pools = derivePools(
      [
        pair({ symbol: "EARNS/USDC" }),
        // TVL but no flow: real pool, but a 0% would drag the headline down
        pair({ symbol: "IDLE/USDC", dayBaseVolumeUSD: 0, dayQuoteVolumeUSD: 0 }),
      ],
      FEE,
    );
    expect(poolTotals(pools).medianAprPct).toBeCloseTo(3.65, 6);
  });

  it("is all zeroes for no pools", () => {
    expect(poolTotals([])).toEqual({
      totalTvlUsd: 0,
      totalVolume24hUsd: 0,
      totalFees24hUsd: 0,
      medianAprPct: 0,
    });
  });

  it("ignores null-APR pools when taking the median", () => {
    const pools = derivePools(
      [
        pair({ symbol: "EARNS/USDC" }),
        // Volume, no TVL — aprPct is null, and null must not become 0 here.
        pair({ symbol: "EMPTY/USDC", dayBaseTvlUSD: 0, dayQuoteTvlUSD: 0 }),
      ],
      FEE,
    );
    expect(poolTotals(pools).medianAprPct).toBeCloseTo(3.65, 6);
  });
});

describe("splitPools", () => {
  it("separates graduated markets from launches", () => {
    const pools = derivePools(
      [
        pair({ symbol: "ETH/USDC", verified: true }),
        pair({ symbol: "NOVA/USDC", verified: false }),
        pair({ symbol: "HELIO/USDC", verified: false }),
      ],
      FEE,
    );
    const { listed, launches } = splitPools(pools);
    expect(listed.map((p) => p.symbol)).toEqual(["ETH/USDC"]);
    expect(launches.map((p) => p.symbol)).toEqual(["NOVA/USDC", "HELIO/USDC"]);
  });

  it("keeps an unlisted market out of the headline totals", () => {
    // The bug this fixes: /pool reads Postgres directly and never applied the
    // listing gate, so a $6k unlisted book sat inside Total value locked and
    // the median LP APR — figures people size positions against.
    const pools = derivePools(
      [
        pair({ symbol: "ETH/USDC", verified: true }),
        pair({
          symbol: "HELIO/USDC",
          verified: false,
          dayBaseTvlUSD: 3_000,
          dayQuoteTvlUSD: 3_000,
        }),
      ],
      FEE,
    );
    const { listed } = splitPools(pools);
    expect(poolTotals(listed).totalTvlUsd).toBe(1_000_000);
    expect(poolTotals(pools).totalTvlUsd).toBe(1_006_000);
  });
});
