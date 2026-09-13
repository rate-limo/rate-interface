"use client";

import { useCallback } from "react";
import { useAccount, useBalance } from "wagmi";
import { gasAssetFor, type GasAsset } from "@/lib/errors/insufficientGas";
import { goToDeposit } from "@/lib/transfer/routes";

/**
 * Whether the connected wallet can pay a network fee at all — asked BEFORE a
 * transaction rather than learned from its rejection.
 *
 * ## Why this exists next to `insufficientGas`
 *
 * That module is the cure: it reads `insufficient funds for gas` off a failed
 * send and offers a faucet or the deposit sheet. It works, and it only ever runs
 * after someone has picked a market, typed an amount, reviewed, approved and been
 * refused. This is the same answer offered one step earlier, from the same faucet
 * map and the same copy, so the two cannot disagree about what a chain's gas asset
 * is called.
 *
 * The cure stays. A balance that was sufficient a moment ago can still be spent by
 * another tab, and only the node's answer is authoritative — so this narrows the
 * window rather than closing it, and nothing here replaces the error path.
 *
 * ## Three states, and `unknown` is not `empty`
 *
 * A confirmed zero is unambiguous: nothing can be paid, and saying so costs the
 * user nothing. An RPC that is still loading or has failed tells us NOTHING, and
 * blocking a transaction on a balance we could not read would invent a state —
 * the same rule the portfolio's balances panel already follows, where a throttled
 * chain degrades rather than reporting zero. So `unknown` lets the transaction
 * proceed and, if the wallet really is empty, the existing error path catches it.
 *
 * Deliberately NOT a "low" threshold. "Low" needs a gas estimate for the specific
 * transaction, and a fixed floor is wrong on every chain at once: it would block
 * affordable transactions on a cheap L2 and pass unaffordable ones on a busy
 * chain. Zero is the only threshold that means the same thing everywhere.
 */
export type GasStatus = "unknown" | "ok" | "empty";


/**
 * The state machine, split from the wagmi call so it can be tested without a
 * chain. The distinction it encodes — an unread balance is NOT a zero — is the
 * whole reason this module is safe to put in front of a transaction.
 */
export function resolveGasStatus(input: {
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
  value: bigint | undefined;
}): GasStatus {
  if (!input.isConnected) return "unknown";
  if (input.isLoading || input.isError) return "unknown";
  if (input.value === undefined) return "unknown";
  return input.value === BigInt(0) ? "empty" : "ok";
}

export function useGasStatus(): {
  status: GasStatus;
  asset: GasAsset | null;
  /**
   * Run `action` if the fee can be paid; otherwise open the deposit sheet and
   * return false. Mirrors `useRequireWallet` so a transaction surface reads as
   * one gate after another rather than two different shapes.
   */
  requireGas: (action?: () => void) => boolean;
} {
  const { address, chainId, isConnected } = useAccount();
  const { data, isLoading, isError } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) && isConnected },
  });

  const asset = gasAssetFor(chainId);

  const status = resolveGasStatus({
    isConnected,
    isLoading,
    isError,
    value: data?.value,
  });

  const requireGas = useCallback(
    (action?: () => void) => {
      if (status === "empty") {
        // Deposit is a PAGE now, so this navigates rather than opening a sheet
        // over the action the user was mid-way through. That is the trade the
        // page makes everywhere: one surface for money in and out, at the cost
        // of leaving whatever you were doing.
        goToDeposit();
        return false;
      }
      action?.();
      return true;
    },
    [status, chainId],
  );

  return { status, asset, requireGas };
}
