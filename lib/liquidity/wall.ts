/**
 * Can this deposit go in WITHOUT being converted?
 *
 * **Yes. Always, as long as the pool can price it.** That is the whole module now,
 * and the history is worth keeping because the answer used to be a table.
 *
 * The two single-sided modes:
 *
 * - **Convert now** (`mintSingleSided`) swaps half the input through the ladder on
 *   the way in, so the position is two-sided immediately and the LP pays the fee on
 *   their own conversion.
 * - **Let traders convert it** (`mint`, other side at zero) swaps nothing. The token
 *   goes straight into the band and traders convert it over time, paying the fee TO
 *   it.
 *
 * A wall is not a limit order and must never be described as one: a band is
 * `twap × (1 ± tolerance)` and re-anchors on every swap, so it follows the market
 * rather than resting at a level the LP chose.
 *
 * ## What changed, and why the old rule is gone
 *
 * `BandPool._price` used to mint `min(byBase, byQuote)` and nothing else, which
 * cannot serve one token into a band holding the other — minting pro-rata on one
 * leg hands the depositor a claim on a reserve they never funded. So a wall was
 * restricted to bands that were empty or one-sided on the depositor's side, and
 * this module was a four-row table deciding which.
 *
 * That restriction was never a law, only the absence of a second rule. `_price`
 * now prices a one-sided deposit BY VALUE against the pool's anchor when the
 * pro-rata rule mints nothing, which is fair by construction — measured in
 * `contracts/test/swap/BandOneSidedValue.t.sol`: the depositor receives what they
 * paid and the LPs already in the band are worth exactly what they were worth.
 *
 * So there is no band shape to check any more. What survives here is the ONE
 * question that is still worth asking before an approval is spent, and it belongs
 * to the other mode.
 */

/** A band's reserves as the chain reports them. `undefined` means NOT READ YET. */
export interface BandReserves {
  baseReserve?: bigint;
  quoteReserve?: bigint;
}

const zero = BigInt(0);

/**
 * Can the LADDER convert at all — the question the converting mode has to ask.
 *
 * A wall needs nothing from anyone. A CONVERSION needs a counterparty:
 * `BandPositionManager._singleSidedAmounts` swaps half the input through
 * `BandSwapRouter`, and `BandPool._walk` crosses EVERY band looking for one that
 * can pay out.
 *
 * This answers one thing exactly: **is there anywhere in the ladder to convert
 * into.** `_fillBand` returns nothing for a band whose payout reserve is empty, so
 * with none holding the token being converted into, `_walk` fills zero and
 * `BandPool.swap` reverts `NoLiquidity()` — with certainty, before anything is
 * signed.
 *
 * It deliberately does NOT predict whether the whole half will fill. That depends
 * on the spread rail, the live anchor, the gas left when the walk reaches each
 * band, and whoever else trades in the same block. Modelling it here would be a
 * second implementation of `_walk` that silently drifts from the real one — and a
 * partial fill is not a problem anyway, since the manager measures what the swap
 * actually cost and refunds the rest.
 */
export function ladderCanConvert(
  bands: readonly BandReserves[],
  bringingBase: boolean,
): boolean | null {
  // No ladder read yet is "not known", never "cannot".
  if (bands.length === 0) return null;
  // Converting base into quote is paid out of quote reserves, and vice versa.
  const payouts = bands.map((b) => (bringingBase ? b.quoteReserve : b.baseReserve));
  if (payouts.some((p) => p !== undefined && p > zero)) return true;
  if (payouts.some((p) => p === undefined)) return null;
  return false;
}
