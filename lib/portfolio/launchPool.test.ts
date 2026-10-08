import { describe, expect, it } from "vitest";
import { feePct, launchPoolValue, sumBandReserves } from "./launchPool";

describe("launchPoolValue", () => {
  it("values the graduated e2e pool: 190M coins + 2,104.4 tUSD", () => {
    const v = launchPoolValue({
      baseRaw: BigInt("190000000000000000000000000"),
      quoteRaw: BigInt(2_104_400_000),
      baseDecimals: 18,
      quoteDecimals: 6,
      baseUsd: 0.000005,
      quoteUsd: 1,
    });
    expect(v.poolBase).toBe(190_000_000);
    expect(v.poolQuote).toBeCloseTo(2104.4, 6);
    expect(v.valueUsd).toBeCloseTo(950 + 2104.4, 6);
  });

  it("counts a leg with no known price as zero, not NaN", () => {
    const v = launchPoolValue({ baseRaw: BigInt(10) ** BigInt(18), quoteRaw: BigInt(5_000_000), baseDecimals: 18, quoteDecimals: 6, baseUsd: Number.NaN, quoteUsd: 1 });
    expect(v.valueUsd).toBe(5);
  });

  it("an empty pool (pre-graduation) is zero everywhere", () => {
    const v = launchPoolValue({ baseRaw: BigInt(0), quoteRaw: BigInt(0), baseDecimals: 18, quoteDecimals: 6, baseUsd: 1, quoteUsd: 1 });
    expect(v).toEqual({ poolBase: 0, poolQuote: 0, valueUsd: 0 });
  });
});

describe("sumBandReserves", () => {
  const bands = [
    [BigInt(1), BigInt(10)],
    [BigInt(2), BigInt(20)],
    [BigInt(3), BigInt(30)],
  ] as const;
  it("sums bands with the coin as the pool's base", () => {
    expect(sumBandReserves(bands, true)).toEqual({ baseRaw: BigInt(6), quoteRaw: BigInt(60) });
  });
  it("swaps legs when the pool lists the coin as its quote", () => {
    expect(sumBandReserves(bands, false)).toEqual({ baseRaw: BigInt(60), quoteRaw: BigInt(6) });
  });
});

describe("feePct", () => {
  it("reads the engine's 1e8 scale", () => {
    expect(feePct(1_000_000)).toBe(1);
    expect(feePct(100_000)).toBe(0.1);
  });
});
