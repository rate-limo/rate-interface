import { describe, expect, it } from "vitest";
import type { BandSet } from "./bands";
import { allocateShaped, shapeWeights } from "./bands";
import { autoWeights, type PairStats } from "./auto";
import {
  allocateByShape,
  depositUnits,
  formatDepositUnits,
  resolveDepositShape,
} from "./shape";

/** The ladder BandPoolFactory seeds, with depth so exhaustion has something to chew. */
const ladder = (reach: number): BandSet => ({
  spreadReach: reach,
  maturitySec: 600,
  feePct: 0.001,
  bands: [0.001, 0.003, 0.005].map((tolerance, i) => ({
    index: i,
    tolerance,
    open: true,
    liquidityUSD: [18_200, 64_700, 31_000][i]!,
    feesBase: 0,
    feesQuote: 0,
    feeMultiplier: i + 1,
  })),
});

const ALL = [0, 1, 2];
const T = BigInt(10_000 * 1e4);
const QUIET: PairStats = { annualizedVol: 0.12, meanTradeUSD: 1_200 };
const WHALES: PairStats = { annualizedVol: 0.2, meanTradeUSD: 140_000 };

describe("depositUnits", () => {
  it("reads the grouped strings the amount fields carry", () => {
    expect(depositUnits("1,635", 4)).toBe(BigInt(16_350_000));
  });

  it("is zero on a half-typed amount, never NaN", () => {
    expect(depositUnits("", 4)).toBe(BigInt(0));
    expect(depositUnits(".", 4)).toBe(BigInt(0));
    expect(depositUnits("-5", 4)).toBe(BigInt(0));
  });

  it("round-trips through the formatter at the captured precision", () => {
    expect(formatDepositUnits(depositUnits("1234.5678", 4), 4)).toBe("1,234.5678");
  });
});

describe("resolveDepositShape", () => {
  it("applies the shape asked for when it is a preset", () => {
    const r = resolveDepositShape(ladder(0.01), ALL, T, "curve", QUIET);
    expect(r.active).toBe("curve");
    expect(r.weights).toEqual(shapeWeights("curve", 3));
  });

  /**
   * The reason `active` exists as a separate field. A caller that highlighted the
   * REQUESTED shape would light the Auto card while depositing a curve.
   */
  it("degrades auto to curve when the pair has nothing to measure, and says so", () => {
    const r = resolveDepositShape(ladder(0.01), ALL, T, "auto", {
      annualizedVol: 0,
      meanTradeUSD: 0,
    });
    expect(r.autoReady).toBe(false);
    expect(r.active).toBe("curve");
    expect(r.verdict?.reason).toMatch(/no recent trading/i);
    expect(r.amounts).toEqual(allocateShaped(T, ladder(0.01), ALL, "curve").amounts);
  });

  it("degrades auto while the candles are still loading, without claiming a verdict", () => {
    const r = resolveDepositShape(ladder(0.01), ALL, T, "auto", undefined);
    expect(r.verdict).toBeNull();
    expect(r.autoReady).toBe(false);
    expect(r.active).toBe("curve");
  });

  it("uses the measured weights when auto is available", () => {
    const r = resolveDepositShape(ladder(0.01), ALL, T, "auto", WHALES);
    expect(r.active).toBe("auto");
    expect(r.weights).toEqual(autoWeights(ladder(0.01), ALL, WHALES));
  });

  it("is exact — the amounts sum to the deposit under every shape", () => {
    for (const shape of ["spot", "curve", "wide", "auto"] as const) {
      const r = resolveDepositShape(ladder(0.01), ALL, T, shape, WHALES);
      expect(r.amounts.reduce((a, b) => a + b, BigInt(0))).toBe(T);
    }
  });

  it("never sends anything to a band the pool would refuse", () => {
    const r = resolveDepositShape(ladder(0.003), ALL, T, "auto", WHALES);
    expect(r.bands).toEqual([0, 1]);
    expect(r.amounts).toHaveLength(2);
    expect(r.amounts.reduce((a, b) => a + b, BigInt(0))).toBe(T);
  });
});

describe("allocateByShape", () => {
  /**
   * The single path this module takes for BOTH sides. It matters that routing a
   * preset through the weight vector cannot move a single unit: scaling numerator
   * and denominator by the same constant preserves a floored share, and if it did
   * not, the base and quote halves of one deposit would be shaped differently.
   */
  it("matches the preset branch of allocateShaped exactly", () => {
    for (const shape of ["spot", "curve", "wide"] as const) {
      expect(allocateByShape(T, ladder(0.01), ALL, shapeWeights(shape, 3))).toEqual(
        allocateShaped(T, ladder(0.01), ALL, shape).amounts,
      );
    }
  });

  it("splits a second side in the same proportions as the first", () => {
    const set = ladder(0.01);
    const r = resolveDepositShape(set, ALL, T, "auto", WHALES);
    const quote = allocateByShape(BigInt(1_635 * 1e4), set, ALL, r.weights);

    expect(quote.reduce((a, b) => a + b, BigInt(0))).toBe(BigInt(1_635 * 1e4));
    // Same ordering, which is the property a shared share count actually needs:
    // a band heavier in base must be heavier in quote too.
    const rank = (xs: bigint[]) => xs.map((_, i) => i).sort((a, b) => (xs[b]! > xs[a]! ? 1 : -1));
    expect(rank(quote)).toEqual(rank(r.amounts));
  });

  it("is exact on a total too small to reach every band", () => {
    const amounts = allocateByShape(BigInt(2), ladder(0.01), ALL, [1, 1, 1]);
    expect(amounts.reduce((a, b) => a + b, BigInt(0))).toBe(BigInt(2));
  });
});
