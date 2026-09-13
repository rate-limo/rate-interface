"use client";

import { useWalletConnect } from "@/lib/wallet";
import { useGasStatus } from "@/lib/wallet/gasStatus";
import { useTradePageContext } from "@/contexts/TradePageProvider";
import {
  useSimulateContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { networkNameToSlug } from "@/consts";
import { eventBus } from "@/utils/events";
import { decodeOrderSubmitError } from "@/utils/orderErrors";
import { FIX_LABELS, toastContractError } from "@/lib/errors/toastContractError";
import type { ErrorFixIntent } from "@/utils/orderErrors";
import { bufferedGasFor } from "@/lib/tx/gasBuffer";
import { gasLevelsFor } from "@/lib/tx/bookGas";
import { needsNetworkSwitch } from "@/utils/networkGuard";
import type { SpotToken } from "@/types";

interface PlaceOrderButtonProps {
  className?: string;
  isConnectedInput: boolean;
}

/**
 * A broadcast transaction we are still waiting on a receipt for.
 *
 * Recorded at BROADCAST and settled at CONFIRMATION -- everything a click knows
 * (which write it was, which token to decrement, by how much) is captured here,
 * because by the time the receipt lands the click's scope is long gone.
 *
 * Carries its own `hash` because approvals and orders share one
 * `useWriteContract`: without matching on it, the approval's receipt would
 * announce "order confirmed".
 */
type PendingTx = {
  hash: `0x${string}`;
  kind: "approval" | "limit" | "market";
  token: SpotToken;
  /** Balance to publish once the order is known to have landed. */
  balance?: number;
};

export default function PlaceOrderButton({
  className = "",
  isConnectedInput,
}: PlaceOrderButtonProps) {
  /*
   * `open` as well as `fund`, and the missing one was not a type error.
   *
   * `handleClick` has always called `open()` when nobody is connected, but only
   * `fund` was destructured here — so `open` resolved to the BROWSER GLOBAL,
   * `window.open`. Calling that with no arguments opens `about:blank`, which a
   * popup blocker eats silently, and the wallet was never asked for. Pro's
   * "Connect wallet" button therefore did nothing but throw, on every click,
   * while every other surface (SwapCard, ActionDock) worked — because those
   * destructure it.
   *
   * TypeScript could not catch it: `open` is declared on `Window` in lib.dom,
   * so the call typechecks as a perfectly ordinary popup.
   */
  const { open, fund } = useWalletConnect();
  const { requireGas } = useGasStatus();
  const { switchChain } = useSwitchChain();

  const {
    displayNetworkName,
    displayChainId,
    connectedNetworkName,
    connectedChainId,
    switchToConnectedNetwork,
    router,
  } = useMarketPageContext();

  const {
    pair,
    isConnected,
    quoteAmount,
    baseAmount,
    isBid,
    isLimit,
    limitOrderContractArgs,
    marketOrderContractArgs,
    approvalContractArgs,
    trueQuoteBalance,
    trueBaseBalance,
    approvalNeeded,
    setApprovalNeeded,
    limitPriceEncodesToZero,
    orderAmountIsDust,
    // The order's own `n` — the ceiling on how many levels the engine may cross.
    matchN,
    // The book we can currently see, and the price this order would cross it at.
    // Together they say how many levels this order ACTUALLY hits, which is what the
    // gas limit is sized from now that undershooting is a partial fill rather than
    // a lost order.
    orderbook,
    limitPrice,
    // Only used by the toast fixes below. The panel owns these controls, so the
    // toast can offer to operate them instead of describing them in prose the
    // user then has to translate back into which field to touch.
    setIsLimit,
    setLimitPrice,
  } = useTradePageContext();
  const { data: limitOrderData, error: limitOrderError } = useSimulateContract(
    limitOrderContractArgs
  );
  const { data: marketOrderData, error: marketOrderError } =
    useSimulateContract(marketOrderContractArgs);
  const { data: approvalData, error: approvalError } =
    useSimulateContract(approvalContractArgs);

  /**
   * What this panel can do about a failed submit.
   *
   * `switch-to-limit` answers the market order that had nothing to cross: an empty book
   * has no price, and a limit order is what puts the first one there — so the fix is
   * literally the toggle above the form.
   *
   * `use-market-price` answers every price the book refused — zero after rounding, or too
   * far from the current price to be accepted — by writing the last traded price into the
   * field. Guarded on the pair actually having one: a market with no price yet cannot
   * offer this, and a button that writes `0` would re-raise the same error.
   */
  const toastFixes = {
    "switch-to-limit": () => setIsLimit(true),
    ...(pair?.price
      ? {
          "use-market-price": () => {
            setIsLimit(true);
            setLimitPrice(Number(pair.price));
          },
        }
      : {}),
  };

  const { data: hash, writeContractAsync } = useWriteContract();
  // For the gas buffer below. An order's cost depends on what it MATCHES, and
  // the book can gain depth between the estimate and the block that includes
  // the order — see lib/tx/gasBuffer.
  const publicClient = usePublicClient();
  const {
    data: receipt,
    isError: isTxError,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash,
    // Bounded on purpose. Everything below waits on this hook to settle -- the
    // toast, and the button lock that stops a second broadcast -- and its default
    // is to wait forever, so a dropped or replaced transaction would leave both
    // stuck with no way out. On timeout `isTxError` fires, the toast says the
    // receipt could not be fetched, and the button unlocks.
    timeout: 120_000,
  });

  const [pendingTx, setPendingTx] = useState<PendingTx | null>(null);
  const [buttonContent, setButtonContent] = useState<React.ReactNode>(null);
  const isLoggedIn = isConnected;

  // Report what the chain actually did.
  //
  // A wallet accepting a transaction says nothing about whether it succeeded --
  // the app used to toast "successfully submitted to blockchain" from the write's
  // onSuccess and decrement the balance there, so an order that mined and
  // REVERTED was reported as a success and left a wrong balance on screen.
  //
  // Note `isSuccess` on useWaitForTransactionReceipt is not the answer either: it
  // means the receipt was fetched, and a reverted transaction has a receipt too.
  // The only signal that separates them is `receipt.status`.
  useEffect(() => {
    if (!pendingTx) return;

    // The wait itself failed (dropped, replaced, timed out) -- no receipt exists.
    if (isTxError && hash === pendingTx.hash) {
      setPendingTx(null);
      toast.error("Could not confirm the transaction", {
        description:
          txError?.message ??
          "The transaction was sent but its receipt could not be fetched. Check your wallet or a block explorer.",
        duration: 4000,
        id: `order-tx-${pendingTx.hash}`,
      });
      return;
    }

    if (!receipt || receipt.transactionHash !== pendingTx.hash) return;

    // Cleared first: the effect re-runs for as long as this receipt is the
    // current one (and twice per commit under StrictMode), and the toast `id`
    // below collapses any re-fire that still slips through.
    const settled = pendingTx;
    setPendingTx(null);

    const label =
      settled.kind === "approval"
        ? "Approval"
        : settled.kind === "limit"
        ? "Limit order"
        : "Market order";

    if (receipt.status !== "success") {
      toast.error(`${label} failed on chain`, {
        description:
          "The transaction was mined but reverted. Nothing was spent beyond the network fee.",
        duration: 4000,
        id: `order-tx-${settled.hash}`,
      });
      return;
    }

    if (settled.kind === "approval") {
      toast.success("Approval confirmed", {
        duration: 3000,
        id: `order-tx-${settled.hash}`,
      });
      eventBus.emit("spot-allowance-update", {
        token: settled.token,
        allowance: 10000000000000000000000000000000000000,
      });
      setApprovalNeeded(false);
      return;
    }

    toast.success(`${label} confirmed`, {
      description: "Fills will appear as the exchange matches it.",
      duration: 4000,
      id: `order-tx-${settled.hash}`,
    });
    // Moved here from the write's onSuccess: this is the first moment the spend
    // is known to have happened. It is still ahead of the indexer, not ahead of
    // the chain.
    if (settled.balance !== undefined) {
      eventBus.emit("spot-balance-update", {
        token: settled.token,
        balance: settled.balance,
      });
    }
  }, [receipt, isTxError, txError, hash, pendingTx, setApprovalNeeded]);

  // Simulated (pre-submit) result for whichever order type is currently active.
  // useSimulateContract already runs this against the RPC on every arg change --
  // surfacing it here means known reverts (esp. OrderSizeTooSmall, which can
  // fire on a NONZERO amount and isn't caught by the client-side dust checks
  // above) are shown before the user ever clicks submit, instead of only after
  // a failed transaction. See docs/contract/decimal-precision-risks.md.
  //
  // Gated on the user having actually entered a nonzero amount for this side:
  // on initial load (amount still 0) the simulate call reverts AmountIsZero
  // too, which would otherwise show a disabled "too small" button before the
  // user has typed anything -- a regression from the prior default state.
  const hasEnteredAmount = (isBid ? quoteAmount : baseAmount) > 0;
  const simulatedOrderError = useMemo(
    () =>
      hasEnteredAmount
        ? decodeOrderSubmitError(isLimit ? limitOrderError : marketOrderError)
        : null,
    [hasEnteredAmount, isLimit, limitOrderError, marketOrderError]
  );

  /**
   * A client-side refusal, raised with the same fix button a decoded revert would get.
   *
   * These checks exist to catch a bad order BEFORE it costs a signature, so they are the
   * toasts most worth making actionable — and they were the ones with no next step at all
   * beyond a sentence telling the user to go and change a number.
   */
  const toastFix = (title: string, description: string, fix?: ErrorFixIntent) => {
    const handler = fix ? toastFixes[fix as keyof typeof toastFixes] : undefined;
    toast.error(title, {
      description,
      ...(handler ? { action: { label: FIX_LABELS[fix as ErrorFixIntent], onClick: handler } } : {}),
      ...(handler ? { duration: 8000 } : {}),
    });
  };

  const handleClick = async () => {
    if (!isConnected) {
      open();
      return;
    }
    // Nothing to pay the fee with, so ask for a deposit instead of broadcasting a
    // send the node will refuse. `insufficientGas` still handles the rejection —
    // a balance can be spent by another tab between this read and the send, and
    // only the node's answer is authoritative. This narrows the window; it does
    // not replace the cure. A balance we could not READ is not a zero, so an
    // unresolved read falls through and the error path catches it.
    if (!requireGas()) return;
    // The button already renders as disabled while a transaction is in flight;
    // this is the guard for anything that reaches the handler another way. A
    // second broadcast would overwrite `pendingTx` and orphan the first receipt.
    if (pendingTx) return;
    if (limitPriceEncodesToZero) {
      toastFix(
        "Price is too small to submit",
        "This price rounds to zero at the on-chain precision. Increase the price to submit this order.",
        "use-market-price",
      );
      return;
    }
    if (orderAmountIsDust) {
      // Deliberately no fix button: the minimum that WOULD work depends on the pair's
      // on-chain precision and is not a number this panel can compute, so any value it
      // wrote into the field would be a guess that re-raises the same error.
      toastFix(
        "Order amount is too small to submit",
        "The derived amount for this order rounds to zero. Increase the size to submit this order.",
      );
      return;
    }
    if (simulatedOrderError) {
      // Simulation catches these BEFORE a wallet is touched, which makes it the
      // best place to offer the fix — the same intent the submit-time toast
      // would carry, minus a signature the user never had to spend.
      toastFix(simulatedOrderError.title, simulatedOrderError.description, simulatedOrderError.fix);
      return;
    }
    if (approvalNeeded && approvalContractArgs.address) {
      // No `duration` here: sonner skips its auto-dismiss timer for ANY toast of
      // type `loading` whatever duration is passed (see the early return on
      // `toast.type === 'loading'` in its timer effect). The 5,000 ms this used to
      // carry did nothing, and reading it as a safety net is what let the error
      // path leave the spinner up forever. An explicit dismiss is the only thing
      // that clears one -- which is why every exit below performs one.
      const spinnerId = toast.loading("Awaiting approval");
      try {
        await writeContractAsync(
          { ...approvalContractArgs, address: approvalContractArgs.address },
          {
            onSuccess: (data) => {
              toast.dismiss(spinnerId);
              // Same id as the terminal toast in the receipt effect, so this one
              // is UPDATED in place into "confirmed" or "failed" rather than
              // stacking a second card. Long-lived, not `Infinity`: it has to
              // outlast a slow block (otherwise there is silence between
              // broadcast and confirmation), but an unbounded toast is the exact
              // failure being fixed here, so it still expires on its own if a
              // receipt never arrives.
              toast.success("Approval submitted", {
                description: "Waiting for it to confirm on chain.",
                duration: 30000,
                id: `order-tx-${data}`,
              });
              // `setApprovalNeeded(false)` and the allowance event moved to the
              // receipt: flipping the button to "Buy" at broadcast let the next
              // click submit an order against an allowance that did not exist yet.
              setPendingTx({
                hash: data,
                kind: "approval",
                token: isBid ? pair.quote : pair.base,
              });
            },
            onError: (error) => {
              // Above the rejected/real-error split, so BOTH exits clear it.
              toast.dismiss(spinnerId);
              if (!error.message.includes("User rejected the request")) {
                // The exchange DECODER still cannot help here — this call is made
                // with the ERC-20 ABI, so no exchange selector is decodable and it
                // could only ever return null. The presenter can: an approval is a
                // transaction like any other, and the most common way for one to
                // fail on a fresh passkey account is having no gas to send it with.
                // That used to print viem's own 735-character prose into a 3-second
                // toast; now it names the chain's gas asset and offers the errand.
                toastContractError(error, "Error approving", {
                  chainId: displayChainId,
                  duration: 3000,
                });
              }
            },
          }
        );
      } catch (error) {
        // writeContractAsync rejects with the same error onError already
        // reported; the dismiss there covers this path too.
      }
      return;
    }
    // Captured at click time, spent at confirmation.
    const spendToken = isBid ? pair.quote : pair.base;
    const balanceAfterSpend = isBid
      ? trueQuoteBalance - quoteAmount
      : trueBaseBalance - baseAmount;

    if (isLimit && limitOrderContractArgs.address) {
      // Declared BEFORE the write it accompanies. It used to sit after the call
      // and worked only because the callbacks are async -- a `const` read from
      // inside a closure before its own declaration is executed.
      const spinnerId = toast.loading("Awaiting limit order");
      try {
        // Sized from the book rather than from `matchN`. Paying for twenty levels
        // on an order that crosses two showed ~1.8M in the wallet against ~370k
        // spent; the reserve on chain is what makes the smaller, honest number
        // safe, because falling short now rests the remainder instead of
        // reverting. `gasLevelsFor` still caps at `matchN` — the engine cannot
        // cross more than that however deep the book is.
        const limitGas = await bufferedGasFor(
          publicClient,
          limitOrderContractArgs,
          gasLevelsFor(orderbook, isBid, limitPrice, matchN),
        );
        await writeContractAsync(
          {
            ...limitOrderContractArgs,
            address: limitOrderContractArgs.address,
            // Omitted entirely when it could not be estimated, so wagmi falls
            // back to its own estimate rather than this being able to block a
            // write. Unused gas is refunded.
            ...(limitGas ? { gas: limitGas } : {}),
          },
          {
            onSuccess: (data) => {
              toast.dismiss(spinnerId);
              // See the approval branch: same id as the terminal toast, so this
              // card becomes "confirmed"/"failed" in place and there is no
              // silent gap while the block is mined.
              toast.success("Limit order submitted", {
                description: "Waiting for it to confirm on chain.",
                duration: 30000,
                id: `order-tx-${data}`,
              });
              setPendingTx({
                hash: data,
                kind: "limit",
                token: spendToken,
                balance: balanceAfterSpend,
              });
            },
            onError: (error) => {
              toast.dismiss(spinnerId);
              if (!error.message.includes("User rejected the request")) {
                // `contractErrorCopy` runs the same `decodeOrderSubmitError` first,
                // so a decoded revert still wins; what it adds is the case the
                // decoder can never see — a node refusing the transaction for gas,
                // which has no revert data and so used to fall through to
                // `error.message` verbatim.
                toastContractError(error, "Error submitting limit order", {
                  chainId: displayChainId,
                  fixes: toastFixes,
                });
              }
            },
          }
        );
      } catch (error) {}
      return;
    } else if (!isLimit && marketOrderContractArgs.address) {
      const spinnerId = toast.loading("Awaiting market order");
      try {
        // A market order carries no limit price, so `gasLevelsFor` treats it as
        // crossing the whole far side — which is what it does.
        const marketGas = await bufferedGasFor(
          publicClient,
          marketOrderContractArgs,
          gasLevelsFor(orderbook, isBid, null, matchN),
        );
        await writeContractAsync(
          {
            ...marketOrderContractArgs,
            address: marketOrderContractArgs.address,
            // A market order exists to cross the book, so it is the MOST exposed
            // to depth arriving after the estimate.
            ...(marketGas ? { gas: marketGas } : {}),
          },
          {
            onSuccess: (data) => {
              toast.dismiss(spinnerId);
              toast.success("Market order submitted", {
                description: "Waiting for it to confirm on chain.",
                duration: 30000,
                id: `order-tx-${data}`,
              });
              setPendingTx({
                hash: data,
                kind: "market",
                token: spendToken,
                balance: balanceAfterSpend,
              });
            },
            onError: (error) => {
              toast.dismiss(spinnerId);
              if (!error.message.includes("User rejected the request")) {
                // `contractErrorCopy` runs the same `decodeOrderSubmitError` first,
                // so a decoded revert still wins; what it adds is the case the
                // decoder can never see — a node refusing the transaction for gas,
                // which has no revert data and so used to fall through to
                // `error.message` verbatim.
                toastContractError(error, "Error submitting market order", {
                  chainId: displayChainId,
                  fixes: toastFixes,
                });
              }
            },
          }
        );
      } catch (error) {}
      return;
    }
  };

  const renderSwitchNetworkButton = () => {
    return (
      <>
        <p className="text-left text-gray-500 mb-4">
          You are on {displayNetworkName} exchange, <br /> but your wallet is
          connected to {connectedNetworkName} exchange
        </p>
        <button
          className="w-full flex-row items-center justify-center py-4 bg-neutral-dark-default border border-neutral-light-white-12 text-white text-center rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => switchChain({ chainId: displayChainId! })}
        >
          Connect wallet to {displayNetworkName}
        </button>
        <div className="flex items-center justify-center my-4">
          <div className="h-[1px] flex-1 bg-gray-200"></div>
          <span className="mx-4 text-gray-500">or</span>
          <div className="h-[1px] flex-1 bg-gray-200"></div>
        </div>
        <button
          className="w-full flex-row items-center justify-center py-4 bg-neutral-dark-default border border-neutral-light-white-12 text-white text-center rounded-xl mb-6 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => {
            router.push(`/trade?chain=${networkNameToSlug[connectedNetworkName]}`);
          }}
        >
          Go to {connectedNetworkName} exchange
        </button>
      </>
    );
  };

  const renderInsufficientBalance = () => {
    return (
      <button
        className="w-full flex-row items-center justify-center py-4 bg-gray-400 text-white text-center rounded-xl mb-6 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => fund()}
      >
        Deposit more {isBid ? pair.quote.symbol : pair.base.symbol} to{" "}
        {isBid ? "buy" : "sell"} {pair.base.symbol}
      </button>
    );
  };

  const renderOrderTooSmall = () => {
    const label = limitPriceEncodesToZero
      ? "Price too small"
      : orderAmountIsDust
      ? "Order amount too small"
      : simulatedOrderError?.title ?? "Order amount too small";
    return (
      <button
        disabled
        title={simulatedOrderError?.description}
        className="w-full py-4 bg-gray-400 text-white text-center rounded-xl mb-6 opacity-60 cursor-not-allowed"
      >
        {label}
      </button>
    );
  };

  // Shown for the whole mining window, which only exists because success moved to
  // the receipt. Without it the button still reads "Approve <token>" while the
  // approval mines, and a second click sends a SECOND approval whose broadcast
  // overwrites `pendingTx` -- so the first receipt no longer matches and is
  // dropped, leaving the flow stuck. The same click is possible on an order.
  const renderConfirmingButton = (kind: PendingTx["kind"]): React.ReactNode => {
    return (
      <button
        disabled
        className="w-full py-4 bg-gray-400 text-white text-center rounded-xl mb-6 opacity-60 cursor-not-allowed"
      >
        {kind === "approval" ? "Confirming approval…" : "Confirming order…"}
      </button>
    );
  };

  const renderLoginButton = () => {
    return (
      <button
        className={`w-full py-4 ${
          isBid ? "bg-green-400" : "bg-red-400"
        } text-white rounded-xl mb-6 cursor-pointer hover:opacity-90 transition-opacity ${className}`}
        onClick={handleClick}
      >
        {"Connect wallet"}
      </button>
    );
  };

  const renderPlaceOrderButton = (approvalNeeded: boolean): React.ReactNode => {
    if (approvalNeeded) {
      return (
        <button
          className={`w-full py-4 ${
            isBid ? "bg-green-400" : "bg-red-400"
          } text-white rounded-xl mb-6 cursor-pointer hover:opacity-90 transition-opacity ${className}`}
          onClick={handleClick}
        >
          {"Approve"} {isBid ? `${pair.quote.symbol}` : `${pair.base.symbol}`}
        </button>
      );
    }
    return (
      <button
        className={`w-full py-4 ${
          isBid ? "bg-green-400" : "bg-red-400"
        } text-white rounded-xl mb-6 cursor-pointer hover:opacity-90 transition-opacity ${className}`}
        onClick={handleClick}
      >
        {isBid ? `Buy ${pair.base.symbol}` : `Sell ${pair.base.symbol}`}
      </button>
    );
  };
  // console.log(isLoggedIn, "isLoggedIn")

  useEffect(() => {
    if (isLoggedIn) {
      if (pendingTx) {
        setButtonContent(renderConfirmingButton(pendingTx.kind));
      } else if (needsNetworkSwitch(displayChainId, connectedChainId)) {
        setButtonContent(renderSwitchNetworkButton());
      } else if (isBid) {
        if (trueQuoteBalance < quoteAmount) {
          setButtonContent(renderInsufficientBalance());
        } else if (limitPriceEncodesToZero || orderAmountIsDust || simulatedOrderError) {
          setButtonContent(renderOrderTooSmall());
        } else {
          setButtonContent(renderPlaceOrderButton(approvalNeeded));
        }
      } else {
        if (trueBaseBalance < baseAmount) {
          setButtonContent(renderInsufficientBalance());
        } else if (limitPriceEncodesToZero || orderAmountIsDust || simulatedOrderError) {
          setButtonContent(renderOrderTooSmall());
        } else {
          setButtonContent(renderPlaceOrderButton(approvalNeeded));
        }
      }
    } else {
      setButtonContent(renderLoginButton());
    }
  }, [isLoggedIn, connectedChainId, displayChainId, isBid, trueQuoteBalance, quoteAmount, trueBaseBalance, baseAmount, approvalNeeded, limitPriceEncodesToZero, orderAmountIsDust, simulatedOrderError, pendingTx]);

  return buttonContent;
}
