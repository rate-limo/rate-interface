import type { RewardRow, RewardSummary } from "./types";

/**
 * A wallet's points, from admin-service's public `/points/:address`.
 *
 * The operator route `/api/point/wallet` has answered a superset of this all
 * along, but it sits behind `x-admin-key` and this app has no operator key —
 * so the Rewards tab had no source and rendered `indexerData()`.
 *
 * ## Nothing is ever "Claimable", and that is not a placeholder
 *
 * `RewardStatus` includes `Claimable`, and the panel renders a **Claim button**
 * for any row carrying it. There is no claim path anywhere in this stack — no
 * route on admin-service, no contract call in the app. Marking a row claimable
 * would offer a control that cannot do anything, which is worse than showing
 * points as still accruing.
 *
 * `claimablePts` is 0 for the same reason, and that zero is a true statement
 * rather than a missing measurement: nothing is claimable because claiming does
 * not exist yet. When it does, this is the one place that has to change.
 */

export interface PublicPoints {
  totalPoints: number;
  bySource: Record<string, number>;
  byEpoch: Array<{ epoch: number; points: number }>;
  refereeCount: number;
  attestedRefereeCount: number;
  /**
   * The published referral rates, from `tEarnConfig` via admin-service.
   *
   * Optional because an older admin-service omits the field entirely, and the
   * safe reading of "absent" is zeros rather than a guess — see
   * `toReferralSummary`. Never hardcode these on the client: the accrual reads
   * the same row, and a frontend copy drifts the moment an operator edits it.
   */
  referral?: { cutPct: number };
}

export const EMPTY_POINTS: PublicPoints = {
  totalPoints: 0,
  bySource: {},
  byEpoch: [],
  refereeCount: 0,
  attestedRefereeCount: 0,
  referral: { cutPct: 0 },
};

/**
 * Human label for a `tPoints.source` value. Unknown sources pass through.
 *
 * The cases are `PointSource` in `apps/broker/src/point/rules.ts` — the union
 * the accrual actually writes — and they were not. `bonus` and `callout` had no
 * case at all, so they fell through and rendered as raw lowercase table cells,
 * while `maker` had one for a source the broker has never emitted.
 *
 * ## Two of these are the referral programme, and they are opposite sides of it
 *
 * `referral` is the REFERRER's share of the order-book fees their referees
 * paid, as points. `bonus` is the REFEREE's own bonus, paid for having been
 * referred (both in apps/broker's point/earn.ts) — its own source precisely so it can never be
 * mistaken for trading. Labelling only the first "Referral bonus" named the
 * wrong one after the wrong side of the relationship.
 */
function sourceLabel(source: string): string {
  switch (source) {
    case "trading":
      return "Trading";
    case "liquidity":
      return "Liquidity";
    case "referral":
      return "Referral cut";
    case "bonus":
      return "Referral bonus";
    case "callout":
      return "Callout cut";
    case "rebate":
      return "Affiliate rebate";
    default:
      return source;
  }
}

/**
 * Points this wallet earned from the referral programme, both sides summed.
 *
 * Read from `bySource` — the same object the table rows come from and the same
 * `bySource.referral` field `toReferralSummary` puts on the Referrals tab, so
 * the two tabs cannot report different referral totals for one wallet.
 *
 * `bonus` and `rebate` are included because they ARE referral earnings: a
 * wallet only has either because somebody referred them — `rebate` because
 * that somebody is an approved affiliate. The Referrals tab's `earnedPts` counts the
 * referrer's cut alone, which is right there — that tab is about the people you
 * referred. This figure answers a different question ("what has the referral
 * programme paid me"), so it is a superset, not a rival.
 */
export function referralPointsOf(points: PublicPoints): number {
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return num(points?.bySource?.referral) + num(points?.bySource?.bonus) + num(points?.bySource?.rebate);
}

/**
 * `network` is null for every row.
 *
 * `tPoints` carries a `chainId`, but this route groups by source alone — the
 * panel's own spec calls points "aggregated cross-chain", and a per-chain split
 * would need the route to group by both. Null is the type's way of saying
 * cross-chain, which is what these totals are.
 */
export function toRewardRows(points: PublicPoints): RewardRow[] {
  const epoch = currentEpoch(points);
  return Object.entries(points.bySource)
    .filter(([, value]) => value !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([source, value]) => ({
      source: sourceLabel(source),
      network: null,
      earnedPts: value,
      epoch,
      // Never "Claimable" — see the note at the top of this file.
      status: "Accruing" as const,
    }));
}

export function toRewardSummary(points: PublicPoints): RewardSummary {
  const epoch = currentEpoch(points);
  const thisEpoch = points.byEpoch.find((e) => e.epoch === epoch);
  return {
    earnedPts: points.totalPoints,
    // True, not a placeholder: there is no claim path, so nothing is claimable.
    claimablePts: 0,
    epochPts: thisEpoch?.points ?? 0,
    epoch,
    referralPts: referralPointsOf(points),
  };
}

/**
 * The newest epoch this wallet has points in, or 0 for a wallet with none.
 *
 * Deliberately derived from the data rather than from the clock. `epochOf(now)`
 * would be the calendar answer, but a wallet that has not traded this week would
 * then show "This epoch · 31 — 0 pts" against rows labelled with an epoch it
 * never earned in. Reporting the epoch the figures actually describe keeps the
 * heading and the table talking about the same thing.
 */
export function currentEpoch(points: PublicPoints): number {
  return points.byEpoch.length > 0 ? points.byEpoch[0].epoch : 0;
}
