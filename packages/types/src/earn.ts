/**
 * The earning rates in force when `tEarnConfig` has no saved row.
 *
 * ## Why these live here and not next to any one consumer
 *
 * They were written out three times: `DEFAULT_EARN_CONFIG` in the broker's
 * `point/rules.ts`, a fallback constant in admin-service's `points.ts`, and
 * the column defaults in `packages/db`'s `earnConfig` schema. Three copies of
 * the same five numbers, each authoritative-looking, none referencing the
 * others.
 *
 * That is not a theoretical risk. On 2026-08-09 admin-service reported a 0%
 * referral cut for a wallet while the broker was accruing at 5%, because the
 * two disagreed about what a MISSING row means — the operator panel showed one
 * number and every referrer's portfolio showed another, and nothing connected
 * them. The fix was to make the fallbacks agree; this is what stops them
 * drifting apart again.
 *
 * ## Why `@iter/types` and not `@iter/db`
 *
 * The broker's `point/rules.ts` is deliberately DB-free — its own module doc
 * says the earn rules must be testable without Postgres, so a defect there can
 * never touch I/O. Importing the schema package to read three integers would
 * undo that. `@iter/types` depends on nothing but zod and decimal.js, and both
 * the broker and admin-service already depend on it.
 *
 * ## Basis points, and the one conversion that matters
 *
 * Every rate here is in basis points, matching the columns and the on-chain
 * convention (1 bps = 0.01%, 10000 = 100%). Anything showing these to a human
 * divides by 100; `toReferralTerms` in admin-service is the only place that
 * currently does, and it is tested against these values.
 */

export interface EarnConfigDefaults {
    /** Points per USD of notional, before any market multiplier. */
    baseMultiplier: number;
    /** Per-pair override of `baseMultiplier`, keyed by pair address (lowercase). */
    marketMultipliers: Record<string, number>;
    /** Points per USD provided per day of active liquidity. */
    liquidityRatePerUsdDay: number;
    /** Referrer's share of a referee's points, in basis points. */
    referralCutBps: number;
    /**
     * Bonus added to a REFEREE's own points while they have a referrer, in basis
     * points.
     *
     * **Ships inert at 0, and that is deliberate.** Turning it on raises total T
     * minted, and whether that cost falls on $ITER or dilutes holders is a
     * decision an operator makes at season close — so it must never be switched
     * on by a default or a migration.
     */
    refereeBonusBps: number;
    /**
     * A callout author's share of the points earned by traders they attributed,
     * on THAT COIN only, in basis points.
     *
     * Separate from `referralCutBps` because the two answer different
     * questions. A referral is a permanent wallet-to-wallet relationship and
     * takes a cut of everything the referee ever earns. A callout is about one
     * coin: someone read a thesis, followed the link, and traded that coin.
     * Paying its author out of the same trader's unrelated ETH volume would
     * make the mechanic arbitrary, so the basis is scoped to the coin and the
     * rate is its own number.
     *
     * Minted on top — nothing is taken from the trader, exactly as the referral
     * cut is.
     *
     * Ships LIVE at 500, unlike `refereeBonusBps`. The two differ because the
     * referee bonus scales a wallet's own points with no counterparty and is
     * the farmable one; a callout cut requires a second wallet to generate real
     * volume and pay real fees first, which is the same reason
     * `tReferrals.socialAttested` gates the boost but not the cut.
     */
    calloutCutBps: number;
    /** Boost added per attested referee, in basis points. */
    boostBpsPerAttestedReferee: number;
    /** Ceiling on the total boost, in basis points. */
    maxBoostBps: number;
}

/**
 * The single definition. `packages/db`'s column defaults, the broker's
 * `DEFAULT_EARN_CONFIG` and admin-service's missing-row fallback all derive from
 * this object.
 *
 * Frozen because it is shared across packages and `marketMultipliers` is a
 * reference: a consumer that mutated it would change the defaults for every
 * other consumer in the process, which is exactly the kind of action-at-a-
 * distance this file exists to prevent.
 */
export const EARN_CONFIG_DEFAULTS: Readonly<EarnConfigDefaults> = Object.freeze({
    baseMultiplier: 1,
    marketMultipliers: Object.freeze({}) as Record<string, number>,
    liquidityRatePerUsdDay: 0.5,
    referralCutBps: 500,
    refereeBonusBps: 0,
    calloutCutBps: 500,
    boostBpsPerAttestedReferee: 300,
    maxBoostBps: 3_000,
});
