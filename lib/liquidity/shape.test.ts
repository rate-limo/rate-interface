import { describe, expect, it } from "vitest";
import type { BandSet } from "./bands";
import { allocateShaped, shapeWeights } from "./bands";
import { autoWeights, type PairStats } from "./auto";
import { allocateByShape, depositUnits, formatDepositUnits, resolveDepositShape, reallocate } from "./shape";

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

/*
 * The split the chart's drag and the sliders both write.
 *
 * Every one of these is a way to misallocate someone's money without throwing:
 * a remainder spread evenly instead of proportionally flattens the curve they
 * chose, a share that does not total one deposits less than they typed, and an
 * emptied vector leaves a Review button that silently stops working.
 */
describe("reallocate", () => {
  const CURVE = [3, 2, 1];

  it("always totals one", () => {
    for (const pos of [0, 1, 2]) {
      for (const share of [0, 0.15, 0.5, 0.83, 1]) {
        const next = reallocate(CURVE, pos, share);
        if (!next) continue;
        const sum = next.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
      }
    }
  });

  it("gives the band exactly the share asked for", () => {
    expect(reallocate(CURVE, 1, 0.4)![1]).toBeCloseTo(0.4, 10);
  });

  // The failure an even split of the remainder produces: nudging one band
  // quietly turns the curve the LP picked into something else.
  it("keeps the other bands in their existing balance", () => {
    const next = reallocate(CURVE, 0, 0.4)!;
    // The others were 2:1 and must still be 2:1 across the remaining 0.6.
    expect(next[1]! / next[2]!).toBeCloseTo(2, 10);
    expect(next[1]! + next[2]!).toBeCloseTo(0.6, 10);
  });

  it("empties a band to zero and gives its share to the rest", () => {
    const next = reallocate(CURVE, 2, 0)!;
    expect(next[2]).toBe(0);
    expect(next[0]! + next[1]!).toBeCloseTo(1, 10);
  });

  it("takes everything when a band is pulled to 100%", () => {
    expect(reallocate(CURVE, 2, 1)).toEqual([0, 0, 1]);
  });

  it("gives the remainder to the band that fills first when nothing else holds any", () => {
    // Coming back from an all-in position: there is no proportion to preserve,
    // so the tightest band takes it rather than an arbitrary neighbour.
    const next = reallocate([0, 0, 1], 2, 0.25)!;
    expect(next[0]).toBeCloseTo(0.75, 10);
    expect(next[1]).toBe(0);
  });

  it("refuses a move that would empty the deposit", () => {
    // One band at zero leaves nothing to deposit; the gesture is refused, not
    // applied as a split that sums to nothing.
    expect(reallocate([1], 0, 0)).toBeNull();
  });

  it("refuses a position that is not a band", () => {
    expect(reallocate(CURVE, -1, 0.5)).toBeNull();
    expect(reallocate(CURVE, 3, 0.5)).toBeNull();
  });

  it("clamps a share outside 0–1 and treats a non-number as zero", () => {
    expect(reallocate(CURVE, 0, 2)).toEqual([1, 0, 0]);
    expect(reallocate(CURVE, 0, -1)![0]).toBe(0);
    expect(reallocate(CURVE, 0, Number.NaN)![0]).toBe(0);
  });
});
