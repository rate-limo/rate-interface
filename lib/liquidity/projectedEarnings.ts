/**
 * What a deposit would be paid AT AN ASSUMED VOLUME.
 *
 * This is not a yield estimate and must never be rendered as one. The landing
 * page's Earn card leads with the pool's REALISED rate whenever the gateway can
 * measure it; this is what it says instead when it cannot, which on a venue with
 * no fills in the last 24 hours is most of the time.
 *
 * The distinction the UI has to keep visible: the FEE RATE is measured — 0.05%
 * of every fill, read off the gateway's own `lpFeeRate` — and the VOLUME is an
 * assumption, chosen and stated on screen. An unmeasured APY is forbidden here
 * (the brand book, and `apps/web/CLAUDE.md`'s deposit-APR rules); a sentence
 * that carries its own "at $X of volume" is a different claim, and only stays
 * one while that clause is in the visible text rather than a tooltip.
 *
 * ## The share is the interesting part
 *
 * Fees go to a band pro rata, so a deposit earns the pool's fees diluted by its
 * own size: `deposit / (poolLiquidity + deposit)`. On a venue this thin that
 * term dominates — $1,000 into a pool holding $23.89 takes 97.7% of every fee,
 * and into one holding $99.54 takes 90.9%. Dropping it would overstate the
 * answer by exactly the amount that makes it interesting.
 */

/** The volume the card assumes, and states. Not measured, not a forecast. */
export const ASSUMED_DAILY_VOLUME_USD = 10_000;

export interface ProjectedEarnings {
    /** USD of LP fees a day, at `assumedDailyVolume`. */
    usdPerDay: number;
    /** The share of the band's fees this deposit would take, 0..1. */
    share: number;
}

/**
 * @param lpFeeRate     the LP's cut of a fill, as a fraction (0.0005 = 0.05%).
 * @param poolLiquidity the quote value already in the band, diluting the deposit.
 * @returns null when any input makes the answer meaningless, so a caller cannot
 *          accidentally render a confident zero.
 */
export function projectEarnings(args: {
    depositQuote: number;
    lpFeeRate: number | null;
    poolLiquidityQuote: number | null;
    assumedDailyVolume?: number;
}): ProjectedEarnings | null {
    const { depositQuote, lpFeeRate, poolLiquidityQuote } = args;
    const volume = args.assumedDailyVolume ?? ASSUMED_DAILY_VOLUME_USD;

    if (!Number.isFinite(depositQuote) || depositQuote <= 0) return null;
    if (lpFeeRate == null || !Number.isFinite(lpFeeRate) || lpFeeRate <= 0) return null;
    if (!Number.isFinite(volume) || volume <= 0) return null;

    // A pool that reports nothing is treated as EMPTY, not as unknown: an empty
    // band is the state a launch coin is actually in, and the deposit then takes
    // the whole fee. Negative or non-finite is the broken case and is refused.
    const pool = poolLiquidityQuote == null ? 0 : poolLiquidityQuote;
    if (!Number.isFinite(pool) || pool < 0) return null;

    const share = depositQuote / (pool + depositQuote);
    return { usdPerDay: volume * lpFeeRate * share, share };
}

/**
 * `$4.88` / `$0.12` / `<$0.01` — never `$0.00`, which reads as "this pays
 * nothing" when the truth is "less than a cent at the volume we assumed".
 */
export function formatUsdPerDay(usd: number): string {
    if (!Number.isFinite(usd) || usd <= 0) return "—";
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
