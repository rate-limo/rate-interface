import type { ReferralSummary } from "./types";
import type { PublicPoints } from "./rewards";

/**
 * The Referrals tab's SUMMARY, from data the wallet owns about itself.
 *
 * Everything here is the user's own: their code, their referee counts, their
 * referral points, and the published earning rates. Nothing about who those
 * referees are.
 *
 * **The row table stays on the mock, and that is a decision rather than a
 * gap.** `ReferralRow` wants each referee's address, volume and points — a
 * route listing other people's wallets and activity. `/points/:address`
 * deliberately withholds the referral graph for exactly that reason, and
 * `theirVolumeUsd` has no source in any case. Publishing it is a product and
 * privacy call, not a wiring one.
 */

export interface ReferralCode {
  code: string | null;
}

/**
 * `link` is built here rather than returned by the service: admin-service does
 * not know which origin the user is on, and a link minted against the wrong one
 * is worse than no link. `origin` is passed in so this stays pure and testable —
 * `window` is not available where the tests run.
 */
export function toReferralSummary(
  points: PublicPoints,
  code: string | null,
  origin: string,
): ReferralSummary {
  // Every field is read defensively. This runs on a fetched payload, and a
  // portfolio tab must not be able to throw over a shape it did not expect —
  // the same rule the pair profile's legs follow. An older admin-service omits
  // `referral` entirely, and a failed read can hand back anything at all.
  const terms = points?.referral;
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return {
    code: code ?? "",
    // No code yet means no link, not a link to `/r/` that resolves to nobody.
    link: code ? `${origin.replace(/\/$/, "")}/r/${code}` : "",
    referred: num(points?.refereeCount),
    active: num(points?.attestedRefereeCount),
    earnedPts: num(points?.bySource?.referral),
    // Zeros, not the schema defaults: a wallet shown "5%" it is not earning is
    // worse than one shown 0% while the terms are genuinely unknown.
    cutPct: num(terms?.cutPct),
    boostPct: num(terms?.boostPct),
    maxBoostPct: num(terms?.maxBoostPct),
  };
}
