"use client";

import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";

/**
 * Building the call list for an EIP-7702 batch.
 *
 * Pure: it encodes calls and returns them. Signing the authorization and
 * broadcasting belong to the caller, because those need a live account and this
 * needs to be testable without one.
 *
 * ## Why a batch at all
 *
 * Several transfers that must land together. As separate transactions there is
 * a window where the first lands and a later one reverts. Under EIP-7702 the
 * account delegates to `BatchExecutor` and all land or none do.
 *
 * Withdrawals no longer use it: the interface takes no withdrawal fee (removed
 * 2026-10-02), so a withdrawal is one plain transfer of the full amount.
 *
 * ## The native/ERC-20 distinction is the whole shape
 *
 * A native leg is `{to: recipient, value: amount, data: "0x"}` — the value moves
 * with the call.
 *
 * An ERC-20 leg is `{to: TOKEN, value: 0, data: transfer(recipient, amount)}` —
 * the recipient is inside the calldata, and `to` is the token. Getting these the
 * wrong way round sends native value to a token contract, which most tokens
 * accept and none refund.
 *
 * **No approval is involved in either.** The account itself is the caller under
 * 7702, so an ERC-20 leg moves its own balance. That is the property that chose
 * this design over a splitter contract, which would need one.
 */

/** One leg of a batch, matching `BatchExecutor.Call`. */
export interface BatchCall {
  to: Address;
  value: bigint;
  data: Hex;
}

/** A recipient and what they receive. Amounts are base units, never decimals. */
export interface Payment {
  to: Address;
  amount: bigint;
}

export class BatchTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchTransferError";
  }
}

/**
 * Build the calls for paying several recipients, in one asset.
 *
 * `token` omitted (or undefined) means the chain's NATIVE asset. Note that on
 * Arc the native asset IS USDC — the same money as the ERC-20 at
 * `0x3600…0000` through a different interface, at 18 decimals rather than 6. So
 * a caller must not build both a native leg and an ERC-20 leg for "the same"
 * USDC and expect them to be independent; they draw on one balance and the
 * amounts are not in the same units. See `lib/customChains.ts`.
 */
export function buildTransferBatch(payments: readonly Payment[], token?: Address): BatchCall[] {
  if (payments.length === 0) {
    // An empty batch reverts on chain (`EmptyBatch`). Failing here instead
    // gives the caller a message rather than a decoded revert, and costs no gas.
    throw new BatchTransferError("A batch needs at least one payment.");
  }

  for (const payment of payments) {
    if (payment.amount <= BigInt(0)) {
      // A zero leg costs gas to move nothing, and usually means the caller
      // built it from an amount it never checked.
      throw new BatchTransferError(`Payment to ${payment.to} is not greater than zero.`);
    }
  }

  return payments.map(({ to, amount }) =>
    token
      ? {
          // The call goes to the TOKEN; the recipient rides in the calldata.
          to: token,
          value: BigInt(0),
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
        }
      : { to, value: amount, data: "0x" as Hex },
  );
}

/**
 * Total native value a batch will move.
 *
 * The caller needs this to check the account can cover the batch AND its gas.
 * A native "max" withdrawal that spends the whole balance leaves nothing to pay
 * with, and under 7702 one transaction pays for every leg — so the reserve has
 * to cover the batch rather than a single send. `InsufficientGasError` in
 * `sendContract.ts` is the existing way to say so.
 *
 * Zero for an ERC-20 batch, where every leg carries `value: 0`.
 */
export function batchNativeValue(calls: readonly BatchCall[]): bigint {
  return calls.reduce((total, call) => total + call.value, BigInt(0));
}
