import type { SwapQuote, SwapToken } from "./types";

/**
 * A zero-size quote, for the moment before a real one arrives.
 *
 * The app card used to get this by calling the MOCK engine with `amountIn: 0`.
 * That returned zeros and was honest enough, but it put `lib/swap/quote.ts` — a
 * file whose own header calls it "the illustrative model" — on the live card's
 * import graph, one edit away from supplying numbers instead of a shape. The
 * mock is now reachable only from the landing hero, which is the one surface
 * that is meant to be illustrative.
 *
 * Every field is zero or empty on purpose. This is a placeholder that keeps the
 * markup stable while `useRouteQuote` is in flight, and `quoteReady` gates
 * whether any of it is shown — so nothing here is ever presented as a quote.
 */
export function emptyQuote(pay: SwapToken, get: SwapToken): SwapQuote {
  return {
    amountIn: 0,
    payUsd: 0,
    route: [pay, get],
    hops: [],
    delivered: 0,
    deliveredUsd: 0,
    placedUsd: 0,
    placements: [],
    impactPct: 0,
    minReceived: 0,
    feeUsd: 0,
  };
}
