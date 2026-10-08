"use client";

import { useState } from "react";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { exchangeAbi } from "@/components/abis/exchange";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { matchingEngineAddress } from "@/lib/deployments";
import { toastContractError } from "@/lib/errors/toastContractError";
import { isUserRejection } from "@/lib/wallet/externalFunding";
import { orderCloseKey } from "@/lib/toast/orderCloseAggregator";
import { cn } from "@/lib/utils";
import type { SpotOrderEvent } from "@/types";
import { buildCancelArgs } from "./orderRows";

type CancelTarget = Pick<SpotOrderEvent, "base" | "quote" | "isBid" | "orderId" | "pair">;

/**
 * Cancel one order, or several in ONE transaction (`cancelOrders` takes a list).
 *
 * The flow is the toast rules in apps/web/CLAUDE.md ("Trading feedback"):
 * a spinner while the wallet is asked, then ONE card that says "submitted" and
 * becomes "cancelled" or "failed" in place at the RECEIPT — `receipt.status`
 * decides, not the wait resolving. Every exit dismisses the spinner explicitly,
 * above the rejected/real-error split.
 *
 * The card's id is the one `useOrderHistory`'s socket handler uses for the same
 * closure (`order-close-<tx:pair:canceled>`), so when the broker's frame lands
 * it replaces this card instead of stacking a second one beside it.
 */
export function useCancelOrders() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const { displayNetworkName, displayChainId } = useMarketPageContext();
  const [pending, setPending] = useState(false);

  const cancel = async (orders: readonly CancelTarget[]): Promise<boolean> => {
    if (pending || orders.length === 0) return false;
    const engine = matchingEngineAddress(displayNetworkName);
    if (!engine) {
      toast.error("Cannot cancel here", { description: `No exchange is deployed on ${displayNetworkName}.` });
      return false;
    }
    let args;
    try {
      args = buildCancelArgs(orders);
    } catch (e) {
      toast.error("Cannot cancel this order", { description: e instanceof Error ? e.message : String(e) });
      return false;
    }

    const noun = orders.length === 1 ? "order" : `${orders.length} orders`;
    setPending(true);
    const spinnerId = toast.loading(`Confirm the cancel in your wallet`);
    let hash: `0x${string}`;
    try {
      hash = await writeContractAsync({
        address: engine,
        abi: exchangeAbi,
        functionName: "cancelOrders",
        args: [args],
        ...(displayChainId ? { chainId: displayChainId } : {}),
      });
    } catch (error) {
      toast.dismiss(spinnerId);
      setPending(false);
      if (!isUserRejection(error)) {
        toastContractError(error, `Could not cancel the ${noun}`, { chainId: displayChainId });
      }
      return false;
    }
    toast.dismiss(spinnerId);

    const id = `order-close-${orderCloseKey({ txHash: hash, pair: orders[0].pair, status: "canceled" })}`;
    toast.success(`Cancel submitted`, {
      description: "Waiting for it to confirm on chain.",
      duration: 30_000,
      id,
    });

    try {
      const receipt = await waitForTransactionReceipt(config, {
        hash,
        ...(displayChainId ? { chainId: displayChainId } : {}),
      });
      if (receipt.status !== "success") {
        toast.error(`Cancel failed on chain`, {
          description: "The transaction was mined but reverted. The order is still open.",
          duration: 6000,
          id,
        });
        return false;
      }
      toast.success(orders.length === 1 ? "Order cancelled" : `${orders.length} orders cancelled`, {
        description: "The unfilled amount is back in your balance.",
        duration: 4000,
        id,
      });
      // The broker's frames normally update both lists; this is the backstop
      // for a socket that is down, and it never races a frame (refetch only).
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orderhistories"] });
      return true;
    } catch (error) {
      toast.error("Could not confirm the cancel", {
        description:
          "The transaction was sent but its receipt could not be fetched. Check a block explorer.",
        duration: 6000,
        id,
      });
      return false;
    } finally {
      setPending(false);
    }
  };

  return { cancel, pending };
}

/**
 * A labelled Cancel button. 44px tall on phones (a fingertip target), compact
 * from 1200px where the table row is 40px and a pointer is precise.
 */
export function CancelOrderButton({
  orders,
  label = "Cancel",
  ariaLabel = "Cancel order",
  className,
}: {
  orders: readonly CancelTarget[];
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const { cancel, pending } = useCancelOrders();
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-sound="destructive"
      aria-busy={pending || undefined}
      disabled={pending || orders.length === 0}
      onClick={(e) => {
        e.stopPropagation();
        void cancel(orders);
      }}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[color:var(--m-border)] px-3 text-[12px] font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-error)] hover:text-[color:var(--m-error)] disabled:cursor-not-allowed disabled:opacity-60 min-[1200px]:min-h-[28px]",
        className,
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {pending ? "Cancelling…" : label}
    </button>
  );
}
