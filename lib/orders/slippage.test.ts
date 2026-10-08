import { describe, it, expect } from "vitest";
import { parseUnits } from "viem";
import { ENGINE_SLIPPAGE_DENOM, slippagePctToEngine } from "./slippage";

describe("slippagePctToEngine", () => {
  it("sends 0.1% as 1e5 on the engine's 1e8 denominator", () => {
    expect(slippagePctToEngine(0.1)).toBe(100_000);
    expect(slippagePctToEngine(0.1) / ENGINE_SLIPPAGE_DENOM).toBeCloseTo(0.001, 12);
  });

  it("is a hundredth of what parseUnits(pct, 8) used to send", () => {
    // The bug: "0.1%" on screen, 10% on chain.
    expect(Number(parseUnits("0.1", 8))).toBe(10_000_000);
    expect(slippagePctToEngine(0.1) * 100).toBe(Number(parseUnits("0.1", 8)));
  });

  it("maps whole percents and 100%", () => {
    expect(slippagePctToEngine(1)).toBe(1_000_000);
    expect(slippagePctToEngine(0.5)).toBe(500_000);
    expect(slippagePctToEngine(100)).toBe(ENGINE_SLIPPAGE_DENOM);
  });

  it("handles a value that stringifies in exponent form", () => {
    // parseUnits("1e-7", 6) throws; this must not.
    expect(slippagePctToEngine(1e-7)).toBe(0);
    expect(slippagePctToEngine(2e-6)).toBe(2);
  });

  it("clamps out-of-range input instead of sending a huge band", () => {
    expect(slippagePctToEngine(250)).toBe(ENGINE_SLIPPAGE_DENOM);
    expect(slippagePctToEngine(-1)).toBe(0);
    expect(slippagePctToEngine(Number.NaN)).toBe(0);
    expect(slippagePctToEngine(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
