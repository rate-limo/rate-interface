import { describe, expect, it } from "vitest";
import { allocateAcross, allocateShaped, bandReachable, mockBandSet, selectableBands, shapeWeights, stepIntoBandBps, type Band, type BandSet } from "./bands";

describe("allocateAcross", () => {
  it("splits evenly when it divides", () => {
    expect(allocateAcross(BigInt(300), 3)).toEqual([BigInt(100), BigInt(100), BigInt(100)]);
  });

  it("always sums to the total, whatever the remainder", () => {
    for (const total of [BigInt(1), BigInt(7), BigInt(100), BigInt("1000000000000000001"), BigInt("999999999999999999")]) {
      for (const n of [1, 2, 3, 5, 8]) {
        const parts = allocateAcross(total, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, BigInt(0))).toBe(total);
      }
    }
  });

  it("gives the remainder to the tightest band, which fills first", () => {
    // 10 across 3 is 3/3/3 with 1 left over -- it belongs where the volume is.
    expect(allocateAcross(BigInt(10), 3)).toEqual([BigInt(4), BigInt(3), BigInt(3)]);
  });

  it("handles a total smaller than the band count without losing it", () => {
    expect(allocateAcross(BigInt(2), 5)).toEqual([BigInt(2), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]);
  });

  it("returns zeros rather than throwing on an empty deposit", () => {
    expect(allocateAcross(BigInt(0), 3)).toEqual([BigInt(0), BigInt(0), BigInt(0)]);
  });

  it("returns nothing when nothing is selected", () => {
    expect(allocateAcross(BigInt(100), 0)).toEqual([]);
  });
});

describe("selectableBands", () => {
  const set = mockBandSet(); // band 3 is closed

  it("drops a closed band from a selection", () => {
    expect(selectableBands(set, [0, 3])).toEqual([0]);
  });

  it("sorts into fill order, because that is what the pool walks", () => {
    expect(selectableBands(set, [2, 0, 1])).toEqual([0, 1, 2]);
  });

  it("drops indices the pool does not have", () => {
    expect(selectableBands(set, [0, 99])).toEqual([0]);
  });

  it("is empty when only closed bands were chosen", () => {
    expect(selectableBands(set, [3])).toEqual([]);
  });
});

describe("stepIntoBandBps", () => {
  /** The shipped contract ladder: 0.10 / 0.30 / 0.50% at 1x / 2x / 3x. */
  const shipped: Band[] = [
    { index: 0, tolerance: 0.001, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 1 },
    { index: 1, tolerance: 0.003, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 2 },
    { index: 2, tolerance: 0.005, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 3 },
  ];

  it("is zero for the tightest band, which nothing can push you into", () => {
    expect(stepIntoBandBps(shipped, 0)).toBe(0);
  });

  it("matches what the contract measures — 29.9 bps into band 1", () => {
    expect(stepIntoBandBps(shipped, 1)).toBeCloseTo(29.9, 1);
  });

  /** The re-spacing's whole point: both rungs are the same height now. */
  it("matches what the contract measures — 29.9 bps into band 2, the same as band 1", () => {
    expect(stepIntoBandBps(shipped, 2)).toBeCloseTo(29.9, 1);
    expect(stepIntoBandBps(shipped, 2)).toBeCloseTo(stepIntoBandBps(shipped, 1), 1);
  });

  it("counts the FEE gap, not only the price gap", () => {
    const flat = shipped.map((b) => ({ ...b, feeMultiplier: 1 }));
    // Same tolerances, no premium: the step is smaller by exactly the fee gap.
    expect(stepIntoBandBps(flat, 2)).toBeLessThan(stepIntoBandBps(shipped, 2));
    expect(stepIntoBandBps(flat, 2)).toBeCloseTo(19.9, 1);
  });

  it("respects the 3% cap the contract applies to the charged rate", () => {
    const dear = shipped.map((b) => ({ ...b, feeMultiplier: b.feeMultiplier * 100 }));
    // Both bands pin to 3%, so the fee gap vanishes and only the price gap is left.
    expect(stepIntoBandBps(dear, 2)).toBeCloseTo(19.9, 1);
  });

  it("returns 0 rather than throwing on an index the set does not have", () => {
    expect(stepIntoBandBps(shipped, 99)).toBe(0);
  });
});

describe("bandReachable", () => {
  /** The shipped contract ladder at the production 0.10% market spread. */
  const production: BandSet = {
    maturitySec: 600,
    feePct: 0.001,
    spreadReach: 0.001,
    bands: [
      { index: 0, tolerance: 0.001, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 1 },
      { index: 1, tolerance: 0.003, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 2 },
      { index: 2, tolerance: 0.005, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 3 },
    ],
  };

  it("matches the contract at the production spread: only band 0", () => {
    expect(production.bands.map((b) => bandReachable(production, b))).toEqual([true, false, false]);
  });

  it("is inclusive at the boundary, exactly as BandPool is", () => {
    const at30 = { ...production, spreadReach: 0.003 };
    expect(production.bands.map((b) => bandReachable(at30, b))).toEqual([true, true, false]);
  });

  it("opens every band once the spread reaches the widest", () => {
    const at100 = { ...production, spreadReach: 0.005 };
    expect(production.bands.map((b) => bandReachable(at100, b))).toEqual([true, true, true]);
  });

  it("keeps CLOSED and OUT-OF-REACH as separate facts", () => {
    const closedTight: BandSet = {
      ...production,
      spreadReach: 0.01, // everything is reachable
      bands: [{ ...production.bands[0]!, open: false }, ...production.bands.slice(1)],
    };
    // Band 0 is reachable but shut by the creator: two different things.
    expect(bandReachable(closedTight, closedTight.bands[0]!)).toBe(true);
    expect(selectableBands(closedTight, [0, 1, 2])).toEqual([1, 2]);
  });

  it("drops out-of-reach bands from a restored selection", () => {
    expect(selectableBands(production, [0, 1, 2])).toEqual([0]);
  });
});

describe("shapeWeights", () => {
  it("spot is flat at any width", () => {
    expect(shapeWeights("spot", 3)).toEqual([1, 1, 1]);
    expect(shapeWeights("spot", 2)).toEqual([1, 1]);
  });

  it("curve leans to the tightest band, wide to the outermost", () => {
    expect(shapeWeights("curve", 3)).toEqual([3, 2, 1]);
    expect(shapeWeights("wide", 3)).toEqual([1, 2, 3]);
  });

  it("interpolates to a narrower set rather than needing a special case", () => {
    expect(shapeWeights("curve", 2)).toEqual([2, 1]);
    expect(shapeWeights("wide", 2)).toEqual([1, 2]);
  });

  it("is a single full weight at one band, which is what makes presets collapse", () => {
    expect(shapeWeights("curve", 1)).toEqual([1]);
    expect(shapeWeights("wide", 1)).toEqual([1]);
  });

  it("returns nothing for an empty set rather than throwing", () => {
    expect(shapeWeights("spot", 0)).toEqual([]);
  });
});

describe("allocateShaped", () => {
  /** The shipped ladder. `spreadReach` is what decides which bands can take a deposit. */
  const ladder = (reach: number): BandSet => ({
    maturitySec: 600,
    feePct: 0.001,
    spreadReach: reach,
    bands: [
      { index: 0, tolerance: 0.001, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 1 },
      { index: 1, tolerance: 0.003, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 2 },
      { index: 2, tolerance: 0.005, open: true, liquidityUSD: 0, feesBase: 0, feesQuote: 0, feeMultiplier: 3 },
    ],
  });
  const ALL = [0, 1, 2];
  const T = BigInt(600);

  it("shapes across every band when the spread reaches them all", () => {
    expect(allocateShaped(T, ladder(0.005), ALL, "spot").amounts).toEqual([BigInt(200), BigInt(200), BigInt(200)]);
    expect(allocateShaped(T, ladder(0.005), ALL, "curve").amounts).toEqual([BigInt(300), BigInt(200), BigInt(100)]);
    expect(allocateShaped(T, ladder(0.005), ALL, "wide").amounts).toEqual([BigInt(100), BigInt(200), BigInt(300)]);
  });

  /** The question this exists to answer: a refused band takes nothing at all. */
  it("omits a band the spread cannot reach, rather than sending it zero", () => {
    const r = allocateShaped(T, ladder(0.003), ALL, "curve");
    expect(r.bands).toEqual([0, 1]);
    expect(r.amounts).toEqual([BigInt(400), BigInt(200)]);
  });

  it("redistributes the refused weight proportionally, keeping the shape", () => {
    // curve over {0,1} is 2:1, not the 3:2 it would have been with band 2 present --
    // the shape is re-derived for the bands that exist, not truncated.
    const r = allocateShaped(BigInt(900), ladder(0.003), ALL, "curve");
    expect(r.amounts).toEqual([BigInt(600), BigInt(300)]);
  });

  it("never lets an unusable band into the call arrays", () => {
    for (const shape of ["spot", "curve", "wide"] as const) {
      const r = allocateShaped(T, ladder(0.001), ALL, shape);
      expect(r.bands).toEqual([0]);
      expect(r.bands).not.toContain(1);
      expect(r.bands).not.toContain(2);
    }
  });

  /** At the production spread every preset is the same deposit. */
  it("collapses to one band at the production spread, identically for all three", () => {
    const production = ladder(0.001);
    const spot = allocateShaped(T, production, ALL, "spot");
    const curve = allocateShaped(T, production, ALL, "curve");
    const wide = allocateShaped(T, production, ALL, "wide");
    expect(spot).toEqual(curve);
    expect(curve).toEqual(wide);
    expect(spot.amounts).toEqual([T]);
  });

  it("skips a band the creator closed, on the same path", () => {
    const set = ladder(0.005);
    set.bands[1] = { ...set.bands[1]!, open: false };
    const r = allocateShaped(T, set, ALL, "spot");
    expect(r.bands).toEqual([0, 2]);
    expect(r.amounts).toEqual([BigInt(300), BigInt(300)]);
  });

  it("always sums to the total, at every shape and every width", () => {
    for (const reach of [0.001, 0.003, 0.005]) {
      for (const shape of ["spot", "curve", "wide"] as const) {
        for (const total of [BigInt(1), BigInt(7), BigInt(1000), BigInt("1000000000000000001")]) {
          const r = allocateShaped(total, ladder(reach), ALL, shape);
          expect(r.amounts.reduce((a, b) => a + b, BigInt(0))).toBe(total);
        }
      }
    }
  });

  it("returns empty rather than throwing when nothing is selectable", () => {
    const shut = ladder(0.005);
    shut.bands = shut.bands.map((b) => ({ ...b, open: false }));
    expect(allocateShaped(T, shut, ALL, "curve")).toEqual({ bands: [], amounts: [] });
  });
});
