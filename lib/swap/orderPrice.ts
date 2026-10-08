import { parseUnits } from "viem";

/**
 * The matching engine prices every order at 1e8, whatever the tokens' decimals.
 *
 * Not a convention worth re-deriving per call site: `MatchingEngine`'s `price`
 * is a fixed 1e8 fraction, and the token decimals belong to `amount` alone.
 * `TradePageProvider` and the swap card's limit form both encode it correctly;
 * `Swap/execution.ts`'s REMAINDER path did not, and used the get token's
 * decimals instead — 100× too small against a 6-decimal quote, 1e10× too large
 * against an 18-decimal one. An order priced that far from the book either
 * crosses and fills immediately or is refused, and in both cases nothing rests,
 * which is why the remainder never appeared in Open orders.
 */
export const ORDER_PRICE_DECIMALS = 8;

export function encodeOrderPrice(rate: number): bigint {
  return parseUnits(rate.toFixed(ORDER_PRICE_DECIMALS), ORDER_PRICE_DECIMALS);
}

/**
 * A GET-per-PAY rate restated as the engine's QUOTE-per-BASE.
 *
 * `remainderSplit().restPrice` is `restsTo / unfilled` — how much of the token
 * being received per token being spent. The engine wants quote per base, and
 * which of the two legs is base depends on the side:
 *
 * - **Selling** (`isBid` false): base is what is being PAID, quote is what is
 *   received, so quote-per-base is already get-per-pay. Unchanged.
 * - **Buying** (`isBid` true): base is what is being RECEIVED. Quote-per-base
 *   is pay-per-get — the RECIPROCAL.
 *
 * The remainder path passed the rate through unflipped on both sides, so every
 * resting BUY was priced at the inverse of the number the user agreed to.
 */
export function engineRate(getPerPay: number, isBid: boolean): number {
  if (!(getPerPay > 0)) return 0;
  return isBid ? 1 / getPerPay : getPerPay;
}
