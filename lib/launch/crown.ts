import type { SpotToken } from "@/types";

/** Contenders listed beside the leader. */
export const CONTENDER_COUNT = 5;
/** Cards in the market-cap strip. */
export const TOP_COUNT = 4;

/**
 * Who is closest to listing, who is behind them, and what is simply biggest.
 *
 * ## The hill on this venue is the LISTING THRESHOLD
 *
 * Other launchpads race to a fixed number printed on the page. Here the number
 * is `thresholdUsd` — operator-set, per deployment, and already the thing every
 * launch card's progress bar measures against. Hardcoding a figure would state
 * a target this venue does not have, and would be wrong on the next chain.
 *
 * Null threshold therefore means NO crown, not a crown with an invented target:
 * a race with no finish line is not a race, and the section says so rather than
 * ranking by market cap and calling the leader a king.
 *
 * ## Only the unlisted can be crowned
 *
 * A token past the threshold has already won and left; leaving it in would let
 * one graduated coin hold the crown permanently while the launches it is meant
 * to celebrate never appear. `verified` is the listing gate the gateway itself
 * applies, and `graduatedAt` is the contract's own latch — either one disqualifies.
 */
export interface Crown {
  king: SpotToken | null;
  contenders: SpotToken[];
  top: SpotToken[];
}

const cap = (token: SpotToken): number => {
  const value = Number(token.marketCap);
  return Number.isFinite(value) ? value : 0;
};

const listed = (token: SpotToken): boolean =>
  token.verified === true || token.graduatedAt != null;

export function crownOf(
  tokens: readonly SpotToken[],
  thresholdUsd: number | undefined,
): Crown {
  const top = [...tokens].sort((a, b) => cap(b) - cap(a)).slice(0, TOP_COUNT);
  if (!thresholdUsd || thresholdUsd <= 0) return { king: null, contenders: [], top };

  const racing = tokens
    .filter((token) => !listed(token) && cap(token) > 0 && cap(token) < thresholdUsd)
    .sort((a, b) => cap(b) - cap(a));

  return {
    king: racing[0] ?? null,
    contenders: racing.slice(1, 1 + CONTENDER_COUNT),
    top,
  };
}

/**
 * How far along the hill, 0–100, or null when there is nothing to measure.
 *
 * Same rule as the launch card's own bar: null rather than 0, because a bar
 * pinned at zero states "this launch has raised nothing" when the truth is that
 * the target is unknown.
 */
export function crownPct(token: SpotToken, thresholdUsd: number | undefined): number | null {
  if (!thresholdUsd || thresholdUsd <= 0) return null;
  const value = cap(token);
  if (value <= 0) return null;
  return Math.max(0, Math.min(100, (value / thresholdUsd) * 100));
}

/**
 * A sparkline worth drawing, or null.
 *
 * `sparkline7D` is a real column but a young venue has one bucket in it, and a
 * single point drawn as a line is a FLAT TREND — a claim about a week that has
 * not happened yet. Two distinct values is the minimum that says anything, so
 * anything less renders as copy instead of as a chart.
 */
export function sparkPoints(token: SpotToken): number[] | null {
  const raw = (token as { sparkline7D?: unknown }).sparkline7D;
  if (!Array.isArray(raw)) return null;
  const points = raw.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (points.length < 2) return null;
  return new Set(points).size < 2 ? null : points;
}
