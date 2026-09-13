import Decimal from "decimal.js";

/**
 * Ceiling on how many decimal places we round derived amounts to. Token
 * `decimals` can go up to 18 (e.g. ETH), but the result is stored as a JS
 * `number`, which only carries ~15-17 significant digits safely — asking for
 * more than this just reintroduces float noise instead of real precision.
 * On-chain price itself is only ever encoded with 8 decimals (a fixed
 * protocol convention, see TradePageProvider.tsx), so 8 is also the finest
 * precision that's ever meaningful for an amount derived via price.
 *
 * Previously this rounding was a flat 4 decimals regardless of the token's
 * actual decimals, which silently rounded small, on-chain-valid amounts down
 * to 0 (dust) or drifted the derived side by >5% of the entered value on an
 * ETH(18)/USDC(6) pair. See docs/decimal-precision-and-dust-order-risks.md.
 */
export const MAX_ROUND_DECIMALS = 8;

/** Clamps a token's on-chain `decimals` to a value safe to round a JS `number` to. */
export function safeRoundDecimals(decimals: number): number {
  return Math.min(decimals, MAX_ROUND_DECIMALS);
}

/** quoteAmount / price -> baseAmount, rounded to the base token's precision. */
export function deriveBaseFromQuote(
  quoteAmount: number,
  price: number,
  roundDecimals: number = MAX_ROUND_DECIMALS,
): number {
  return Number(new Decimal(quoteAmount ?? 0).div(price).toFixed(roundDecimals));
}

/** baseAmount * price -> quoteAmount, rounded to the quote token's precision. */
export function deriveQuoteFromBase(
  baseAmount: number,
  price: number,
  roundDecimals: number = MAX_ROUND_DECIMALS,
): number {
  return Number(new Decimal(baseAmount ?? 0).mul(price).toFixed(roundDecimals));
}
