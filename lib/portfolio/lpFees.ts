
/**
 * What a band LP position has EARNED, priced in USD.
 *
 * ## Why this is two numbers added together
 *
 * "Fees earned" is a lifetime figure, and no single source holds it.
 *
 *  - `bandPositions.feesUSD` (broker, via `/api/account/:address/lp-positions`)
 *    is fees **claimed**. `processBandFeesClaimed` only runs on
 *    `BandFeesClaimed`, so a position that has accrued fees and never collected
 *    them reads 0 — which is every position on Arc today.
 *  - `BandPositionManager.portfolio(tokenIds)` reports `vestedBase`/
 *    `vestedQuote`, which is what is **owed right now** and has not been taken.
 *
 * Reporting only the first renders `$0.00` on a position that has earned money.
 * Reporting only the second makes the column go DOWN when someone claims, which
 * is the same bug pointing the other way. The sum is the honest lifetime total.
 *
 * ## Why the sum does not double-count
 *
 * `BandPool.collect` advances `p.feeGrowthLastBase`/`Quote` to the band's
 * current growth before it returns, so `PoolFeeMath.rawEntitlement` — and
 * therefore the next `portfolio()` read — is zero for everything just paid out.
 * Claimed and vested are disjoint by construction, verified in
 * `contracts/src/swap/BandPool.sol` at `collect`.
 *
 * ## What is deliberately NOT counted
 *
 * `forfeitBase`/`forfeitQuote` — the portion the maturity ramp takes back as the
 * JIT defence. It is redistributed to the rest of the band or sent to `feeTo`,
 * and never reaches this LP, so crediting it would report income nobody
 * received. Same rule `processBandFeesClaimed` states.
 */

/** Fees owed to a position right now, straight off `portfolio(tokenIds)`. */
export interface VestedFees {
  vestedBase: bigint;
  vestedQuote: bigint;
}

/**
 * Price a vested pair into USD, or null when it cannot be priced.
 *
 * `poolPrice` is quote-per-base (the `price` the gateway already ships on every
 * band position) and `quotePriceUsd` is USD-per-quote. Going through the pool's
 * own price rather than looking up the base token's USD price keeps this to ONE
 * price read per distinct quote token — in practice one, because every band
 * pool Rate opens is quoted in USDC.
 *
 * **Null is "not priceable", never 0.** An unpriced quote token, or a base leg
 * with no pool price, means the answer is unknown; `0` would assert the position
 * earned nothing. The same distinction `aprPct` draws.
 */
export function vestedFeesUsd(
  fees: VestedFees,
  baseDecimals: number,
  quoteDecimals: number,
  poolPrice: number | null,
  quotePriceUsd: number | null,
): number | null {
  if (quotePriceUsd === null || !Number.isFinite(quotePriceUsd)) return null;

  // Decimals are per token and never assumed — USDC is 6, the launched base is
  // 18, and dividing both by 1e18 silently loses twelve orders of magnitude on
  // the quote leg.
  const quoteUnits = scaled(fees.vestedQuote, quoteDecimals);
  if (quoteUnits === null) return null;

  // A zero base leg needs no price. Requiring one would turn "earned only quote
  // fees" — the common shape for a one-sided band — into an em-dash.
  let baseUsd = 0;
  // `BigInt(0)`, not `0n`: apps/web compiles at `target: ES2017` and bigint
  // literals need ES2020 — the convention `lib/orders/fillProgress.ts` follows
  // at length and `lib/orders/fillProgress.ts` already follows.
  if (fees.vestedBase !== BigInt(0)) {
    if (poolPrice === null || !Number.isFinite(poolPrice) || poolPrice <= 0) return null;
    const baseUnits = scaled(fees.vestedBase, baseDecimals);
    if (baseUnits === null) return null;
    baseUsd = baseUnits * poolPrice * quotePriceUsd;
  }

  return baseUsd + quoteUnits * quotePriceUsd;
}

/** Sum the two halves, keeping "unpriceable" distinct from "nothing yet". */
export function lifetimeFeesUsd(
  claimedUsd: number | null,
  vestedUsd: number | null,
): number | null {
  if (vestedUsd === null) return claimedUsd === null ? null : claimedUsd;
  if (claimedUsd === null) return vestedUsd;
  return claimedUsd + vestedUsd;
}

/**
 * The cell.
 *
 * `toFixed(2)` alone is why this helper exists. A band earning a few thousandths
 * of a cent a day is the NORMAL state of a young pool — measured on Arc, pool
 * `0xce74…5981` turns over ~$7 a day at a 5bp LP fee — and rounding that to
 * `+$0.00` is indistinguishable from the bug this whole change fixes. A reader
 * has to be able to tell "too small to print" from "nothing".
 */
export function formatFeesUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  // Round the way the formatter below will, so the threshold cannot disagree
  // with the digits actually rendered.
  const rounded = Math.round(usd * 100) / 100;
  if (rounded === 0) return usd > 0 ? "<$0.01" : "$0.00";
  return `+$${rounded.toFixed(2)}`;
}

/**
 * A raw token amount as a float, or null if the decimals are unusable.
 *
 * `Number(bigint)` past 2^53 loses low digits, which for a DISPLAY figure
 * denominated in dollars is below the cent this rounds to. The exact integer
 * stays available on the chain read for anything that needs it.
 */
function scaled(raw: bigint, decimals: number): number | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  return Number(raw) / 10 ** decimals;
}
