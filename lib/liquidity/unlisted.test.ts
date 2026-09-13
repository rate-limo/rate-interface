import { describe, expect, it } from "vitest";
import { findUnlisted, type UnlistedMarket } from "./unlisted";

const markets: UnlistedMarket[] = [
  { symbol: "NOVA/USDC", baseSymbol: "NOVA", quoteSymbol: "USDC", quoteTvlUsd: 41_200 },
  { symbol: "HELIO/USDC", baseSymbol: "HELIO", quoteSymbol: "USDC", quoteTvlUsd: 6_400 },
];

describe("findUnlisted", () => {
  it("matches the selected pair and reports the shortfall", () => {
    const m = findUnlisted("NOVA", "USDC", markets, 100_000);
    expect(m?.market.symbol).toBe("NOVA/USDC");
    expect(m?.shortfallUsd).toBe(58_800);
    expect(m?.progressPct).toBeCloseTo(41.2, 6);
  });

  it("returns null for a pair that is not in the unlisted list", () => {
    // A listed market, or a mock-only token with no real market. Either way
    // there is nothing to warn about — the list contains ONLY unlisted pairs,
    // so a miss can never suppress a real warning about a listed pair.
    expect(findUnlisted("ETH", "USDC", markets, 100_000)).toBeNull();
  });

  it("matches case-insensitively", () => {
    // The picker's symbols are hand-written; the broker's come off the token
    // contract. A case difference must not silently suppress the warning.
    expect(findUnlisted("nova", "usdc", markets, 100_000)?.market.symbol).toBe("NOVA/USDC");
  });

  it("does not match a reversed pair", () => {
    // USDC/NOVA is a different market from NOVA/USDC and may not exist at all.
    expect(findUnlisted("USDC", "NOVA", markets, 100_000)).toBeNull();
  });

  it("clamps progress and reports no shortfall once the threshold is met", () => {
    const over: UnlistedMarket[] = [
      { symbol: "ORBIT/USDC", baseSymbol: "ORBIT", quoteSymbol: "USDC", quoteTvlUsd: 140_000 },
    ];
    const m = findUnlisted("ORBIT", "USDC", over, 100_000);
    expect(m?.progressPct).toBe(100);
    expect(m?.shortfallUsd).toBe(0);
  });

  it("treats a zero threshold as met rather than dividing to Infinity", () => {
    expect(findUnlisted("NOVA", "USDC", markets, 0)?.progressPct).toBe(100);
  });

  it("returns null against an empty list", () => {
    expect(findUnlisted("NOVA", "USDC", [], 100_000)).toBeNull();
  });
});
