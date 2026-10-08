import { EARN_CONFIG_DEFAULTS, REFERRAL_REFERENCE_FEE_BPS, referralPointsForFee } from "@iter/types";

/**
 * The affiliate page's numbers, derived from the rule the accrual uses —
 * never typed as literals. The page shipped once saying "half" and "500 points"
 * the day the share moved to 25%; deriving them is what stops that recurring.
 */

/** Share of an invitee's taker fees, in percent. */
export const REFERRAL_SHARE_PCT = EARN_CONFIG_DEFAULTS.referralCutBps / 100;

/** What an approved affiliate's invitee gets back of their OWN taker fees, in percent. */
export const INVITEE_REBATE_PCT = EARN_CONFIG_DEFAULTS.affiliateInviteeRebateBps / 100;

/** The worked example: a $1,000 trade at the 0.1% reference fee. */
export const EXAMPLE_TRADE_USD = 1_000;
export const EXAMPLE_FEE_USD = (EXAMPLE_TRADE_USD * REFERRAL_REFERENCE_FEE_BPS) / 10_000;
export const EXAMPLE_POINTS = referralPointsForFee(EXAMPLE_FEE_USD, 1, EARN_CONFIG_DEFAULTS.referralCutBps);

/**
 * On a coin still at its 1% launch fee, how many times the invitee's own
 * trading points the referrer earns for the same trade (1 point per $1 traded).
 */
const LAUNCH_FEE_BPS = 100;
export const LAUNCH_MULTIPLE =
  referralPointsForFee((EXAMPLE_TRADE_USD * LAUNCH_FEE_BPS) / 10_000, 1, EARN_CONFIG_DEFAULTS.referralCutBps) /
  EXAMPLE_TRADE_USD;

/** How much more a launch coin pays than a 0.1% market, per dollar traded. */
export const LAUNCH_VS_REFERENCE = LAUNCH_FEE_BPS / REFERRAL_REFERENCE_FEE_BPS;
