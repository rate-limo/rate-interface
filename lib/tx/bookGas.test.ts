import { describe, it, expect } from "vitest";
import { levelsCrossing, gasLevelsFor, LEVEL_HEADROOM } from "./bookGas";
import type { GroupedOrderbookResult } from "@/types";

const bucket = (price: string) => ({
  price,
  baseLiquidity: 1,
  quoteLiquidity: 1,
  percentage: 1,
  accumulatedBaseLiquidity: 1,
  accumulatedQuoteLiquidity: 1,
  accumulatedPercentage: 1,
});

const book = (askPrices: string[], bidPrices: string[]) =>
  ({
    asks: { side: "ask", totalBaseLiquidity: 0, totalQuoteLiquidity: 0, buckets: askPrices.map(bucket) },
    bids: { side: "bid", totalBaseLiquidity: 0, totalQuoteLiquidity: 0, buckets: bidPrices.map(bucket) },
  }) as unknown as GroupedOrderbookResult;

describe("levelsCrossing", () => {
  it("counts asks at or below a bid's price", () => {
    expect(levelsCrossing(book(["100", "101", "102"], []), true, 101)).toBe(2);
  });

  it("counts bids at or above an ask's price", () => {
    expect(levelsCrossing(book([], ["100", "99", "98"]), false, 99)).toBe(2);
  });

  it("is zero when the order rests inside the spread", () => {
    expect(levelsCrossing(book(["105"], ["95"]), true, 100)).toBe(0);
  });

  it("treats a market order as crossing the whole far side", () => {
    expect(levelsCrossing(book(["100", "101"], []), true, null)).toBe(2);
    expect(levelsCrossing(book(["100", "101"], []), true, undefined)).toBe(2);
  });

  it("survives a missing or empty book rather than guessing", () => {
    expect(levelsCrossing(undefined, true, 100)).toBe(0);
    expect(levelsCrossing(book([], []), true, 100)).toBe(0);
  });

  it("skips malformed prices instead of counting them as zero", () => {
    // A zero would cross every bid and inflate the count.
    expect(levelsCrossing(book(["", "abc", "100"], []), true, 101)).toBe(1);
  });
});

describe("gasLevelsFor", () => {
  it("adds headroom for the bucketing and for depth that arrives late", () => {
    expect(gasLevelsFor(book(["100", "101"], []), true, 101, 20)).toBe(2 + LEVEL_HEADROOM);
  });

  it("never exceeds the engine's own match limit", () => {
    const deep = book(Array.from({ length: 40 }, (_, i) => String(100 + i)), []);
    expect(gasLevelsFor(deep, true, 200, 20)).toBe(20);
  });

  it("still budgets headroom for an order that crosses nothing", () => {
    expect(gasLevelsFor(book(["105"], ["95"]), true, 100, 20)).toBe(LEVEL_HEADROOM);
  });
});
