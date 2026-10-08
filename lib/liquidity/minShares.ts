/**
 * The guard on a single-sided deposit's conversion.
 *
 * `BandPositionManager._singleSidedAmounts` swaps half the input through the band
 * before adding, and it passes `minAmountOut = 0` to that swap ON PURPOSE — the
 * contract's own comment says `minShares` "guards this whole operation instead: a
 * sandwiched conversion yields a lopsided pair, which mints fewer shares, which
 * reverts below and unwinds the swap with it."
 *
 * So `minShares` is not optional garnish. Passing 0 ships a swap with no slippage
 * protection at all, and batching N of them behind one signature multiplies that.
 *
 * ## Why this is a PROBE and not a formula
 *
 * Two closed forms were written and both were wrong, the second only visibly so
 * against real chain state:
 *
 *   1. `half · S / reserveIn` — ignores that the conversion swaps THROUGH the band,
 *      which adds `half` to the input reserve before `_add` runs.
 *   2. `half · S / (reserveIn + half)` — fixes that, but still assumes the INPUT
 *      leg binds. `BandPool.addLiquidity` mints `min(byBase, byQuote)`, and the
 *      input leg only binds when the band's reserve ratio matches the price the
 *      conversion executes at. Measured on Arc against a band holding 1000 ITRA
 *      and 4.17 USDC, the BASE leg bound and the estimate was 217x too high:
 *      `TooFewShares(4.898e17, 1.065e20)`. A lopsided band is not an exotic case —
 *      it is what a freshly seeded one looks like.
 *
 * The contract is explicit that the split is only balanced "when the two coincide,
 * which is the healthy case", so no arithmetic over the reserves can answer this
 * for the unhealthy one. A static call CAN: it runs the real function against real
 * state and returns the shares it would mint. That is exact for every band shape,
 * needs no model of the execution price, and cannot drift from the implementation
 * because it IS the implementation.
 *
 * What it does not cover is the state moving between the probe and the transaction.
 * That is what the tolerance below is for, and it is the only thing it is for.
 */

/** The swap card's default tolerance (`lib/swap/quote.ts`), in basis points. */
export const DEPOSIT_SLIPPAGE_BPS = BigInt(50);

const BPS = BigInt(10_000);

/**
 * The floor to send, from the shares a static call said this deposit would mint.
 *
 * Returns 0 when the probe did — a band that mints nothing is refused by the pool
 * itself (`ZeroLiquidity`), so there is no floor to set and nothing to protect.
 */
export function minSharesFromProbe(
  probedShares: bigint,
  slippageBps: bigint = DEPOSIT_SLIPPAGE_BPS,
): bigint {
  if (probedShares <= BigInt(0)) return BigInt(0);
  return (probedShares * (BPS - slippageBps)) / BPS;
}

/**
 * Whether a band with no shares can take this deposit at all.
 *
 * **Always true now, and the constant is kept rather than deleted.**
 *
 * It used to be `inputIsPoolBase`, because `_price` minted `shares = baseAmount` for
 * an empty band — so bringing only the QUOTE minted nothing and the pool reverted
 * `ZeroLiquidity()` (measured on Arc: selector `0x10074548`). That branch now prices
 * the opener on whichever side was actually brought, so either token opens a band and
 * this can no longer refuse one.
 *
 * The function survives because its CALLERS are the interesting part: each is a place
 * that has to ask whether a band will take one token, and the answer for a band that
 * already holds something is still no. That question moved to
 * `lib/liquidity/wall.ts`, which reads the reserves rather than the token. Deleting
 * this would silently remove the guards instead of pointing them at the new rule.
 *
 * @deprecated Ask `bandAcceptsWall` / `wallVerdict` instead.
 */
export function canSeedEmptyBand(_inputIsPoolBase: boolean): boolean {
  return true;
}
