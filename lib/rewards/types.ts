/**
 * $OG rewards domain types — the claim page seam.
 *
 * You earn POINTS each epoch (one week) from three streams — trading volume,
 * liquidity balance, and referrals — then CLAIM $OG with them at the season
 * `rate` (points per $OG). A mock supplies the data today; wire to the indexer
 * (volume/liquidity per epoch) + the distributor contract later without
 * touching the components. See apps/web/CLAUDE.md.
 */

export type EpochStatus = "claimed" | "claimable" | "accruing";

/** One weekly epoch and the points it earned, split by source. */
export interface EpochRow {
  label: string;
  volumeUsd: number;
  liquidityUsd: number;
  tradingPts: number;
  liquidityPts: number;
  referralPts: number;
  status: EpochStatus;
}

export interface ReferralSummary {
  code: string;
  referred: number;
  active: number;
  /** referral points earned (a cut of referees' points) */
  earnedPts: number;
  tier: number;
  /** boost applied to your own trading + liquidity points, e.g. 15 (%) */
  boostPct: number;
}

export interface RewardsData {
  season: number;
  epoch: number;
  epochsInSeason: number;
  /** points per $OG (season conversion rate) */
  rate: number;
  epochs: EpochRow[];
  referral: ReferralSummary;
}

/**
 * Re-exported from `./epoch`, which anchors on the backend's real
 * `GENESIS_EPOCH_START` (Monday 2026-01-05) rather than deriving "next Monday"
 * independently.
 *
 * The two agree for every instant — genesis is a Monday and epochs are one week
 * — and `epoch.test.ts` pins that equivalence. Delegating means a change to the
 * epoch length or anchor moves the countdown and the epoch number together,
 * instead of splitting a correct countdown from a stale label, which is exactly
 * what had happened.
 */
export { epochEndsAt, epochOf, epochStart, seasonOf } from "./epoch";

export function epochPoints(e: EpochRow): number {
  return e.tradingPts + e.liquidityPts + e.referralPts;
}
export function pointsToOg(points: number, rate: number): number {
  return Math.round(points / rate);
}
