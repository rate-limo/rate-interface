/**
 * Resolving which BandPool a swap goes through, and which direction.
 *
 * `BandPoolFactory.getPool(base, quote)` is order-sensitive -- its CREATE2 salt is
 * `keccak256(abi.encodePacked(base_, quote_))`, keyed on ARGUMENT POSITION, matching
 * whatever order `MatchingEngine.addPair` was originally called with. There is no
 * "give me the pool for these two tokens, either order" entry point on the factory,
 * so the only way to find it from a pay/get pair is to ask both ways and see which
 * one answers with code.
 *
 * @see ./types.ts for `SwapQuote` / `Disposition` — the caller decides whether this
 * quote is even eligible for a band-pool call (single-hop, no rest/LP remainder)
 * before reaching for this.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface BandPoolResolution {
  pool: `0x${string}`;
  /** BandPool.swap's own flag: true = paying the quote token to receive the base token. */
  quoteToBase: boolean;
}

/**
 * @param poolIfPayIsBase   result of `getPool(pay, get)`
 * @param poolIfGetIsBase   result of `getPool(get, pay)`
 *
 * Exactly one call should ever answer with a real address for a listed pair — a pair
 * is listed in one order, once. Both zero (or undefined, still loading) means either
 * there is no pool for this pair, or the reads have not resolved yet; the caller
 * cannot tell those apart from this alone and should not assume "no pool" from a
 * still-loading read.
 */
export function resolveBandPool(
  poolIfPayIsBase: `0x${string}` | undefined,
  poolIfGetIsBase: `0x${string}` | undefined,
): BandPoolResolution | null {
  if (poolIfPayIsBase && poolIfPayIsBase.toLowerCase() !== ZERO_ADDRESS) {
    // getPool(pay, get) resolved -> pay occupied the BASE argument position.
    // Paying the base token to receive the quote token is NOT quoteToBase.
    return { pool: poolIfPayIsBase, quoteToBase: false };
  }
  if (poolIfGetIsBase && poolIfGetIsBase.toLowerCase() !== ZERO_ADDRESS) {
    // getPool(get, pay) resolved -> get occupied the BASE argument position, so pay
    // is the quote token. Paying quote to receive base IS quoteToBase.
    return { pool: poolIfGetIsBase, quoteToBase: true };
  }
  return null;
}

/**
 * Whether a quote is even eligible for a single BandSwapRouter.swap call.
 *
 * Two structural mismatches between what the swap card's quote model can describe
 * and what a band pool can execute, both unconditional rather than data-dependent:
 *
 *   - Multi-hop. BandSwapRouter takes ONE pool per call; routing across several
 *     books in one atomic transaction was Router.sol's job and it no longer exists.
 *   - Any remainder disposition. A band position has no range for an LP remainder to
 *     occupy, and resting a limit order is not something a pool swap can do at all —
 *     that is a `limitBuy`/`limitSell` call, a different transaction entirely.
 *
 * Returns the reason rather than a bare boolean so the UI can say something true
 * instead of a generic "unavailable".
 */
export function bandSwapIneligibleReason(
  hopCount: number,
  disposition: "none" | "limit" | "lp",
): string | null {
  if (hopCount > 1) {
    return "This route crosses more than one market — a single band pool swap can only fill one.";
  }
  // A disposition is NO LONGER refused here, and the reason it once was still
  // holds: `BandSwapRouter.swap` has no resting mode and no partial-fill
  // placement, so one call cannot both fill and leave something behind.
  //
  // What changed is the shape of the answer, not the contract. The remainder is
  // a SECOND transaction — `limitBuy`/`limitSell` on the matching engine, or
  // `addLiquiditySingleSided` on the position manager — and the swap sends only
  // the amount the quote says can fill now (`matchedIn`). That is exactly what
  // this comment always said those dispositions would require: "a different
  // transaction entirely".
  //
  // It costs the atomicity the swap spec claimed. Two transactions can be
  // interrupted between them, so the UI has to say so rather than describe a
  // single call that no longer exists — see `SwapFlow`'s remainder step.
  return null;
}
