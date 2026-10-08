/**
 * Bands — the tolerance buckets a BandPool aggregates liquidity into.
 *
 * A band is NOT a v3 fee tier and NOT a tick range. It is a tolerance around the
 * TWAP, in the venue's 8-decimal price space, and it is the unit the pool keeps
 * one `shares` scalar and one fee accumulator for. That is why the LP picks one
 * from a list instead of inventing a tolerance: every unit inside a band has to
 * earn identically, or a single accumulator cannot describe it.
 *
 * The creator configures the set. The LP picks one or more bands and an amount.
 * There is deliberately no range: a position stores none, and `_fillBand` reads
 * none, so showing "your range" would promise capital that stops working outside it
 * when it never did. Anything here that looks like a knob for the LP and is not one
 * should render as a fact, not a control.
 *
 * @see contracts/src/swap/PoolBands.sol
 * @see docs/superpowers/specs/2026-08-21-aggregated-pool-liquidity-design.md
 */

export interface Band {
  /** Index in the pool's band array — also its fill order, tightest first. */
  index: number;
  /** Tolerance either side of the TWAP, as a fraction (0.02 = ±2%). */
  tolerance: number;
  /** Accepts new liquidity. A closed band still earns and can still be exited. */
  open: boolean;
  /** Quote-denominated liquidity sitting in the band. */
  liquidityUSD: number;
  /** Fees accrued, per side. A band earns in BOTH currencies — never one figure. */
  feesBase: number;
  feesQuote: number;
  /** Premium over the engine's taker fee, as a multiple. 1 = no premium. */
  feeMultiplier: number;
  /**
   * `bandReserves(i)`, raw and exact — NOT the priced `liquidityUSD` above.
   *
   * Carried because whether a band can take one token on its own is decided by
   * which of its two reserves are non-zero, and that is an exact question the
   * chain answers. `undefined` means not read (the illustrative ladder, or a read
   * still in flight), which `lib/liquidity/wall.ts` treats as "not known" rather
   * than as empty.
   */
  baseReserve?: bigint;
  quoteReserve?: bigint;
}

export interface BandSet {
  bands: Band[];
  /**
   * How far the pair's own market spread reaches, as a fraction of the TWAP.
   *
   * The pool refuses a deposit into any band whose tolerance reaches past this —
   * `BandBeyondSpread` — because the spread is the venue's statement about how far
   * this price travels, and liquidity beyond it is offered at a distance the venue has
   * declared out of range. The tighter of the buy and sell sides governs on chain, so
   * this is that value, already resolved.
   */
  spreadReach: number;
  /** Seconds until fees are fully vested. Creator-set, per pool. */
  maturitySec: number;
  /** Pool fee, as a fraction. Charged on the conversion a single-sided deposit does. */
  feePct: number;
}

/** Absolute price bounds of a band around the anchor. */
export function bandBounds(anchor: number, tolerance: number): [number, number] {
  return [anchor * (1 - tolerance), anchor * (1 + tolerance)];
}

export interface SingleSidedQuote {
  /** How much of the input is converted. */
  convert: number;
  /** What the conversion returns, net of fee. */
  receive: number;
  /** The fee that conversion pays, in the received token. */
  fee: number;
}

/**
 * What `BandPositionManager.addLiquiditySingleSided` will do with one token.
 *
 * HALF, deliberately, and the contract does the same. The balanced split solves
 * `(A - s) / out(s) == baseReserve / quoteReserve`, but execution happens at the
 * band's TWAP-anchored bound, so `out(s)` is not known until the swap returns —
 * there is no closed form to show. Half is exact when bound and ratio coincide,
 * and the residual is refunded rather than kept.
 *
 * So this is an ESTIMATE and callers must render it as one. A firm-looking number
 * here would be the same class of lie as a market order quoted as a limit price.
 */
export function quoteSingleSided(
  amountIn: number,
  price: number,
  inputIsBase: boolean,
  feePct: number,
): SingleSidedQuote {
  const convert = amountIn / 2;
  const gross = inputIsBase ? convert * price : convert / price;
  const fee = gross * feePct;
  return { convert, receive: gross - fee, fee };
}

/**
 * Illustrative band set, until the pool read exists.
 *
 * Mirrors `BandPoolFactory`'s shape: a creator-configured list, tightest first,
 * with one closed so the closed state is exercised rather than theoretical. Swap
 * this for a contract read; nothing above it needs to change.
 */
export function mockBandSet(): BandSet {
  return {
    maturitySec: 600,
    feePct: 0.001,
    // 1% here so the illustrative set is fully usable; a production pair ships at
    // 0.10%, where only the tightest band can take liquidity at all.
    spreadReach: 0.01,
    bands: [
      // The ladder a 0.50%-spread pair ends up with. The chain now FITS this shape
      // to the pair's market spread on the first deposit -- 20/60/100% of it -- so a
      // 0.10% pair reads 0.02/0.06/0.10% instead. The ratios are the design; the
      // absolute numbers are a consequence of the pair.
      { index: 0, tolerance: 0.001, open: true, liquidityUSD: 18_200, feesBase: 0.004, feesQuote: 9.1, feeMultiplier: 1 },
      { index: 1, tolerance: 0.003, open: true, liquidityUSD: 64_700, feesBase: 0.011, feesQuote: 22.4, feeMultiplier: 2 },
      { index: 2, tolerance: 0.005, open: true, liquidityUSD: 31_000, feesBase: 0.002, feesQuote: 4.8, feeMultiplier: 3 },
      // A creator-added fourth, closed, so the closed state stays exercised.
      { index: 3, tolerance: 0.01, open: false, liquidityUSD: 7_400, feesBase: 0, feesQuote: 0, feeMultiplier: 4 },
    ],
  };
}

/**
 * How much slippage a taker must tolerate to be pushed INTO this band from the one
 * before it, in basis points.
 *
 * This is the number that decides whether an outer band catches the overflow when
 * band 0 runs dry. Bands quantise price: a taker quoted in band 0 whose fill gets
 * moved to band 1 does not pay slightly more, they pay the whole gap at once. If
 * their tolerance is under that gap the trade REVERTS instead of filling here, so
 * the band sees none of that flow however deep it is.
 *
 * Two things make up the gap, and leaving either out understates it:
 *   - the price gap between the two tolerances, and
 *   - the FEE gap, because a band's premium is charged to the taker as well.
 *
 * Returns 0 for the tightest band, which nothing can push you into.
 * Verified against BandSlippageStep.t.sol: 29.9 bps for 0→1, 89.2 for 1→2.
 */
export function stepIntoBandBps(
  bands: Band[],
  index: number,
  engineFeeRate = ENGINE_TAKER_FEE_RATE,
): number {
  const prev = bands[index - 1];
  const here = bands[index];
  if (!prev || !here) return 0;
  const priceGap = (1 + prev.tolerance) / (1 + here.tolerance);
  const feeGap = (1 - bandFeeRate(here, engineFeeRate)) / (1 - bandFeeRate(prev, engineFeeRate));
  return Math.round((1 - priceGap * feeGap) * 10000 * 10) / 10;
}

/** The engine's base taker fee. A band's own rate is a MULTIPLE of this. */
export const ENGINE_TAKER_FEE_RATE = 0.001;

/** `MAX_FEE_RATE` in the contract — a band cannot charge past 3% however high
 *  its multiplier. */
const MAX_BAND_FEE_RATE = 0.03;

/**
 * What a taker actually pays to fill in this band, as a fraction.
 *
 * `feeMultiplier` is the number the pool stores and the number an LP earns on:
 * a 2x band charges twice the engine's taker fee on every fill it takes. That
 * is the compensation for sitting further out, where fills arrive less often —
 * which makes it the one figure that explains why anyone would choose a wide
 * band, and it went unrendered until 2026-09-04.
 *
 * Shared with `stepIntoBandBps` rather than inlined in each, so the multiplier
 * shown to an LP and the step used in the reach calculation cannot disagree
 * about what a band charges.
 */
export function bandFeeRate(band: Band, engineFeeRate = ENGINE_TAKER_FEE_RATE): number {
  return Math.min(engineFeeRate * band.feeMultiplier, MAX_BAND_FEE_RATE);
}

/**
 * Each band's share of the fees the pool has actually earned, quote-denominated.
 *
 * A band earns in BOTH currencies, so neither `feesBase` nor `feesQuote` ranks
 * them on its own — 0.011 base and 22.4 quote is a bigger number than 0.004 and
 * 9.1 only once the base side is priced. `anchor` is what prices it.
 *
 * Returns null shares when the pool has earned nothing at all: 0% on every row
 * would read as a measured result rather than "no fills yet".
 */
export function bandFeeShares(bands: Band[], anchor: number): (number | null)[] {
  const valued = bands.map((b) => b.feesQuote + b.feesBase * anchor);
  const total = valued.reduce((sum, v) => sum + v, 0);
  return valued.map((v) => (total > 0 ? v / total : null));
}

/**
 * How a deposit is shaped across the bands it lands in.
 *
 * `spot` and `curve` are DLMM's, and carry over intact — they are statements about
 * WEIGHT, and weight interpolates over three buckets as well as over sixty-nine.
 *
 * `wide` is DLMM's bid-ask WEIGHTING under a different name, deliberately. Bid-ask
 * there is directional: bins above the price hold base and bins below hold quote, so
 * the shape is a sell ladder up and a buy ladder down. A band has no directional
 * edges — it quotes `+tolerance` on buys and `−tolerance` on sells, both sides, always
 * — and a position is one share count over BOTH reserves, so there is no way to be
 * sell-only in one. The weighting transfers; the strategy does not, and calling it
 * bid-ask would promise a thing this pool cannot do.
 */
export type BandShape = "spot" | "curve" | "wide";

/**
 * Relative weights for `k` bands, tightest first.
 *
 * Linear rather than gaussian: with three buckets a curve and a ramp are
 * indistinguishable, and a ramp says what it does. It generalises to any k, so a set
 * reduced by refusals still gets a shape rather than a special case.
 */
export function shapeWeights(shape: BandShape, k: number): number[] {
  if (k <= 0) return [];
  return Array.from({ length: k }, (_, i) => {
    if (shape === "spot") return 1;
    return shape === "curve" ? k - i : i + 1;
  });
}

/**
 * Allocate a deposit across bands under a shape, skipping any the pool would refuse.
 *
 * A band out of the spread's reach, or closed by the creator, takes NOTHING and its
 * weight is redistributed over the survivors in proportion. That keeps the shape's
 * intent — relative emphasis among the bands that exist — where pushing the weight to
 * the nearest neighbour would quietly turn a curve into something else.
 *
 * It matters because `addLiquidityAcross` reverts the WHOLE batch on one refused band.
 * A preset that assigned weight to an unusable band would not deposit less there; it
 * would fail the entire deposit.
 *
 * Returns the two arrays `addLiquidityAcross` takes and nothing else — the usable
 * band indices and their amounts, aligned. Returning a full-length array with zeros
 * for refused bands would read as convenient and be a trap: the gate rejects a band
 * by INDEX before it looks at the amount, so passing a zero for an out-of-reach band
 * still reverts the whole batch. The shape of the return makes that unbuildable.
 *
 * Exact by construction: the amounts always sum to `total`.
 */
export function allocateShaped(
  total: bigint,
  set: BandSet,
  selected: number[],
  shape: BandShape | number[],
): { bands: number[]; amounts: bigint[] } {
  const zero = BigInt(0);
  const bands = selectableBands(set, selected);
  if (bands.length === 0 || total <= zero) {
    return { bands, amounts: bands.map(() => zero) };
  }

  const weights = Array.isArray(shape) ? shape.slice(0, bands.length) : shapeWeights(shape, bands.length);
  if (weights.length !== bands.length) {
    // A caller-supplied vector that does not line up with the usable bands is a bug
    // upstream; splitting evenly is the one answer that cannot silently misallocate.
    return { bands, amounts: allocateAcross(total, bands.length) };
  }
  return { bands, amounts: splitByWeights(total, weights) };
}

/**
 * Split one total across a weight vector, exactly.
 *
 * Extracted from `allocateShaped` because the same split has to happen TWICE at
 * different scales and the two must not be separate implementations. The range
 * step allocates at a fixed 4-decimal display precision to draw the picker bars
 * and the receipt; the deposit has to allocate the identical shape at the
 * token's real decimals, because those display units are 10^14 short of what an
 * 18-decimal ERC-20 expects. One function, called twice, is what stops the
 * receipt and the transaction drifting apart — which is the failure this whole
 * module already exists to prevent.
 *
 * Weights are quantised to per-million on the way in. `autoWeights` scores bands
 * by expected fee revenue and so returns floats, and rounding at the WEIGHT is a
 * rounding of the shape, where rounding inside the division below would be a
 * rounding of the money. Integer preset weights survive it unchanged: scaling a
 * weight vector by a constant cannot move a floored share.
 *
 * Exact by construction — the amounts always sum to `total`.
 */
export function splitByWeights(total: bigint, weights: readonly number[]): bigint[] {
  const zero = BigInt(0);
  const n = weights.length;
  if (n === 0) return [];
  // A zero total is the normal state of the side the LP is NOT bringing, so it
  // returns a full-length row of zeros rather than an empty one: the arrays
  // `addLiquidityAcross` takes must stay aligned with its band list.
  if (total <= zero) return new Array<bigint>(n).fill(zero);

  const quantised = weights.map((w) => (Number.isFinite(w) ? Math.max(0, Math.round(w * 1e6)) : 0));
  const totalWeight = quantised.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return allocateAcross(total, n);

  const amounts = new Array<bigint>(n).fill(zero);
  let assigned = zero;
  for (let i = 1; i < n; i++) {
    amounts[i] = (total * BigInt(quantised[i]!)) / BigInt(totalWeight);
    assigned += amounts[i]!;
  }
  // The tightest usable band absorbs the remainder: it fills first and does the most
  // volume, so dust is worth the most there -- the same rule allocateAcross follows.
  amounts[0] = total - assigned;
  return amounts;
}

/**
 * Split a deposit across the bands an LP selected.
 *
 * Equal shares, with the remainder going to the FIRST entry rather than the last:
 * bands are ordered tightest-first, which is also fill order, so the tightest band
 * does the most volume and dust is worth the most sitting there.
 *
 * Exact by construction — the returned amounts always sum to `total` — because a UI
 * that displays a split which does not add up to what the wallet is about to spend
 * is worse than one that shows nothing. Operates on bigint because that is what
 * `addLiquidityAcross` takes; anything float-shaped here would round twice.
 *
 * `BigInt(0)` rather than `0n` throughout: this app targets ES2017, where the literal
 * syntax is a compile error while the global is perfectly available.
 */
export function allocateAcross(total: bigint, count: number): bigint[] {
  const zero = BigInt(0);
  if (count <= 0) return [];
  if (total <= zero) return new Array<bigint>(count).fill(zero);
  const each = total / BigInt(count);
  const out = new Array<bigint>(count).fill(each);
  out[0] += total - each * BigInt(count);
  return out;
}

/**
 * Can this band take a deposit at all?
 *
 * Two independent reasons it cannot, and they are different facts about the pool:
 * the CREATOR closed it, or the pair's SPREAD does not reach it. Collapsing them
 * into one "unavailable" would tell an LP the creator did something the creator did
 * not do — and the second one fixes itself when the spread widens.
 */
export function bandReachable(set: BandSet, band: Band): boolean {
  return band.tolerance <= set.spreadReach;
}

/**
 * The bands a deposit may actually target: open, within the spread's reach, in fill
 * order.
 *
 * Neither kind of unavailable band is hidden — the picker renders both, since a
 * closed band and an out-of-reach band are each facts about the pool — but neither
 * can end up in a selection, including one restored from a previous session.
 */
export function selectableBands(set: BandSet, selected: number[]): number[] {
  const usable = new Set(
    set.bands.filter((b) => b.open && bandReachable(set, b)).map((b) => b.index),
  );
  return selected.filter((i) => usable.has(i)).sort((a, b) => a - b);
}

/**
 * Every band a deposit could actually enter, tightest first.
 *
 * This is what a PRESET selects. Before it existed as its own export, choosing
 * a shape only reweighted whatever the LP had already ticked — and the flow
 * opens with a single band ticked, so Spot, Curve and Wide all produced a
 * byte-identical deposit and the control appeared to do nothing. A distribution
 * needs something to distribute across; the preset is what provides it.
 *
 * Refused bands are excluded rather than zero-weighted, for the reason
 * `allocateShaped` records: `addLiquidityAcross` rejects a band by INDEX before
 * it reads the amount, so a zero for an out-of-reach band does not deposit less
 * there — it reverts the whole batch.
 */
export function usableBands(set: BandSet): number[] {
  return set.bands
    .filter((b) => b.open && bandReachable(set, b))
    .map((b) => b.index)
    .sort((a, b) => a - b);
}

/** `600` → `10 minutes`. Vesting copy reads worse in seconds. */
export function formatMaturity(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? "" : "s"}`;
  if (sec % 60 === 0) return `${sec / 60} minutes`;
  return `${sec} seconds`;
}

/**
 * Drop the bands this deposit would put nothing into.
 *
 * A band that receives zero mints zero shares, and `BandPool` refuses that with
 * `ZeroLiquidity()` — reverting the WHOLE deposit, not just that band. It is easy
 * to reach without doing anything unusual: a shape that leaves one band at 0%, or
 * a deposit small enough that one band's slice rounds away at the token's
 * decimals (1 USDC across three bands is fine; 0.000002 USDC is not).
 *
 * Reverting is the right answer for the contract and the wrong one for the person:
 * they asked to spread money across bands, and a band getting nothing is the same
 * deposit minus one band, not a broken deposit. So the empty bands are dropped
 * here and the rest goes through. Returning an EMPTY band list is the caller's
 * signal that there is nothing left to deposit at all.
 */
export function dropEmptyBands(
  bands: readonly number[],
  amounts: readonly (readonly bigint[])[],
): { bands: number[]; amounts: bigint[][]; dropped: number[] } {
  const zero = BigInt(0);
  const kept: number[] = [];
  const dropped: number[] = [];
  bands.forEach((band, i) => {
    if (amounts.some((row) => (row[i] ?? zero) > zero)) kept.push(i);
    else dropped.push(band);
  });
  return {
    bands: kept.map((i) => bands[i]!),
    amounts: amounts.map((row) => kept.map((i) => row[i] ?? zero)),
    dropped,
  };
}
