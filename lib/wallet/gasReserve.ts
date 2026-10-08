/**
 * Spending an asset that also pays for the gas.
 *
 * Beside `hasDistinctNativeAsset` rather than in a feature folder, because it
 * is the same question that helper answers and both the deposit form and the
 * withdraw panel ask it — one about an ERC-20 the position manager pulls, the
 * other about a value send. A copy in each is how one of them stops matching.
 */

/**
 * Leave a sliver of the GAS asset behind when filling Max.
 *
 * A ratio rather than a gas estimate, deliberately: the page cannot know the
 * cost of a transaction it has not built yet, and the deposit is two or three
 * of them — an approval per token, then the add. Reserving a proportion is
 * honest about being approximate where a fabricated gas figure would not be.
 *
 * It bites hardest on Arc, where gas IS USDC: filling Max on the one asset that
 * pays for the transaction leaves nothing to send it with, and the revert
 * arrives after the approval has already been paid for.
 */
export const GAS_RESERVE_RATIO = 0.01;

/**
 * Does spending this token reduce the gas budget?
 *
 * The symbol alone cannot answer it. Arc's `nativeCurrency.symbol` is "USDC"
 * and RISE's is "ETH", and each chain's token list carries a row with exactly
 * that symbol — so a symbol match is true on both, while only Arc's ERC-20 is
 * really the asset that pays for the transaction. RISE's "ETH" row is the WETH
 * contract, and spending it leaves the native balance that pays for gas
 * untouched.
 *
 * The discriminator is whether the chain has a SEPARATE native row.
 * `groupTokens[chain].iter_native` exists precisely where gas is its own
 * balance, and is deliberately empty on Arc because there the gas asset and the
 * ERC-20 are one pool of funds behind two interfaces.
 */
export function spendsGas(input: {
  symbol: string;
  /** `nativeCurrency.symbol` from the registry, never a hardcoded list. */
  gasSymbol: string | undefined;
  /** True when the chain lists a distinct native row — i.e. gas is separate. */
  hasSeparateNativeRow: boolean;
  /**
   * This row IS the chain's native asset — a value send rather than an ERC-20
   * transfer. Always spends gas, on every chain.
   *
   * The withdraw panel's `native` flag answers a narrower question than this
   * one: whether the row is the SYNTHETIC native entry. On Arc that flag is
   * false for USDC — correctly, since there is no separate native row there —
   * while spending it still drains the gas budget, because on Arc the ERC-20
   * and the gas asset are one pool of funds. Reading the flag alone is how a
   * "send everything" leaves nothing to send it with.
   */
  isNativeRow?: boolean;
}): boolean {
  if (input.isNativeRow) return true;
  if (input.hasSeparateNativeRow) return false;
  return Boolean(input.gasSymbol) && input.symbol === input.gasSymbol;
}

export function maxSpendable(balance: number, isGasAsset: boolean): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  return isGasAsset ? balance * (1 - GAS_RESERVE_RATIO) : balance;
}

/**
 * The same reserve, in integer units.
 *
 * Withdrawals hold balances as bigint all the way to the wallet — the float
 * round trip that `maxDepositable` can afford on a display-precision amount is
 * not available where the figure IS the transfer. `1n` is left behind on a
 * dust balance rather than returning it in full: a "send everything" that
 * cannot pay for itself is the failure this exists to prevent, and it does not
 * stop being one because the amount is small.
 */
export function maxSpendableUnits(held: bigint, isGasAsset: boolean): bigint {
  if (held <= BigInt(0)) return BigInt(0);
  if (!isGasAsset) return held;
  const reserve = BigInt(Math.round(GAS_RESERVE_RATIO * 100));
  const kept = (held * (BigInt(100) - reserve)) / BigInt(100);
  return kept > BigInt(0) ? kept : BigInt(0);
}
