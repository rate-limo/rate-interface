import type { BandSet } from "./bands";
import { selectableBands } from "./bands";

/**
 * Auto: turn a pair's own recent behaviour into band weights.
 *
 * The idea a user arrives with is usually "volatility should set my range width."
 * That is right for a static range like a v3 position, where price DRIFTS into
 * ground you staked out in advance. It is not directly right here, and the reason
 * is worth stating because it changes the formula:
 *
 *   `BandPool._anchor()` re-reads the TWAP on EVERY swap. A band's absolute price
 *   follows the market. A wide band never becomes cheap by the market walking to
 *   it -- it walks along with it.
 *
 * So a band is reached two ways, and only one of them is the naive one:
 *
 *   A. EXHAUSTION. One swap eats through every tighter band and spills into this
 *      one. Governed by trade SIZE against band depth, not by volatility.
 *
 *   B. ANCHOR LAG. `Oracle.twap` returns a time-weighted MEAN over the window, so
 *      the anchor trails spot. During a fast move the bands are centred on a stale
 *      price and the trailing-side bands are reachable by ordinary movement.
 *      Governed by volatility -- but over the ANCHOR WINDOW, not a horizon of
 *      one's choosing.
 *
 * Channel B is not a rounding error. For a driftless walk the gap between spot and
 * the window mean has standard deviation `sigma_W / sqrt(3)`, which at 60% annualised
 * over a 300s window is 10.7 bps -- the same size as the whole tightest band.
 * Simulation agrees: median |lag| 7.2 bps, 95th percentile 20.9 bps. At 120% the
 * 95th is 41.9 bps and reaches band 1; at 240% it is 84.2 bps and reaches band 2.
 *
 * Hence both channels, combined as independent ways to reach the same band.
 */

/** Mirrors `BandPool.TWAP_WINDOW`. The anchor's staleness is bounded by this. */
export const ANCHOR_WINDOW_SECONDS = 300;

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export interface PairStats {
  /** Annualised realised volatility as a fraction: 0.6 is 60%. */
  annualizedVol: number;
  /**
   * Mean size of ONE trade, in the same unit as `Band.liquidityUSD`. From the candle
   * buckets this is `quoteVolumeUSD / count` -- volume alone cannot answer the
   * exhaustion question, because the same volume in many small trades never leaves
   * the tightest band.
   */
  meanTradeUSD: number;
}

/**
 * Normal CDF, Abramowitz & Stegun 7.1.26 on the error function.
 *
 * Max absolute error 1.5e-7, which is far below the precision of the inputs: the
 * volatility estimate behind `z` moves by whole percent between candle windows.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Annualised close-to-close realised volatility.
 *
 * Log returns, so a move up and the same move back cancel rather than drifting the
 * estimate. Returns 0 rather than NaN on too little history: a fresh pair has no
 * volatility to speak of, and the callers below degrade to "weight the tightest
 * band", which is the right answer when nothing is known.
 */
export function realizedVolatility(closes: number[], secondsPerCandle: number): number {
  const usable = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (usable.length < 3 || secondsPerCandle <= 0) return 0;

  const returns: number[] = [];
  for (let i = 1; i < usable.length; i++) returns.push(Math.log(usable[i]! / usable[i - 1]!));

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Sample variance (n-1): with 60 one-minute candles the difference from n is 1.7%
  // on the variance, and this estimate feeds a probability that decides real money.
  const variance =
    returns.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(SECONDS_PER_YEAR / secondsPerCandle);
}

/**
 * Standard deviation of the gap between spot and the anchor, as a fraction of price.
 *
 * For a driftless walk observed over a window of length W, the spot-minus-mean gap
 * has variance `sigma^2 * W / 3`. The `/sqrt(3)` is the whole reason a 300s TWAP is
 * a usable anchor at all: it damps the move it is averaging.
 */
export function anchorLagSigma(
  annualizedVol: number,
  windowSeconds: number = ANCHOR_WINDOW_SECONDS,
): number {
  if (annualizedVol <= 0 || windowSeconds <= 0) return 0;
  return (annualizedVol * Math.sqrt(windowSeconds / SECONDS_PER_YEAR)) / Math.sqrt(3);
}

/**
 * Probability each selected band gets reached at all, tightest first.
 *
 * Two independent channels, combined as `1 - (1-a)(1-b)`:
 *
 *   drift      = P(|lag| >= tolerance), lag ~ N(0, anchorLagSigma) -- two-tailed,
 *                because the anchor can be stale in either direction.
 *   exhaustion = P(one trade > the depth of every TIGHTER band). Exponential, which
 *                is the maximum-entropy distribution given only a mean -- and a mean
 *                is genuinely all the candle buckets give us. Claiming a lognormal
 *                would be inventing a second parameter.
 *
 * The tightest band always comes out at 1: nothing is in front of it, so its
 * cumulative depth is zero and `exp(0) = 1`. That falls out rather than being
 * special-cased, which is how it should be -- band 0 fills first by construction.
 */
export function reachProbabilities(
  set: BandSet,
  selected: number[],
  stats: PairStats,
  windowSeconds: number = ANCHOR_WINDOW_SECONDS,
): number[] {
  const bands = selectableBands(set, selected);
  const lagSigma = anchorLagSigma(stats.annualizedVol, windowSeconds);

  let depthAhead = 0;
  return bands.map((index) => {
    const band = set.bands[index]!;

    const drift =
      lagSigma > 0 ? Math.min(1, 2 * (1 - normalCdf(band.tolerance / lagSigma))) : 0;
    const exhaustion =
      stats.meanTradeUSD > 0 ? Math.exp(-depthAhead / stats.meanTradeUSD) : depthAhead === 0 ? 1 : 0;

    depthAhead += Math.max(0, band.liquidityUSD);
    return Math.min(1, Math.max(0, 1 - (1 - drift) * (1 - exhaustion)));
  });
}

/**
 * Weights proportional to expected fee revenue: `P(reach) * feeMultiplier`.
 *
 * This is the first thing in the band design that makes the fee premium falsifiable
 * rather than asserted. The premium exists because a wide band is reached less often;
 * multiplying the two says exactly how much less often it would have to be reached
 * before the premium stopped paying for it. If `autoWeights` puts nothing in band 2
 * on a typical pair, the premium is too small -- and that is now a number rather
 * than an argument.
 *
 * Degrades to the tightest band when volatility is unknown and depth is unknown,
 * which is the correct read of "we have no evidence anything reaches further".
 */
export function autoWeights(
  set: BandSet,
  selected: number[],
  stats: PairStats,
  windowSeconds: number = ANCHOR_WINDOW_SECONDS,
): number[] {
  const reach = reachProbabilities(set, selected, stats, windowSeconds);
  const bands = selectableBands(set, selected);

  const weights = reach.map((p, i) => p * Math.max(0, set.bands[bands[i]!]!.feeMultiplier));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total > 0) return weights;

  // Nothing scored: put it all in the tightest usable band rather than returning a
  // zero vector the allocator would have to interpret.
  return weights.map((_, i) => (i === 0 ? 1 : 0));
}

/**
 * Build the stats Auto needs from a pair row plus its recent candles.
 *
 * The two halves come from different places on purpose. Mean trade size is now a
 * column division -- `dayQuoteVolumeUSD / dayTradesCount` -- because a pair LIST
 * needs it and joining day buckets per row does not scale. Volatility still comes
 * from candles, because it needs a window of closes and no single stored number
 * stands in for one.
 *
 * `rsi` rides along and is deliberately NOT consumed here. It cannot move a band:
 * `BandPool` stores one tolerance per band and applies it as `DENOM +/- tolerance`,
 * so a momentum read has nothing symmetric to skew. Threading it into the weights
 * anyway would produce an allocation that responds to momentum in a design that
 * cannot express momentum -- worse than ignoring it, because it would look like it
 * worked.
 */
export interface PairRowStats {
  dayQuoteVolumeUSD?: number | null;
  dayTradesCount?: number | null;
  rsi?: number | null;
}

export function pairStatsFrom(
  row: PairRowStats,
  closes: number[],
  secondsPerCandle: number,
): PairStats & { rsi: number | null } {
  const count = row.dayTradesCount ?? 0;
  const volume = row.dayQuoteVolumeUSD ?? 0;
  return {
    annualizedVol: realizedVolatility(closes, secondsPerCandle),
    // Zero when the divisor is missing rather than Infinity: a pair with volume and
    // no recorded count is a pair we cannot size trades for, and the exhaustion
    // channel correctly contributes nothing instead of everything.
    meanTradeUSD: count > 0 && volume > 0 ? volume / count : 0,
    rsi: row.rsi ?? null,
  };
}

export interface AutoVerdict {
  /** False means the Auto card is offered but disabled, with `reason` shown. */
  available: boolean;
  reason: string | null;
  /** One line naming WHICH channel is doing the work, not just the resulting tilt. */
  summary: string | null;
  /** Share of the deposit landing outside the tightest band, 0-1. */
  outerShare: number;
}

/**
 * Whether Auto can answer, and what it would be saying.
 *
 * The summary names the CHANNEL rather than describing the shape, because the shape
 * is already visible in the bars underneath it and the channel is not. "Large trades
 * reach past the first band" and "price outruns the anchor" produce similar-looking
 * allocations for completely different reasons, and an LP deciding whether to trust
 * the recommendation needs the reason.
 *
 * Unavailable is a real state, not an error. A pair with no recent trades has nothing
 * to measure, and guessing from a default would be the worst option: it would look
 * like a measurement.
 */
export function describeAuto(
  set: BandSet,
  selected: number[],
  stats: PairStats,
  windowSeconds: number = ANCHOR_WINDOW_SECONDS,
): AutoVerdict {
  const bands = selectableBands(set, selected);
  const nothing = { available: false, summary: null, outerShare: 0 };

  if (bands.length < 2) {
    return { ...nothing, reason: "Only one band can take liquidity at this pair's spread" };
  }
  if (stats.annualizedVol <= 0 && stats.meanTradeUSD <= 0) {
    return { ...nothing, reason: "No recent trading to measure" };
  }

  const weights = autoWeights(set, selected, stats, windowSeconds);
  const total = weights.reduce((a, b) => a + b, 0);
  const outerShare = total > 0 ? 1 - weights[0]! / total : 0;

  // Which channel put weight on the second band -- run each alone and compare.
  const driftOnly = reachProbabilities(set, selected, { ...stats, meanTradeUSD: 0 }, windowSeconds)[1] ?? 0;
  const sizeOnly = reachProbabilities(set, selected, { ...stats, annualizedVol: 0 }, windowSeconds)[1] ?? 0;

  let summary: string;
  if (outerShare < 0.02) {
    summary = "Everything in the tightest band — nothing reaches past it";
  } else if (sizeOnly > driftOnly) {
    summary = "Weighted outward: trades here are large enough to reach past the first band";
  } else {
    summary = "Weighted outward: this pair moves faster than the anchor follows";
  }

  return { available: true, reason: null, summary, outerShare };
}
