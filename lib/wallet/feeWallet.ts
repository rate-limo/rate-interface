/**
 * Where the withdrawal fee goes.
 *
 * `NEXT_PUBLIC_` because the split is built in the browser and the address is
 * in every batched transaction anyway — it is a destination, not a secret.
 *
 * **Unset means no fee, not a default.** `rejectWithdrawal` refuses to build a
 * split without one and `canTakeFee` reports false, so a deployment that has
 * not configured this sends withdrawals in full. The alternative — a
 * zero-address default — burns the fee, and a hardcoded one bills someone
 * else's wallet on every fork of this app.
 */
export const FEE_WALLET = process.env.NEXT_PUBLIC_FEE_WALLET?.trim() ?? "";

/** Whether a fee can be charged at all. Shape-checked, because an address typed
 * into an environment variable reaches a transfer with no further validation. */
export function feeWalletConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(FEE_WALLET);
}
