/**
 * Turning "withdraw 25%" into what `decreaseLiquidity` takes.
 *
 * v2: one token holds the whole ladder, and `decreaseLiquidity(tokenId, bps, ...)`
 * removes `bps / 10,000` of EVERY band's shares in one transaction. So the amount is a
 * fraction, not a share count: 10,000 bps is exactly all of it (`shares x 10000 / 10000`
 * leaves no dust), and nothing here needs a prior read of the holding.
 */

/** The offered fractions. */
export const PERCENTS = [25, 50, 75, 100] as const;
export type Percent = (typeof PERCENTS)[number];

/** Basis points of every band for `decreaseLiquidity`. 100% is exactly 10,000. */
export function bpsForPercent(percent: number): number {
  return Math.max(1, Math.min(10_000, Math.round(percent * 100)));
}

/** Whether a choice will close the position outright. */
export function isFullExit(percent: Percent): boolean {
  return percent === 100;
}
