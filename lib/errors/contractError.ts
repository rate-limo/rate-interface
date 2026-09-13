import {
  decodeOrderSubmitError,
  findDecodedContractError,
  type ErrorFixIntent,
} from "@/utils/orderErrors";
import { insufficientGasCopy, isInsufficientFunds, type GasTopUp } from "./insufficientGas";

/**
 * Presents a thrown wallet/RPC error as toast copy.
 *
 * ## This is a presenter, not a second decoder
 *
 * `utils/orderErrors.ts` owns the name → copy table and the cause-chain walk, and keeps
 * owning them: a second lookup beside it is how one of the two quietly stops recognising
 * an error. This module adds only what a toast needs on top — the rejection case, a
 * fallback for names the table has no entry for, and a single shape every call site can
 * hand to sonner.
 *
 * ## Why not `error.shortMessage`
 *
 * Call sites used to do `(error as { shortMessage?: string }).shortMessage ?? error.message`.
 * For a plain RPC failure that is fine. For a CUSTOM ERROR — which is what the contracts in
 * this repo revert with — viem's `shortMessage` is the generic "The contract function
 * reverted", while the part that says what actually happened sits further down the chain on
 * `ContractFunctionRevertedError.data`. The specific reason was being computed, carried all
 * the way to the browser, and dropped one field short of the user.
 *
 * Decoding still depends on the reverting error's fragment being in the ABI the call was
 * made with — viem matches a 4-byte selector, it does not guess. See the note at the top of
 * `utils/orderErrors.ts`; it governs this file too.
 */

export interface ContractErrorCopy {
  title: string;
  description?: string;
  /**
   * A way to FIX it, when one exists.
   *
   * Almost nothing here has one: a reverted order is a rule the contract enforces, and
   * there is no button that makes the rule not apply. Running out of gas is the exception
   * — it is a thirty-second errand, and the reason this field exists at all. Leave it
   * undefined rather than inventing an action, because a button that cannot help is worse
   * than no button.
   */
  action?: GasTopUp;
  /**
   * The next step, named but not performed — see `ErrorFixIntent`.
   *
   * Separate from `action` because the two resolve differently: `action` is an errand that
   * leaves the app and carries its own URL, while a fix is something the surface showing
   * the toast does to its own state. A copy never carries both.
   */
  fix?: ErrorFixIntent;
}

/** `NotMaker` + args -> `NotMaker(3, 0xabc…, 0xdef…)`, so an unmapped revert is still
 * specific. The point of the fallback is that a NEW contract error is legible the day it
 * ships, rather than reading as a generic failure until someone remembers to add copy. */
function describeUnmapped(errorName: string, args: readonly unknown[]): string {
  if (args.length === 0) return errorName;
  return `${errorName}(${args.map((a) => String(a)).join(", ")})`;
}

function isUserRejection(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 10; depth++) {
    const name = (current as { name?: unknown }).name;
    // viem throws UserRejectedRequestError; injected wallets use EIP-1193 code 4001.
    if (name === "UserRejectedRequestError") return true;
    if ((current as { code?: unknown }).code === 4001) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * @param error    whatever was thrown — viem error, Error, or anything at all
 * @param fallback title used when nothing more specific can be recovered
 * @param options  `chainId` lets the gas message name the chain's own asset — ETH on RISE,
 *                 USDC on Arc. Optional, and omitting it costs only that specificity.
 */
export function contractErrorCopy(
  error: unknown,
  fallback = "Transaction failed",
  options: { chainId?: number } = {},
): ContractErrorCopy {
  // Checked first, and worded as a decision. Someone who pressed "reject" knows what they
  // did; a red toast reading "execution reverted" tells them something broke instead.
  if (isUserRejection(error)) {
    return { title: "Request rejected", description: "You rejected the request in your wallet." };
  }

  const known = decodeOrderSubmitError(error);
  if (known) return { title: known.title, description: known.description, fix: known.fix };

  const decoded = findDecodedContractError(error);
  if (decoded) return { title: describeUnmapped(decoded.errorName, decoded.args) };

  /**
   * Checked AFTER the decoders, deliberately.
   *
   * A node rejecting for gas and a contract reverting cannot both have happened — no code
   * runs when the transaction is never accepted — so the order changes no correct outcome.
   * What it does buy is safety at the edges: a contract that reverts with its own
   * "insufficient funds" wording is decoded as the revert it is, instead of sending the
   * user to a gas faucet over a token balance.
   */
  if (isInsufficientFunds(error)) return insufficientGasCopy(options.chainId);

  if (error instanceof Error) {
    const short = (error as Error & { shortMessage?: string }).shortMessage;
    return { title: short || error.message || fallback };
  }

  return { title: fallback };
}
