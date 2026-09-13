import { describe, expect, it } from "vitest";
import { resolveRate, type RateMarket } from "./rate";

const market = (base: string, quote: string, price: number | string | null): RateMarket => ({
  base: { symbol: base },
  quote: { symbol: quote },
  price,
});

const MARKETS = [market("ETH", "USDC", 1635.11), market("WBTC", "USDC", 51000)];

describe("resolveRate", () => {
  it("uses the indexed price for a market that exists", () => {
    expect(resolveRate(MARKETS, "ETH", "USDC")).toBe(1635.11);
  });

  it("inverts the market when the pair is flipped", () => {
    // The list holds one row per market. A flip asks for USDC/ETH, which is
    // not a missing market — it is ETH/USDC inverted. Without this, every flip
    // fell through to the static ratio, which is the bug this fixes.
    expect(resolveRate(MARKETS, "USDC", "ETH")).toBeCloseTo(1 / 1635.11, 12);
  });

  it("prefers the direct row over the inverse when both exist", () => {
    const both = [...MARKETS, market("USDC", "ETH", 0.001)];
    expect(resolveRate(both, "USDC", "ETH")).toBe(0.001);
  });

  it("reports NO rate when no market is indexed, rather than inventing one", () => {
    // The launch flow creates markets that do not exist yet, so there is
    // genuinely no rate to read. This used to answer with mock.ts's hardcoded
    // table, which put a fabricated price on screen beside real ones.
    expect(resolveRate(MARKETS, "MON", "USDT")).toBe(0);
  });

  it("treats a zero, negative, null or unparseable price as no price", () => {
    // A price column can carry any of these for a market with no trades. None
    // of them is a rate, and 0 would divide the range calculation by zero.
    for (const bad of [0, -5, null, "not-a-number"] as const) {
      const rate = resolveRate([market("AAA", "BBB", bad)], "AAA", "BBB");
      expect(rate).toBe(0);
      expect(Number.isFinite(rate)).toBe(true);
    }
  });

  it("accepts a price that arrived as a numeric string", () => {
    // The wire carries decimals as strings in places; Number() handles it, but
    // only if nothing upstream has already coerced it to NaN.
    expect(resolveRate([market("AAA", "BBB", "12.5")], "AAA", "BBB")).toBe(12.5);
  });

  it("does not invert a zero-priced inverse into Infinity", () => {
    const rate = resolveRate([market("BBB", "AAA", 0)], "AAA", "BBB");
    expect(Number.isFinite(rate)).toBe(true);
  });

  it("is stable on an empty market list", () => {
    expect(resolveRate([], "ETH", "USDC")).toBe(0);
  });
});
