import { describe, expect, it } from "vitest";
import type { BandSet } from "./bands";
import { allocateShaped } from "./bands";
import {
  ANCHOR_WINDOW_SECONDS,
  anchorLagSigma,
  autoWeights,
  normalCdf,
  reachProbabilities,
  describeAuto,
  pairStatsFrom,
  realizedVolatility,
} from "./auto";

/** The shipped ladder, with depth in the tightest band so exhaustion has something to chew. */
const ladder = (reach: number, depth = [50_000, 30_000, 20_000]): BandSet => ({
  spreadReach: reach,
  maturitySec: 600,
  feePct: 0.1,
  bands: [0.001, 0.003, 0.005].map((tolerance, i) => ({
    index: i,
    tolerance,
    open: true,
    liquidityUSD: depth[i]!,
    feesBase: 0,
    feesQuote: 0,
    feeMultiplier: i + 1 === 3 ? 3 : i + 1,
  })),
});

const ALL = [0, 1, 2];
const QUIET = { annualizedVol: 0.15, meanTradeUSD: 500 };
const VIOLENT = { annualizedVol: 2.4, meanTradeUSD: 90_000 };

describe("normalCdf", () => {
  it("is a distribution", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
  });
});

describe("realizedVolatility", () => {
  it("recovers the volatility of a path built with a known step", () => {
    // Alternating +/- s in log space: every return is exactly +/-s, so the sample
    // standard deviation IS s and the annualisation is the only thing under test.
    const s = 0.001;
    const closes = [100];
    for (let i = 1; i <= 60; i++) closes.push(closes[i - 1]! * Math.exp(i % 2 ? s : -s));

    // 60 returns, thirty of each sign, so the mean is exactly zero and the sample
    // variance is s^2 * 60/59 -- the (n-1) correction, which is deliberate: this
    // estimate feeds a probability that decides an allocation.
    const annual = realizedVolatility(closes, 60);
    const expected = s * Math.sqrt(60 / 59) * Math.sqrt((365 * 24 * 60 * 60) / 60);
    expect(annual).toBeCloseTo(expected, 6);
  });

  it("is zero on a flat series, not NaN", () => {
    expect(realizedVolatility([100, 100, 100, 100], 60)).toBe(0);
  });

  it("is zero rather than a guess when a pair is too fresh to have history", () => {
    expect(realizedVolatility([100, 101], 60)).toBe(0);
    expect(realizedVolatility([], 60)).toBe(0);
  });

  it("ignores the junk a gap-filled series carries", () => {
    expect(realizedVolatility([100, 0, 101, -5, 102, 103], 60)).toBeGreaterThan(0);
  });
});

describe("anchorLagSigma", () => {
  /**
   * The number the whole drift channel rests on. Measured against a 20,000-path
   * simulation of the spot-minus-window-mean gap: predicted std 10.7 bps, simulated
   * median |lag| 7.2 bps (= 0.674 sigma, exactly the half-normal median).
   */
  it("is 10.7 bps for a 60% pair over the 300s anchor window", () => {
    expect(anchorLagSigma(0.6) * 10_000).toBeCloseTo(10.7, 1);
    expect(ANCHOR_WINDOW_SECONDS).toBe(300);
  });

  it("damps by sqrt(3) — which is why a mean is a usable anchor at all", () => {
    const raw = 0.6 * Math.sqrt(300 / (365 * 24 * 60 * 60));
    expect(anchorLagSigma(0.6)).toBeCloseTo(raw / Math.sqrt(3), 9);
  });

  it("shrinks with the window, so a shorter TWAP trails less", () => {
    expect(anchorLagSigma(0.6, 60)).toBeLessThan(anchorLagSigma(0.6, 300));
  });

  it("is zero when volatility is unknown", () => {
    expect(anchorLagSigma(0)).toBe(0);
  });
});

describe("reachProbabilities", () => {
  it("is certain for the tightest band, which fills first by construction", () => {
    expect(reachProbabilities(ladder(0.01), ALL, QUIET)[0]).toBe(1);
    expect(reachProbabilities(ladder(0.01), ALL, VIOLENT)[0]).toBe(1);
  });

  it("falls off with distance", () => {
    const p = reachProbabilities(ladder(0.01), ALL, VIOLENT);
    expect(p[0]!).toBeGreaterThan(p[1]!);
    expect(p[1]!).toBeGreaterThan(p[2]!);
  });

  it("rises with volatility — the drift channel", () => {
    const still = reachProbabilities(ladder(0.01), ALL, { ...QUIET, meanTradeUSD: 0 });
    const wild = reachProbabilities(ladder(0.01), ALL, { annualizedVol: 2.4, meanTradeUSD: 0 });
    expect(wild[2]!).toBeGreaterThan(still[2]!);
  });

  it("rises with trade size at the SAME volatility — the exhaustion channel", () => {
    const small = reachProbabilities(ladder(0.01), ALL, { annualizedVol: 0, meanTradeUSD: 1_000 });
    const whale = reachProbabilities(ladder(0.01), ALL, { annualizedVol: 0, meanTradeUSD: 200_000 });
    expect(whale[2]!).toBeGreaterThan(small[2]!);
    // With zero volatility the drift channel is off entirely, so this is exhaustion alone.
    expect(small[2]!).toBeCloseTo(Math.exp(-80_000 / 1_000), 6);
  });

  it("counts only the depth AHEAD of a band, not its own", () => {
    const thin = reachProbabilities(ladder(0.01, [1, 1, 1]), ALL, { annualizedVol: 0, meanTradeUSD: 1_000 });
    expect(thin[1]!).toBeCloseTo(Math.exp(-1 / 1_000), 6);
  });

  it("skips bands the pool would refuse", () => {
    expect(reachProbabilities(ladder(0.003), ALL, VIOLENT)).toHaveLength(2);
  });
});

describe("autoWeights", () => {
  it("concentrates on the tightest band when nothing reaches further", () => {
    const w = autoWeights(ladder(0.01), ALL, { annualizedVol: 0.05, meanTradeUSD: 100 });
    expect(w[0]!).toBeGreaterThan(w[1]! * 50);
  });

  it("spreads outward when the pair actually moves", () => {
    const calm = autoWeights(ladder(0.01), ALL, QUIET);
    const wild = autoWeights(ladder(0.01), ALL, VIOLENT);
    const outerShare = (w: number[]) => w[2]! / w.reduce((a, b) => a + b, 0);
    expect(outerShare(wild)).toBeGreaterThan(outerShare(calm));
  });

  it("never returns an all-zero vector for the allocator to interpret", () => {
    const w = autoWeights(ladder(0.01), ALL, { annualizedVol: 0, meanTradeUSD: 0 });
    expect(w.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(w[0]!).toBeGreaterThan(0);
  });

  /**
   * The premium, made falsifiable. Band 2 charges 3x because it is reached less
   * often; this is the volatility at which that trade starts paying. If the answer
   * were absurd -- no pair is ever this volatile -- the premium would be too small,
   * and it would be a measured claim rather than an argued one.
   */
  it("says what it takes for band 2 to be worth its 3x premium", () => {
    const share = (vol: number) => {
      const w = autoWeights(ladder(0.01), ALL, { annualizedVol: vol, meanTradeUSD: 500 });
      return w[2]! / w.reduce((a, b) => a + b, 0);
    };
    expect(share(0.3)).toBeLessThan(0.05);
    expect(share(3.0)).toBeGreaterThan(0.2);
    expect(share(3.0)).toBeGreaterThan(share(0.3));
  });
});

describe("allocateShaped with explicit weights", () => {
  const T = BigInt("1000000000000000000");

  it("is exact — the amounts sum to the deposit", () => {
    const { amounts } = allocateShaped(T, ladder(0.01), ALL, autoWeights(ladder(0.01), ALL, VIOLENT));
    expect(amounts.reduce((a, b) => a + b, BigInt(0))).toBe(T);
  });

  it("still refuses to send anything to a band out of reach", () => {
    const set = ladder(0.003);
    const { bands, amounts } = allocateShaped(T, set, ALL, autoWeights(set, ALL, VIOLENT));
    expect(bands).toEqual([0, 1]);
    expect(amounts.reduce((a, b) => a + b, BigInt(0))).toBe(T);
  });

  it("falls back to an even split rather than misallocating on a mismatched vector", () => {
    const { amounts } = allocateShaped(T, ladder(0.01), ALL, [1, 2]);
    expect(amounts).toHaveLength(3);
    expect(amounts.reduce((a, b) => a + b, BigInt(0))).toBe(T);
  });

  it("puts more in the outer band under auto than curve would", () => {
    const set = ladder(0.01);
    const auto = allocateShaped(T, set, ALL, autoWeights(set, ALL, VIOLENT));
    const curve = allocateShaped(T, set, ALL, "curve");
    expect(auto.amounts[2]!).toBeGreaterThan(curve.amounts[2]!);
  });
});

describe("pairStatsFrom", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 * Math.exp(0.002 * (i % 2 ? 1 : -1)));

  it("divides the day volume by the day trade count", () => {
    const s = pairStatsFrom({ dayQuoteVolumeUSD: 120_000, dayTradesCount: 10 }, closes, 60);
    expect(s.meanTradeUSD).toBe(12_000);
    expect(s.annualizedVol).toBeGreaterThan(0);
  });

  it("is zero — not Infinity — when the count is missing", () => {
    expect(pairStatsFrom({ dayQuoteVolumeUSD: 120_000 }, closes, 60).meanTradeUSD).toBe(0);
    expect(pairStatsFrom({ dayQuoteVolumeUSD: 120_000, dayTradesCount: 0 }, closes, 60).meanTradeUSD).toBe(0);
  });

  it("carries rsi through without letting it touch the weights", () => {
    const set = ladder(0.01);
    const hot = pairStatsFrom({ dayQuoteVolumeUSD: 120_000, dayTradesCount: 10, rsi: 82 }, closes, 60);
    const cold = pairStatsFrom({ dayQuoteVolumeUSD: 120_000, dayTradesCount: 10, rsi: 18 }, closes, 60);

    expect(hot.rsi).toBe(82);
    expect(cold.rsi).toBe(18);
    // A band has one tolerance for both directions, so momentum has nothing to skew.
    // Identical weights is the HONEST outcome, and this test exists to catch someone
    // wiring rsi into the weights before the contract can express it.
    expect(autoWeights(set, ALL, hot)).toEqual(autoWeights(set, ALL, cold));
  });
});

describe("describeAuto", () => {
  it("declines when the spread leaves nothing to distribute", () => {
    const v = describeAuto(ladder(0.001), ALL, VIOLENT);
    expect(v.available).toBe(false);
    expect(v.reason).toMatch(/one band/i);
  });

  it("declines when there is nothing to measure, rather than guessing", () => {
    const v = describeAuto(ladder(0.01), ALL, { annualizedVol: 0, meanTradeUSD: 0 });
    expect(v.available).toBe(false);
    expect(v.reason).toMatch(/no recent trading/i);
  });

  it("names the SIZE channel when large trades are what reach", () => {
    // Low volatility, huge trades: only exhaustion can be doing this.
    const v = describeAuto(ladder(0.01), ALL, { annualizedVol: 0.05, meanTradeUSD: 200_000 });
    expect(v.available).toBe(true);
    expect(v.summary).toMatch(/large enough/i);
  });

  it("names the DRIFT channel when the anchor is what lags", () => {
    // Violent, but every trade is dust: only anchor lag can be doing this.
    const v = describeAuto(ladder(0.01), ALL, { annualizedVol: 3.0, meanTradeUSD: 1 });
    expect(v.available).toBe(true);
    expect(v.summary).toMatch(/faster than the anchor/i);
  });

  it("says so plainly when nothing reaches past the first band", () => {
    const v = describeAuto(ladder(0.01), ALL, { annualizedVol: 0.02, meanTradeUSD: 10 });
    expect(v.summary).toMatch(/tightest band/i);
    expect(v.outerShare).toBeLessThan(0.02);
  });

  it("reports an outer share that matches the weights it describes", () => {
    const w = autoWeights(ladder(0.01), ALL, VIOLENT);
    const total = w.reduce((a, b) => a + b, 0);
    expect(describeAuto(ladder(0.01), ALL, VIOLENT).outerShare).toBeCloseTo(1 - w[0]! / total, 9);
  });
});
