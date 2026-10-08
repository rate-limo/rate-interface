/**
 * What the unfilled part of a swap is worth, and the price it would rest at.
 *
 * ## The bug this exists to make impossible
 *
 * `placeRemainder` derived its limit price as `delivered / amountIn`, described
 * in a comment as "what this swap actually delivered per unit paid". That is
 * only true when the whole order filled — and this code path runs ONLY when it
 * did not. `amountIn` includes the part that could not fill, so the divisor is
 * always too big by exactly the remainder.
 *
 * Measured on a real Arc quote: 9.05713 DONUT in, 6.508932 USDC delivered,
 * 2.499012 unfilled. The market is 0.9927 and the fill price 0.9925, but
 * `delivered / amountIn` is **0.71865** — a limit sell posted 27.6% below the
 * market, which crosses the book immediately and sells the remainder at
 * whatever it hits.
 *
 * The error scales with the shortfall, so it is largest exactly where the
 * feature matters most: a thin market, where most of the order could not fill.
 *
 * ## The price shown is the price placed
 *
 * `restPrice` is derived from the PLACEMENT — `outAmount / inAmount` — which is
 * the same pair of numbers the rail renders beside the option. That is the
 * property worth having: a user agrees to a figure on screen, and the order
 * rests at that figure, because both read the same source rather than being
 * computed twice from different inputs.
 */
import type { SwapQuote } from "./types";

export interface RemainderSplit {
  /** In the PAY token: what the book cannot take right now. */
  unfilled: number;
  /** In the PAY token: what fills now. */
  filled: number;
  /** In the GET token: what the unfilled part is worth at the resting price. */
  restsTo: number;
  /** GET per PAY, the price a limit order would rest at. Zero when unknowable. */
  restPrice: number;
}

export function remainderSplit(quote: SwapQuote | null): RemainderSplit {
  const empty: RemainderSplit = { unfilled: 0, filled: 0, restsTo: 0, restPrice: 0 };
  if (!quote) return empty;

  const unfilled = quote.placements.reduce((sum, placement) => sum + placement.inAmount, 0);
  if (!(unfilled > 0)) return { ...empty, filled: quote.amountIn };

  const restsTo = quote.placements.reduce((sum, placement) => sum + placement.outAmount, 0);
  return {
    unfilled,
    filled: quote.amountIn - unfilled,
    restsTo,
    // Zero rather than a guess when the gateway priced the remainder at nothing:
    // a resting order needs a price, and `placeRemainder` refuses rather than
    // posting one this module invented.
    restPrice: restsTo > 0 ? restsTo / unfilled : 0,
  };
}

/**
 * What the wallet ENDS UP holding in the get token: filled now plus resting.
 *
 * The review screen showed `delivered` alone, which with a disposition set is
 * routinely zero — a thin market takes none of the order and the whole thing
 * rests. So it read "0 ITRA · You receive · est · $0" directly above a
 * Remainder row promising "$1 → ITRA": one trade described twice, contradicting
 * itself, on the screen where the user decides whether to sign. Nobody trades
 * in order to receive nothing.
 *
 * `restsTo` comes from the PLACEMENT, so this is the same figure the
 * disposition rail already renders rather than a second derivation of it — the
 * property `remainderSplit` exists to protect.
 *
 * With no disposition the remainder is refunded, not converted, so the answer
 * is `delivered` and nothing else.
 */
export function positionAfter(
  quote: SwapQuote | null,
  disposition: "none" | "limit" | "lp",
): { now: number; resting: number; total: number } {
  const now = quote?.delivered ?? 0;
  if (!quote || disposition === "none") return { now, resting: 0, total: now };
  const { restsTo } = remainderSplit(quote);
  return { now, resting: restsTo, total: now + restsTo };
}
