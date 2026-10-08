import { formatUnits } from "viem";

/**
 * What a launched coin's BAND POOL holds, for the Creator tab.
 *
 * The row used to read only the coin's ORDER BOOK (`dayBaseTvl`, `dayQuoteTvlUSD`).
 * Before graduation that is the ladder's resting asks, so the numbers looked right.
 * Graduation fills the last ask and sweeps everything into the pool, so the book
 * empties and the row read "$0 seeded" over a pool holding thousands — the value
 * had moved to a place the row never looked. These are the pool's own reserves,
 * summed across bands, read from chain.
 */
export interface LaunchPoolReserves {
  /** Summed band reserves of the COIN, raw units. */
  baseRaw: bigint;
  /** Summed band reserves of the QUOTE, raw units. */
  quoteRaw: bigint;
  baseDecimals: number;
  quoteDecimals: number;
  /** USD per coin; NaN or a non-positive number when unknown. */
  baseUsd: number;
  /** USD per quote token; NaN or a non-positive number when unknown. */
  quoteUsd: number;
}

export interface LaunchPoolValue {
  poolBase: number;
  poolQuote: number;
  /** USD value of both legs; the leg whose price is unknown contributes 0. */
  valueUsd: number;
}

/** What the Creator row needs from the chain for one launched coin. */
export interface LaunchPoolRead extends LaunchPoolValue {
  /** The coin's own taker fee on the 1e8 scale, or null when it couldn't be read. */
  takerFeeNum: number | null;
}

const usd = (amount: number, price: number) => (Number.isFinite(price) && price > 0 ? amount * price : 0);

export function launchPoolValue(r: LaunchPoolReserves): LaunchPoolValue {
  const poolBase = Number(formatUnits(r.baseRaw, r.baseDecimals));
  const poolQuote = Number(formatUnits(r.quoteRaw, r.quoteDecimals));
  return { poolBase, poolQuote, valueUsd: usd(poolBase, r.baseUsd) + usd(poolQuote, r.quoteUsd) };
}

/**
 * Sums `bandReserves(i)` and puts the COIN on the base side. The pool stores its
 * own (base, quote) order, which is the coin-first order for every launch, but a
 * pool listed the other way round must not report quote as coins.
 */
export function sumBandReserves(
  bands: readonly (readonly [bigint, bigint])[],
  poolBaseIsCoin: boolean,
): { baseRaw: bigint; quoteRaw: bigint } {
  let a = BigInt(0);
  let b = BigInt(0);
  for (const [x, y] of bands) {
    a += x;
    b += y;
  }
  return poolBaseIsCoin ? { baseRaw: a, quoteRaw: b } : { baseRaw: b, quoteRaw: a };
}

/** Fee on the engine's 1e8 scale as a percentage, e.g. 1_000_000 → 1. */
export function feePct(feeNum: number): number {
  return feeNum / 1_000_000;
}
