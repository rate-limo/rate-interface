"use client";

import { useCallback } from "react";
import { useAccount, useBalance } from "wagmi";
import { setFeeToken, useFeeTokenChoice } from "@/lib/wallet/feeToken";
import { wagmiConfig } from "@/lib/providers";
import { toast } from "sonner";
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
  // On a TIP-20-gas chain (Tempo) the native balance is a fixed placeholder that
  // always looks rich, so the gas check reads the fee token instead -- the one THIS
  // account chose in Tempo's FeeManager, else PathUSD.
  const choice = useFeeTokenChoice(chainId, address);
  const feeToken = choice?.current ?? null;
  const native = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) && isConnected && !feeToken },
  });
  // A failed or pending fee-token read is `unknown`, exactly like the native one.
  const isLoading = choice ? choice.currentBalance === undefined && isConnected && Boolean(address) : native.isLoading;
  const isError = choice ? false : native.isError;
  const data = choice ? { value: choice.currentBalance } : native.data;
  const alternative = choice?.alternative ?? null;

  const chainAsset = gasAssetFor(chainId);
  const asset = chainAsset && feeToken ? { ...chainAsset, symbol: feeToken.symbol } : chainAsset;

  const status = resolveGasStatus({
    isConnected,
    isLoading,
    isError,
    value: data?.value,
  });

  const requireGas = useCallback(
    (action?: () => void) => {
      if (status === "empty" && alternative && chainId !== undefined) {
        // Tempo: the current gas token is empty but another listed stablecoin is
        // funded. The protocol will not fall back on its own -- the transaction is
        // simply rejected -- so offer the switch instead of a trip to Deposit.
        // setUserToken is paid in the NEW token, so it works from here.
        const to = alternative.token;
        toast.warning(`No ${feeToken?.symbol ?? "gas token"} for network fees`, {
          id: "gas-token-switch",
          description: `You hold ${to.symbol}. Pay network fees in ${to.symbol} instead, then try again.`,
          duration: 20_000,
          action: {
            label: `Use ${to.symbol}`,
            onClick: () => {
              toast.loading(`Switching network fees to ${to.symbol}…`, { id: "gas-token-switch" });
              setFeeToken(wagmiConfig, chainId, to.address).then(
                () => toast.success(`Network fees now paid in ${to.symbol}`, { id: "gas-token-switch", duration: 6_000 }),
                (error: unknown) =>
                  toast.error("Could not change the gas token", {
                    id: "gas-token-switch",
                    description: error instanceof Error ? error.message.split("\n")[0] : undefined,
                  }),
              );
            },
          },
        });
        return false;
      }
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
    [status, chainId, alternative, feeToken],
  );

  return { status, asset, requireGas };
}
