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
    /**
     * A referrer's share of the order-book TAKER FEES their referees pay, in
     * basis points — paid as points, not as a share of the referee's points.
     * Affiliates earn the same share; what sets their invitees apart is a
     * trading-fee discount applied onchain, not a different rate here.
     *
     * Fee dollars become points at the trading rate against a fixed reference
     * fee (`REFERRAL_REFERENCE_FEE_BPS`), so the programme reads as "a quarter
     * of your friends' fees" while still minting points rather than paying cash.
     * See `referralPointsForFee` for the conversion.
     *
     * History: 500 as a share of POINTS until 2026-09-26; 5000 of fees briefly;
     * 2500 of fees from 2026-09-28. Fees
     * are the right basis because they are what a referee actually pays; a cut
     * of points paid the same on a 0.1% graduated market and a 1%
     * pre-graduation coin.
     */
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
     * takes a share of every order-book fee the referee ever pays. A callout is about one
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
     * volume and pay real fees first.
     */
    calloutCutBps: number;
    /**
     * A points REBATE for a wallet whose referrer is an approved affiliate, in
     * basis points of the TAKER FEES that wallet itself paid — valued at the
     * trading rate exactly like the referral cut (`referralPointsForFee`).
     *
     * This is what an affiliate's invitees get instead of a fee discount: the
     * fee is charged in full onchain and a share comes back as points in the
     * weekly job. Minted on top, under its own ledger source ("rebate"): it
     * takes nothing from the referrer's cut, and the two are independent.
     *
     * Only order-book taker fills count, as for the cut: makers pay no fee and a
     * band-pool swap records none. An invitee of a regular (non-affiliate) or
     * revoked referrer earns no rebate; affiliate standing is read at the END of
     * each epoch.
     */
    affiliateInviteeRebateBps: number;
    /**
     * RETIRED 2026-09-26 — nothing reads it. Was a boost to a referrer's own
     * points per attested referee.
     *
     * Kept only because `tEarnConfig` still has the column, and `packages/db`
     * derives its defaults from this object. Defaults to 0 so a fresh row
     * records the truth: there is no boost. Dropping the column is a separate,
     * destructive migration nobody has needed yet.
     */
    boostBpsPerAttestedReferee: number;
    /** RETIRED with `boostBpsPerAttestedReferee`, for the same reason. */
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
    referralCutBps: 2_500,
    refereeBonusBps: 0,
    calloutCutBps: 500,
    affiliateInviteeRebateBps: 2_500,
    boostBpsPerAttestedReferee: 0,
    maxBoostBps: 0,
});

/**
 * The taker fee, in bps, that a referral's fee dollars are measured against
 * when they become points: 0.1%, the graduated-market taker fee.
 *
 * ## "The same as trading points"
 *
 * A trade earns `valueUSD × multiplier` trading points. At a 0.1% fee that trade
 * paid `0.001 × valueUSD` in fees, so one fee dollar at the reference rate is
 * worth `multiplier ÷ 0.001` points. A referrer's share of the fee converts at
 * that same rate:
 *
 *     referralPoints = feeUsd × (referralCutBps / 10_000) × multiplier ÷ 0.001
 *
 * So on a 0.1% market a 25% cut pays exactly a quarter of the referee's own
 * trading points for the trade. On a 1% pre-graduation coin the fee is ten
 * times larger and so is the cut — 2.5× the referee's own points. That is
 * intended: the
 * referrer is paid on what the referee actually paid.
 *
 * Fixed rather than read from the pair's live fee, because the point value of a
 * fee dollar must not move when an operator changes a market's fee.
 */
export const REFERRAL_REFERENCE_FEE_BPS = 10;

/** The columns of one `spotTrades` row that price its taker fee. */
export interface TakerFeeTrade {
    isBid: boolean | null;
    baseFee: number | null;
    quoteFee: number | null;
    baseAmount: number | null;
    quoteAmount: number | null;
    valueUSD: number | null;
}

/**
 * The USD value of the fee the TAKER paid on one order-book fill, or null when
 * it cannot be priced.
 *
 * On an `isBid` row the taker receives base and pays `baseFee`; on an ask they
 * receive quote and pay `quoteFee` (apps/broker's OrderMatched/Trade.ts works
 * this through from the contract; the maker is never charged). The fee is in
 * token units, so it is priced by the same leg's share of `valueUSD`, which is
 * one leg's USD value.
 *
 * Null — never 0 — for anything unpriceable: a missing or non-positive
 * `valueUSD` or leg amount, a missing fee, or a negative/NaN result. A caller
 * that needs a total must count these separately; folding them in as $0 would
 * understate what a referee paid and hide that it did.
 */
export function takerFeeUsd(t: TakerFeeTrade): number | null {
    if (t.isBid == null) return null;
    const value = t.valueUSD;
    const leg = t.isBid ? t.baseAmount : t.quoteAmount;
    const fee = t.isBid ? t.baseFee : t.quoteFee;
    if (value == null || !(value > 0)) return null;
    if (leg == null || !(leg > 0)) return null;
    if (fee == null) return null;
    const usd = (fee * value) / leg;
    return Number.isFinite(usd) && usd >= 0 ? usd : null;
}

/**
 * Whole points a referrer earns for `feeUsd` of a referee's taker fees, as a
 * float. See `REFERRAL_REFERENCE_FEE_BPS` for the formula.
 *
 * Written as `feeUsd × cutBps × multiplier ÷ REFERENCE_BPS` rather than
 * dividing by the float 0.001, which is not exactly representable and would
 * put drift into every figure.
 *
 * Non-finite or negative inputs yield 0: this runs over indexed rows, and one
 * bad row must not produce negative or NaN points.
 */
export function referralPointsForFee(feeUsd: number, multiplier: number, referralCutBps: number): number {
    const ok = (n: number) => Number.isFinite(n) && n > 0;
    if (!ok(feeUsd) || !ok(multiplier) || !ok(referralCutBps)) return 0;
    const points = (feeUsd * referralCutBps * multiplier) / REFERRAL_REFERENCE_FEE_BPS;
    return Number.isFinite(points) ? points : 0;
}
