"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { reportTransfer, type ReportedTransfer } from "@/lib/transfer/report";

/**
 * Watch a submitted transfer to its receipt, then record it.
 *
 * ## Why the report cannot happen at broadcast
 *
 * `identity-service` verifies a reported transfer by READING ITS RECEIPT. A
 * transaction that has only just been broadcast has none, so the report was
 * answering 404 and writing nothing — the deposit happened, and the server
 * record it was supposed to produce never existed. The local row was written
 * either way, which is precisely what made it invisible: the list looked right
 * on the machine that sent it and was empty everywhere else.
 *
 * ## And why the UI cannot either
 *
 * `apps/web/CLAUDE.md` already states the rule for the trading surfaces:
 * success is declared at the RECEIPT, never at broadcast. The deposit path
 * announced "Sending…" and then said nothing again, so a user watching for
 * their funds had no way to tell a mined transfer from one still pending or one
 * that reverted.
 *
 * A reverted transaction HAS a receipt, so `isSuccess` on the wait is not the
 * question — only `receipt.status` separates the two outcomes.
 *
 * There is no timeout. A transfer that is slow to mine is still going to mine,
 * and a client that stops watching something it has already broadcast is the
 * failure this repo has recorded before: the user sees no confirmation, assumes
 * it failed, and sends again.
 */
export type TransferStatus = "idle" | "confirming" | "confirmed" | "reverted";

export interface WatchedTransfer extends ReportedTransfer {}

/**
 * What the receipt said, for the result screen.
 *
 * Already fetched and previously discarded. A receipt with no block and no fee
 * is a claim rather than a receipt — and on Arc the fee matters more than
 * usual, because gas IS the asset being withdrawn, so 1 USDC out costs slightly
 * more than 1 USDC of balance and the arithmetic only closes if we say so.
 *
 * `feeWei` is in the chain's NATIVE decimals, which is not the asset's: on Arc
 * that is 18 against the USDC contract's 6. Format it with
 * `nativeCurrency.decimals`, never the token's. On Tempo there is no native coin:
 * the fee is 1e-18 dollars of the TIP-20 in `feeToken`, which Tempo's receipts
 * carry (read back on Moderato 2026-10-08). Format with `feeUnits`.
 */
export interface TransferReceipt {
  blockNumber: bigint;
  feeWei: bigint;
  /** Tempo only: the TIP-20 the fee was charged in. */
  feeToken?: string;
}

export function useTransferConfirmation() {
  const [watched, setWatched] = useState<WatchedTransfer | null>(null);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [receipt, setReceipt] = useState<TransferReceipt | null>(null);
  const client = usePublicClient({ chainId: watched?.chainId });

  useEffect(() => {
    if (!watched || !client) return;
    let live = true;
    setStatus("confirming");
    setReceipt(null);

    void client
      .waitForTransactionReceipt({ hash: watched.hash as `0x${string}` })
      .then((receipt) => {
        if (!live) return;
        // Kept for BOTH outcomes: a reverted transfer still mined in a block and
        // still charged a fee, and hiding that makes the balance look wrong.
        setReceipt({
          blockNumber: receipt.blockNumber,
          feeWei: receipt.gasUsed * receipt.effectiveGasPrice,
          // viem passes unknown receipt fields through; only Tempo sends this one.
          feeToken: (receipt as { feeToken?: string }).feeToken,
        });
        if (receipt.status !== "success") {
          setStatus("reverted");
          return;
        }
        setStatus("confirmed");
        // Only now: the receipt the service will read exists, so the report can
        // be verified rather than refused.
        // `reportTransfer` writes the local row, which notifies the transfer
        // store — and `TransferHistory` refetches the SERVER list off that same
        // notification. Deliberately NOT `useQueryClient` here: this hook is
        // used by a leaf panel, and a provider requirement on it would let a
        // deposit form take down whatever mounts it. Same rule `useChainBrand`
        // records, and the same mistake `toastContractError` made once already.
        reportTransfer(watched);
      })
      .catch(() => {
        // Dropped, replaced, or an RPC that would not answer. The transfer may
        // still land, so this does not claim it failed — it stops watching and
        // leaves the row to the claim form, which reads the chain directly.
        if (live) setStatus("idle");
      });

    return () => {
      live = false;
    };
  }, [watched, client]);

  const watch = useCallback((transfer: WatchedTransfer) => setWatched(transfer), []);
  const reset = useCallback(() => {
    setWatched(null);
    setStatus("idle");
    setReceipt(null);
  }, []);

  return { status, transfer: watched, receipt, watch, reset };
}
