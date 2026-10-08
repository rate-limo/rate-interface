import { describe, expect, it } from "vitest";
import { allowedFees, allowedVolatility, feeTierNum } from "./launchPolicy";

// The generator's deployed defaults: 5..100 bps, 0.05%..3% pair range, 1% creator cap.
const bounds = { minVolatilityBps: 5, maxVolatilityBps: 100, minFee: 50_000, maxFee: 1_000_000 };

describe("listPair choices", () => {
  it("encodes a tier on the contract's 1e8 scale", () => {
    expect(feeTierNum("0.10")).toBe(100_000);
    expect(feeTierNum("1.00")).toBe(1_000_000);
    expect(feeTierNum("0.05")).toBe(50_000);
  });

  it("offers only what listPair accepts", () => {
    expect(allowedFees(bounds)).toEqual(["0.05", "0.10", "0.30", "1.00"]);
    expect(allowedFees({ ...bounds, maxFee: 300_000 })).toEqual(["0.05", "0.10", "0.30"]);
    expect(allowedVolatility({ ...bounds, maxVolatilityBps: 50 }).map((p) => p.bps)).toEqual([5, 10, 50]);
  });

  it("offers nothing until the bounds are read", () => {
    expect(allowedFees(null)).toEqual([]);
    expect(allowedVolatility(null)).toEqual([]);
  });
});
