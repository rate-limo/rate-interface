"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BandPoolFactoryABI,
  BandPositionManagerABI,
  BandSwapRouterABI,
  ERC20ABI,
  LadderBuyerABI,
  MatchingEngineABI,
} from "@iter/abis";

/** Seconds a ladder trade stays valid after signing; `LadderBuyer` reverts `DeadlinePassed` past it. */
const LADDER_DEADLINE_SEC = 600;
import { maxUint256, parseUnits } from "viem";
import { waitForTransactionReceipt } from "@wagmi/core";
import { wagmiConfig } from "@/lib/providers";
import { wagmiChains } from "@/lib/customChains";
import { toast } from "sonner";
import { describeWalletFailure } from "@/lib/wallet/walletFailure";
import { useFeeToken } from "@/lib/wallet/feeToken";
import { eventBus } from "@/utils/events";
import { remainderSplit } from "@/lib/swap/remainder";
import { encodeOrderPrice, engineRate } from "@/lib/swap/orderPrice";
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  contractAddress,
  matchingEngineAddress,
  poolFactoryAddress,
  positionManagerAddress,
  swapRouterAddress,
} from "@/lib/deployments";
import { bandSwapIneligibleReason, resolveBandPool } from "@/lib/swap/bandPool";
import type { Disposition, SwapQuote, SwapToken } from "@/lib/swap/types";
import { WRAPPED_NATIVE, classifySwap, wrappedNativeAbi } from "@/lib/swap/wrap";

/**
 * Execution seam for the swap transaction flow.
 *
 * `SwapFlow` renders Review → Approve → Confirm → Pending → Result purely off a
 * `SwapExecution` — it never touches wagmi directly. Today `useMockSwapExecution`
 * advances the steps with timers so the flow clicks through. When the contracts
 * land, implement this same interface against Permit2 / Router / Pool.sol
 * (`writeContractAsync` + `useWaitForTransactionReceipt`) and the flow markup is
 * unchanged. The TODO markers below are the exact plug-in points.
 * See apps/web/CLAUDE.md ("Transaction flow" and "Data & wiring seams").
 */

export type FlowStep =
  | "review"
  | "approve"
  | "approveWait" // wallet prompt for the signature / approve tx
  | "approvePending" // on-chain approve tx mining (on-chain path only)
  | "confirmWait" // wallet prompt for the swap tx
  | "pending" // swap tx mining
  /**
   * The swap filled and a remainder is left to place. Its own steps, because it
   * is its own TRANSACTION.
   *
   * `BandSwapRouter.swap` has no resting mode and no partial-fill placement, so
   * "fill what you can and rest the rest" cannot be one call — the swap sends
   * only the amount the quote says fills now, and the leftover goes to
   * `limitBuy`/`limitSell` or `mintSingleSided` afterwards. That costs
   * the atomicity the swap spec described, and the flow says so rather than
   * hiding a second wallet prompt behind a screen that claims one transaction.
   */
  | "remainder" // swap done, remainder not yet placed — the user acts here
  | "remainderApproveWait" // wallet prompt to approve the remainder's spender
  | "remainderWait" // wallet prompt for the placement itself
  | "remainderPending" // placement mining
  | "result";

/** Detected per token: EIP-2612/Permit2 → gasless signature; else on-chain approve tx. */
export type ApprovalMethod = "permit" | "onchain";
export type SwapOutcome = "success" | "failure";
export type FailureReason = "rejected" | "slippage" | "liquidity";

export interface SwapExecutionState {
  step: FlowStep;
  /** false once allowance exists → the flow skips Approve and goes to Confirm. */
  needsApproval: boolean;
  approved: boolean;
  method: ApprovalMethod;
  /** approve the exact amount (default) vs. unlimited allowance. */
  unlimited: boolean;
  outcome: SwapOutcome | null;
  reason: FailureReason | null;
  approvalTxHash: string | null;
  txHash: string | null;
  /** The remainder's own transaction, when a disposition placed one. */
  remainderTxHash: string | null;
  /**
   * Set when the SWAP succeeded and the remainder did not.
   *
   * Distinct from `outcome: "failure"`, which means nothing happened. Here the
   * user has already traded and only the leftover is unplaced, so the result
   * screen has to report a partial success — telling them the swap failed would
   * be false, and telling them it all worked would leave them looking for an
   * order that does not exist.
   */
  remainderFailed: boolean;
  /**
   * Why the last wallet action did not go through, in a sentence, or null.
   *
   * The approve and confirm steps used a bare `.catch()` that only moved the
   * step back — so a rate-limited RPC (Arc's public endpoint answers 429 under
   * load), a locked passkey session and a declined prompt were all rendered as
   * the same thing: the button returning to where it started, saying nothing.
   * "Approve does not work" is what that looks like from the outside.
   */
  failure: string | null;
}

export interface SwapExecution {
  state: SwapExecutionState;
  /**
   * The contract an approval would actually authorize, or null when this
   * execution has none (the mock, or a chain with no router deployed).
   *
   * On screen because the approval card had it HARDCODED as `Router · 0x51…a7`
   * — a placeholder from when this flow was a mock, still rendering after the
   * real execution landed. Arc's router is `0x1061…174E`, so the screen named
   * one address while the transaction would have granted the allowance to
   * another. On an approval, the spender is the single field the whole decision
   * rests on.
   */
  spender: string | null;
  setUnlimited(v: boolean): void;
  /** Move to the Approve step (Review branches here when an allowance is needed). */
  toApprove(): void;
  /** Begin approval — permit signature or on-chain approve tx. */
  approve(): void;
  /** Confirm & submit the swap transaction. */
  confirm(): void;
  /** Place the remainder — the second transaction. See `FlowStep`. */
  placeRemainder(): void;
  /** Finish without placing it. The swap already happened and is not undone. */
  skipRemainder(): void;
  /** Back to the Review step (keeps any allowance already granted). */
  back(): void;
  /** Full reset to a fresh Review (new swap / retry). */
  reset(): void;
}

export interface MockExecutionConfig {
  /** The pay token — its approval semantics decide permit vs. on-chain. */
  pay: SwapToken;
  /** Whether the pay token already has an allowance (returning user skips approve). */
  hasAllowance?: boolean;
  /** Illustrative demo hashes. */
  txHash?: string;
  approvalTxHash?: string;
}

export interface SwapExecutionConfig extends MockExecutionConfig {
  get: SwapToken;
  quote: SwapQuote;
  disposition: Disposition;
  networkName: string;
  /**
   * Set when this trade is a launch coin still selling its ladder (see
   * lib/launch/ladderBuy). The band pool is closed until graduation and a
   * market order cannot climb a step, so the trade goes through
   * `LadderBuyer.buy`/`sell`: up to five fill-or-refund orders in one
   * transaction, never past `price` (the ceiling for a buy, the floor for a
   * sell), reverting below `minOut`. Nothing rests.
   */
  ladder?: { side: "buy" | "sell"; base: string; quote: string; price: bigint; minOut: bigint };
}

export type SwapExecutionHook = (config: SwapExecutionConfig) => SwapExecution;

// Tokens we model as EIP-2612/Permit2-capable (gasless). Everything else takes a
// one-time on-chain approve. Purely illustrative until real detection is wired.
const PERMIT_TOKENS = new Set(["USDC", "USDT", "ETH", "WETH", "MON"]);

function methodFor(pay: SwapToken): ApprovalMethod {
  return PERMIT_TOKENS.has(pay.symbol) ? "permit" : "onchain";
}

const REDUCED =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function delay(ms: number): number {
  return REDUCED ? Math.min(ms, 120) : ms;
}

/**
 * Timer-driven mock of {@link SwapExecution}. Mirrors the approved flow timings:
 * permit → sign (settles to an allowance); on-chain → send approve → mine; then
 * confirm → submit → mine → success.
 */
export function useMockSwapExecution(config: MockExecutionConfig): SwapExecution {
  const method = methodFor(config.pay);
  const initial: SwapExecutionState = {
    step: "review",
    needsApproval: !config.hasAllowance,
    approved: !!config.hasAllowance,
    method,
    unlimited: false,
    outcome: null,
    reason: null,
    approvalTxHash: config.approvalTxHash ?? "0x77c1…9e02",
    txHash: config.txHash ?? "0x9a3f…4b21",
    remainderTxHash: null,
    remainderFailed: false,
    failure: null,
  };

  const [state, setState] = useState<SwapExecutionState>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const after = useCallback(
    (ms: number, fn: () => void) => {
      clear();
      timer.current = setTimeout(fn, delay(ms));
    },
    [clear]
  );
  useEffect(() => clear, [clear]);

  const setUnlimited = useCallback((v: boolean) => {
    setState((s) => ({ ...s, unlimited: v }));
  }, []);

  const toApprove = useCallback(() => {
    setState((s) => ({ ...s, step: "approve" }));
  }, []);

  const approve = useCallback(() => {
    setState((s) => ({ ...s, step: "approveWait" }));
    // TODO(real): permit → sign EIP-2612/Permit2 typed data (no tx); on-chain →
    // writeContractAsync(erc20.approve, [router, unlimited ? MAX : amount]).
    if (method === "permit") {
      after(1200, () =>
        setState((s) => ({ ...s, approved: true, step: "review" }))
      );
    } else {
      after(1200, () => {
        setState((s) => ({ ...s, step: "approvePending" }));
        // TODO(real): useWaitForTransactionReceipt(approveHash) resolves here.
        after(1700, () =>
          setState((s) => ({ ...s, approved: true, step: "review" }))
        );
      });
    }
  }, [method, after]);

  const confirm = useCallback(() => {
    setState((s) => ({ ...s, step: "confirmWait" }));
    // TODO(real): writeContractAsync(router.swap, args) — the one atomic call that
    // does match + place-remainder (limit/LP) together.
    after(1400, () => {
      setState((s) => ({ ...s, step: "pending" }));
      // TODO(real): useWaitForTransactionReceipt(txHash) — set outcome from the
      // receipt (success) or the decoded revert (failure: rejected/slippage/liquidity).
      after(1700, () =>
        setState((s) => ({ ...s, step: "result", outcome: "success", reason: null }))
      );
    });
  }, [after]);

  const back = useCallback(() => {
    clear();
    setState((s) => ({ ...s, step: "review" }));
  }, [clear]);

  const reset = useCallback(() => {
    clear();
    setState({ ...initial, step: "review" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear, config.pay.symbol]);

  // Re-seed method/allowance if the pay token changes between opens.
  useEffect(() => {
    setState((s) => ({ ...s, method, needsApproval: !config.hasAllowance, approved: !!config.hasAllowance }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pay.symbol]);

  // The mock has no chain to place a remainder on, so it walks the same steps
  // on a timer — the flow's screens are what this hook exists to exercise.
  const placeRemainder = () => {
    setState((s) => ({ ...s, step: "remainderWait" }));
    window.setTimeout(() => setState((s) => ({ ...s, step: "remainderPending" })), 600);
    window.setTimeout(
      () =>
        setState((s) => ({
          ...s,
          step: "result",
          remainderTxHash: config.txHash ?? "0xremainder",
        })),
      1600,
    );
  };
  const skipRemainder = () => setState((s) => ({ ...s, step: "result" }));

  // The mock authorizes nothing, so it names nothing. The row renders a dash
  // rather than inventing an address, which is how the placeholder that was
  // hardcoded on the approval card got there in the first place.
  return { state, spender: null, setUnlimited, toApprove, approve, confirm, back, reset, placeRemainder, skipRemainder };
}

/** Real allowance + SwapRouter execution used by the full swap card. */
export const useRealSwapExecution: SwapExecutionHook = (config) => {
  const { address: account, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const ladder = config.ladder;
  // The contract this trade's allowance is for: the router for a pool swap,
  // `LadderBuyer` for a ladder trade. Every approval and allowance read below
  // goes through it, so the two can never disagree. Both resolve from the
  // registry, which is what makes the approve and the call session-tier in the
  // wallet frame (lib/wallet/frame/policy.ts).
  const router = ladder
    ? contractAddress(config.networkName, "ladderBuyer")
    : swapRouterAddress(config.networkName);
  /**
   * What this chain charges fees IN, so a shortfall can name it.
   *
   * Arc bills in USDC and RISE in ETH, and "not enough to cover the network
   * fee" without the asset sends someone to top up the wrong one.
   */
  const gasChain = wagmiChains.find((c) => c.name === config.networkName);
  // Tempo's registry symbol is a placeholder; name the fee token this account pays in.
  const gasSymbol = useFeeToken(gasChain?.id, account)?.symbol ?? gasChain?.nativeCurrency.symbol;
  const poolFactory = poolFactoryAddress(config.networkName);
  const amount = parseUnits(String(config.quote.amountIn), config.pay.decimals);

  /**
   * The fill/remainder split, in pay-token units.
   *
   * `placements` is what the gateway said cannot fill now — `hop.leftoverIn`,
   * the same figure the card's fill-split bar draws. Summed across hops, though
   * only a single-hop route reaches execution (`bandSwapIneligibleReason` still
   * refuses multi-hop, because one band pool cannot serve two markets).
   *
   * Zero when the book can take the whole order, which is the common case and
   * the one where nothing about this flow changes.
   */
  const remainderIn =
    config.disposition === "none" || ladder
      ? 0
      : config.quote.placements.reduce((sum, placement) => sum + placement.inAmount, 0);
  const remainderAmount = parseUnits(
    // Truncated to the token's decimals before parsing: `leftoverIn` is a float
    // and `parseUnits` throws on more precision than the token can hold, which
    // would fail the placement after the swap had already happened.
    remainderIn.toFixed(config.pay.decimals),
    config.pay.decimals,
  );
  /*
   * ZERO when the remainder is the whole order, not the whole order.
   *
   * This fell back to `amount`, so a quote that fills NOTHING sent the entire
   * order to the router anyway. The router matched what it could — nothing —
   * and refunded, which is the `0 filled · 1 refunded` a user sees after paying
   * gas for a transaction that could never do anything, and only THEN was asked
   * to sign the order that was the whole point.
   *
   * `remainderAmount >= amount` means the book cannot take any of it right now.
   * The honest amount to swap is none.
   */
  const matchedAmount = amount > remainderAmount ? amount - remainderAmount : BigInt(0);

  /**
   * `BandPoolFactory.getPool(base, quote)` is order-sensitive (its CREATE2 salt is
   * keyed on argument position), and there is no "either order" entry point, so both
   * orders are read and `resolveBandPool` picks whichever answered with a real pool.
   * See lib/swap/bandPool.ts for why this two-call shape is required rather than a
   * convenience of this hook.
   */
  const payAddr = config.pay.address as `0x${string}`;
  const getAddr = config.get.address as `0x${string}`;
  const { data: poolIfPayIsBase } = useReadContract({
    abi: BandPoolFactoryABI,
    address: poolFactory,
    functionName: "getPool",
    args: [payAddr, getAddr],
    query: { enabled: Boolean(poolFactory) },
  });
  const { data: poolIfGetIsBase } = useReadContract({
    abi: BandPoolFactoryABI,
    address: poolFactory,
    functionName: "getPool",
    args: [getAddr, payAddr],
    query: { enabled: Boolean(poolFactory) },
  });
  const bandPool = resolveBandPool(poolIfPayIsBase, poolIfGetIsBase);
  const ineligibleReason = bandSwapIneligibleReason(
    config.quote.hops.length || 1,
    config.disposition,
  );
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: ERC20ABI,
    address: config.pay.address as `0x${string}`,
    functionName: "allowance",
    args: account && router ? [account, router] : undefined,
    query: { enabled: Boolean(account && router) },
  });
  /**
   * Wrap and unwrap bypass both the allowance and the pool.
   *
   * `deposit()` is funded by `value:` and `withdraw()` burns the caller's own
   * balance, so neither has a spender to approve — leaving `needsApproval` true
   * would have parked the flow on an approval step for a contract that never
   * reads an allowance. And there is no band pool for ETH/WETH, nor should there
   * be: without this branch `confirm` reached "No band pool is listed for
   * ETH/WETH yet", which is true and useless, since the conversion is 1:1 on the
   * wrapped contract itself and needs no market at all.
   */
  const swapKind = classifySwap(config.pay, config.get, config.pay.chainId);
  const isWrapKind = swapKind === "wrap" || swapKind === "unwrap";
  /*
   * NO ROUTER APPROVAL when no swap is going to be sent.
   *
   * `confirm` skips the swap outright when the book can take none of the order,
   * so the router is never called — but the flow still walked the user through
   * granting it an allowance first, and the placement then asked for a SECOND
   * approval on its own spender. Measured end to end on Arc: `approve` to the
   * swap router, `approve` to the matching engine, `limitBuy`. Three
   * transactions, of which the first can never be spent.
   *
   * That is the same defect as the zero-amount swap this flow already refuses to
   * send, one step earlier — a fee for a call that cannot do anything — and it
   * is why "it asks twice" survived fixing the swap. The remainder path grants
   * its own allowance to its own spender (`placeRemainder`), so skipping here
   * costs nothing and removes a prompt.
   */
  const swapWillBeSent = remainderIn <= 0 || amount > remainderAmount;
  const needsApproval = isWrapKind || (!swapWillBeSent && !ladder)
    ? false
    : typeof allowance !== "bigint" || allowance < amount;
  const { writeContractAsync } = useWriteContract();
  const [approvalHash, setApprovalHash] = useState<`0x${string}`>();
  const [swapHash, setSwapHash] = useState<`0x${string}`>();
  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalHash, timeout: 120_000 });
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapHash, timeout: 120_000 });
  const [state, setState] = useState<SwapExecutionState>({
    step: "review",
    needsApproval,
    approved: !needsApproval,
    method: "onchain",
    unlimited: false,
    outcome: null,
    reason: null,
    approvalTxHash: null,
    txHash: null,
    remainderTxHash: null,
    remainderFailed: false,
    failure: null,
  });

  useEffect(() => {
    setState((current) => ({ ...current, needsApproval, approved: !needsApproval }));
  }, [needsApproval]);

  useEffect(() => {
    const receipt = approvalReceipt.data;
    if (!approvalHash || !receipt || receipt.transactionHash !== approvalHash) return;
    if (receipt.status === "success") {
      void refetchAllowance();
      // An approval moves no tokens, but it does spend gas — which on Arc comes
      // out of the balance the next screen is about to show.
      eventBus.emit("spot-balance-refetch");
      setState((current) => ({ ...current, step: "review", approved: true, needsApproval: false }));
    } else {
      setState((current) => ({ ...current, step: "result", outcome: "failure", reason: "rejected" }));
    }
  }, [approvalHash, approvalReceipt.data, refetchAllowance]);

  useEffect(() => {
    if (approvalReceipt.isError && approvalHash) {
      setState((current) => ({ ...current, step: "result", outcome: "failure", reason: "rejected" }));
    }
  }, [approvalHash, approvalReceipt.isError]);

  useEffect(() => {
    const receipt = swapReceipt.data;
    if (!swapHash || !receipt || receipt.transactionHash !== swapHash) return;
    const filled = receipt.status === "success";
    // The balances on screen are now stale, and this is the first moment that is
    // known — the same call `PlaceOrderButton` makes, at the receipt rather than
    // at broadcast. Emitted on a FAILURE too: a reverted swap still burned gas,
    // and on Arc gas is the asset being traded.
    eventBus.emit("spot-balance-refetch");
    setState((current) => ({
      ...current,
      // A successful swap with something left over stops at `remainder` rather
      // than `result`: the trade is done, and the leftover needs a second
      // transaction the user has not authorised yet. Going straight to the
      // result would report a rested order that was never placed.
      //
      // A FAILED swap never reaches it. There is nothing to rest — the amount
      // is still in the wallet, and the honest next step is to try the swap
      // again, not to place half of it.
      step: filled && remainderAmount > BigInt(0) ? "remainder" : "result",
      outcome: filled ? "success" : "failure",
      reason: filled ? null : "liquidity",
    }));
  }, [swapHash, swapReceipt.data, remainderAmount]);

  useEffect(() => {
    if (swapReceipt.isError && swapHash) {
      setState((current) => ({ ...current, step: "result", outcome: "failure", reason: "liquidity" }));
    }
  }, [swapHash, swapReceipt.isError]);

  const remainderReceipt = useWaitForTransactionReceipt({
    hash: state.remainderTxHash as `0x${string}` | undefined,
    timeout: 120_000,
  });

  useEffect(() => {
    const receipt = remainderReceipt.data;
    if (!receipt) return;
    // A rested order or an LP deposit has moved funds out of the wallet again.
    eventBus.emit("spot-balance-refetch");
    // The swap already succeeded, so `outcome` is left alone. Only whether the
    // REMAINDER landed is recorded here — a reverted placement must not turn a
    // completed trade into a reported failure.
    setState((current) => ({
      ...current,
      step: "result",
      remainderFailed: receipt.status !== "success",
    }));
  }, [remainderReceipt.data]);

  const approve = useCallback(() => {
    if (!router) return;
    setState((current) => ({ ...current, step: "approveWait", failure: null }));
    void (async () => {
      if (chainId !== config.pay.chainId) await switchChainAsync({ chainId: config.pay.chainId });
      return writeContractAsync({
      abi: ERC20ABI,
      address: config.pay.address as `0x${string}`,
      functionName: "approve",
      args: [router, state.unlimited ? maxUint256 : amount],
      });
    })().then((hash) => {
      setApprovalHash(hash);
      setState((current) => ({ ...current, step: "approvePending", approvalTxHash: hash }));
    }).catch((error: unknown) => {
      // SAID, not swallowed. A declined prompt is a decision and stays silent;
      // everything else — a 429 from the chain's public RPC, a passkey session
      // that ended on reload — gets a sentence, in the card AND in a toast.
      const said = describeWalletFailure(error, { gasSymbol });
      if (said) toast.error("Approval failed", { description: said });
      setState((current) => ({ ...current, step: "approve", failure: said }));
    });
  }, [amount, chainId, config.pay.address, config.pay.chainId, router, state.unlimited, switchChainAsync, writeContractAsync]);

  /**
   * `placeRemainder`, reachable from `confirm` above it.
   *
   * A ref rather than a reordering: the two are mutually referential (confirm
   * hands off to the placement; the placement needs everything confirm set up),
   * and a ref keeps that seam in one place instead of shuffling 150 lines of
   * hook to satisfy declaration order.
   */
  const placeRemainderRef = useRef<() => void>(() => {});

  const confirm = useCallback(() => {
    if (!router || !account) return;
    /**
     * With a disposition, the swap sends only the amount the quote says fills
     * NOW — the rest is the remainder and goes out in its own transaction.
     *
     * Sending the full amount and hoping would either revert on `minOut` or
     * fill at a price the user did not agree to; the split is the whole point
     * of the feature. `matchedIn` is the gateway's own figure, the same one the
     * fill-split bar renders, so what the screen showed is what gets sent.
     */
    const swapAmount = remainderIn > 0 ? matchedAmount : amount;
    const minOut = parseUnits(String(config.quote.minReceived), config.get.decimals);
    /*
     * NOTHING fills, so there is no swap to send — go straight to placing it.
     *
     * A zero-amount swap is a transaction that costs gas, matches nothing and
     * refunds the lot, and it used to run before the wallet was asked a second
     * time for the order the user actually wanted. On a thin market — a freshly
     * launched coin with no resting asks, which is the common case here — that
     * was every single buy: two prompts and a wasted fee for one order.
     *
     * The flow's `remainder` step already owns "the swap is settled, place the
     * rest"; entering it with nothing filled is the same screen with a better
     * story, and it costs ONE signature.
     */
    if (swapAmount <= BigInt(0)) {
      /*
       * Straight to the wallet — the disposition IS the decision.
       *
       * This used to stop on the remainder screen and ask "place it or leave
       * it?", which is the same question the card already asked when the user
       * picked "Rest it as an order". Asking twice for one choice reads as the
       * app not having heard the first answer. That screen earns its place only
       * when a swap actually happened and the user may now want to stop; with
       * nothing filled there is no new information to act on.
       */
      placeRemainderRef.current();
      return;
    }
    setState((current) => ({ ...current, step: "confirmWait", failure: null }));
    void (async () => {
      if (chainId !== config.pay.chainId) await switchChainAsync({ chainId: config.pay.chainId });

      /**
       * `Router.sol`'s path-based multi-hop and its LP-remainder mode are both gone
       * along with `Pool.sol`. `BandSwapRouter.swap` takes exactly one pool and fills
       * whatever it can right now — no resting mode, no partial-fill placement.
       * Refusing here beats assembling a call the contract cannot honor: a band pool
       * position has no range for an LP remainder to occupy, and a multi-hop route
       * has no single pool to send the whole trade through.
       */
      /**
       * The same asset on both legs is refused by name.
       *
       * On Arc this is native USDC against the ERC-20 at `0x3600…` — one balance
       * behind two interfaces, so there is nothing to convert and no rate to
       * convert at. Falling through would have reported "No band pool is listed
       * for USDC/USDC yet", which is true and sends the reader looking for a
       * missing market instead of telling them the two sides are one asset.
       */
      if (swapKind === "same-asset") {
        throw new Error(
          `${config.pay.symbol} and ${config.get.symbol} are the same asset — there is nothing to convert.`,
        );
      }

      // Before the pool checks: a wrap has no pool by design, so asking for one
      // would refuse the single conversion that never needed a market.
      if (isWrapKind) {
        const wrapped = WRAPPED_NATIVE[config.pay.chainId];
        if (!wrapped) throw new Error("This chain has no wrapped native token");
        return writeContractAsync(
          swapKind === "wrap"
            ? {
                abi: wrappedNativeAbi,
                address: wrapped.address as `0x${string}`,
                functionName: "deposit",
                args: [],
                // The whole amount goes as native value; `deposit()` credits the
                // caller 1:1 and there is nothing to approve first.
                value: amount,
              }
            : {
                abi: wrappedNativeAbi,
                address: wrapped.address as `0x${string}`,
                functionName: "withdraw",
                args: [amount],
              },
        );
      }

      // A ladder trade: up to five fill-or-refund orders through LadderBuyer.
      // No pool is involved — it is closed until graduation — and nothing rests.
      if (ladder) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + LADDER_DEADLINE_SEC);
        return writeContractAsync({
          abi: LadderBuyerABI,
          address: router as `0x${string}`,
          functionName: ladder.side === "buy" ? "buy" : "sell",
          args: [
            ladder.base as `0x${string}`,
            ladder.quote as `0x${string}`,
            amount,
            ladder.price,
            ladder.minOut,
            account,
            deadline,
          ],
        });
      }

      if (ineligibleReason) throw new Error(ineligibleReason);
      if (!bandPool) {
        throw new Error(
          `No band pool is listed for ${config.pay.symbol}/${config.get.symbol} yet.`,
        );
      }

      return writeContractAsync({
        abi: BandSwapRouterABI,
        address: router,
        functionName: "swap",
        args: [bandPool.pool, swapAmount, bandPool.quoteToBase, account, minOut],
      });
    })().then((hash) => {
      setSwapHash(hash);
      setState((current) => ({ ...current, step: "pending", txHash: hash }));
    }).catch((error: unknown) => {
      const said = describeWalletFailure(error, { gasSymbol });
      if (said) toast.error("Trade failed", { description: said });
      /*
       * To the RESULT screen, not back to review.
       *
       * The flow already has a place for an outcome and it is not the review
       * step: dropping back there left a chain error printed above the trade
       * summary, on the one screen whose job is to state the trade cleanly. A
       * user who declined keeps the review they were looking at; anything that
       * actually failed gets the screen with the reason and a Try again.
       */
      setState((current) =>
        said
          ? { ...current, step: "result", outcome: "failure", failure: said }
          : { ...current, step: "review", failure: null },
      );
    });
  }, [
    account,
    amount,
    bandPool,
    chainId,
    config.get.decimals,
    config.get.symbol,
    config.pay.chainId,
    config.pay.symbol,
    config.quote.minReceived,
    ineligibleReason,
    ladder,
    router,
    switchChainAsync,
    writeContractAsync,
  ]);

  /**
   * Place the remainder — the second transaction.
   *
   * Two destinations, and they are different contracts with different spenders,
   * so each needs its own allowance. That is why this approves inline rather
   * than reusing the swap's approval: the router's allowance says nothing about
   * what the matching engine or the position manager may spend.
   *
   *  - `limit` -> `limitBuy` / `limitSell` on the MatchingEngine. Which one
   *    depends on the direction the band pool told us: paying the quote asset to
   *    receive the base is a BID.
   *  - `lp` -> `mintSingleSided` on the BandPositionManager, into the
   *    tightest open band, with `isBase` set from the same direction.
   *
   * A failure here is NOT a failed swap. The swap already happened and cannot be
   * undone, so this records `remainderFailed` and still lands on the result
   * screen — reporting the whole thing as a failure would tell someone their
   * trade did not go through when it did.
   */
  const placeRemainder = useCallback(() => {
    if (remainderAmount <= BigInt(0) || !account) return;
    setState((current) => ({ ...current, step: "remainderApproveWait" }));

    void (async () => {
      const isBid = Boolean(bandPool?.quoteToBase);
      const spender =
        config.disposition === "limit"
          ? matchingEngineAddress(config.networkName)
          : positionManagerAddress(config.networkName);
      if (!spender) throw new Error("This chain has no contract to place the remainder with.");

      // Exact amount, like the swap's own approval: an unlimited allowance to a
      // second contract is a bigger grant than the user agreed to on Review.
      const approveHash = await writeContractAsync({
        abi: ERC20ABI,
        address: config.pay.address as `0x${string}`,
        functionName: "approve",
        args: [spender, remainderAmount],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });

      setState((current) => ({ ...current, step: "remainderWait" }));

      if (config.disposition === "limit") {
        /*
         * The price the REMAINDER is worth, not the whole order's average.
         *
         * This was `delivered / amountIn`, described as "what this swap actually
         * delivered per unit paid" — true only when everything filled, and this
         * code runs only when it did not. `amountIn` carries the unfilled part,
         * so the divisor was always too large by exactly the remainder.
         *
         * On the Arc quote this was measured against — 9.05713 DONUT in,
         * 6.508932 out, 2.499012 unfilled — it produced 0.71865 against a market
         * of 0.9927: a limit sell posted 27.6% under the book, which crosses
         * immediately and dumps the remainder. The error grows with the
         * shortfall, so it was worst exactly where the feature is for.
         *
         * `remainderSplit` reads the placement the rail rendered, so the order
         * rests at the number the user agreed to rather than at a second
         * derivation of it.
         */
        const rate = remainderSplit(config.quote).restPrice;
        if (!(rate > 0)) throw new Error("No price to rest this order at.");
        /*
         * Two corrections, and the order never rested without either.
         *
         * The SCALE was the get token's decimals. The engine's `price` is a
         * fixed 1e8 fraction whatever the tokens are — decimals belong to
         * `amount` alone — so a 6-decimal get encoded 100x too small and an
         * 18-decimal one 1e10x too large. `TradePageProvider` and the swap
         * card's own limit form both had this right; this path was the third
         * encoding.
         *
         * The ORIENTATION was unflipped on the bid side. `restPrice` is
         * GET-per-PAY, and the engine wants QUOTE-per-BASE — which on a BUY is
         * the reciprocal, because base is the token being received. So every
         * resting buy was priced at the inverse of what the user agreed to.
         *
         * Either way the order was priced far from the book, so it crossed and
         * filled outright or was refused, and nothing rested — which is what
         * "the portfolio never shows my limit order" looked like from outside.
         */
        const price = encodeOrderPrice(engineRate(rate, isBid));
        if (price <= BigInt(0)) throw new Error("No price to rest this order at.");
        return writeContractAsync({
          abi: MatchingEngineABI,
          address: matchingEngineAddress(config.networkName) as `0x${string}`,
          functionName: isBid ? "limitBuy" : "limitSell",
          args: [
            {
              base: (isBid ? config.get.address : config.pay.address) as `0x${string}`,
              quote: (isBid ? config.pay.address : config.get.address) as `0x${string}`,
              price,
              amount: remainderAmount,
              isMaker: true,
              n: 20,
              recipient: account,
            },
          ],
        });
      }

      if (!bandPool) throw new Error("No band pool to provide liquidity into.");
      return writeContractAsync({
        abi: BandPositionManagerABI,
        address: positionManagerAddress(config.networkName) as `0x${string}`,
        functionName: "mintSingleSided",
        // Band 0 — the tightest, which is also the one that fills first. The
        // pool-deposit page is where a real band choice belongs; a swap
        // remainder is not the place to ask. One token, one band: the LP can
        // widen it later from the position card's Adjust distribution.
        args: [
          bandPool.pool,
          [0],
          [remainderAmount],
          !bandPool.quoteToBase,
          [BigInt(0)],
          account,
          BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
        ],
      });
    })()
      .then((hash) => {
        setState((current) => ({ ...current, step: "remainderPending", remainderTxHash: hash }));
      })
      .catch((error: unknown) => {
        // The swap already happened, so this is a partial success — but the
        // reason still has to survive. Without it the result screen says the
        // remainder failed and nothing about why, which is the same silence the
        // approve and confirm steps were just taken out of.
        const said = describeWalletFailure(error, { gasSymbol });
        if (said) toast.error("The remainder was not placed", { description: said });
        setState((current) => ({
          ...current,
          step: "result",
          remainderFailed: true,
          failure: said,
        }));
      });
  }, [
    account,
    bandPool,
    config.disposition,
    config.get.address,
    config.get.decimals,
    config.networkName,
    config.pay.address,
    config.quote.amountIn,
    config.quote.delivered,
    config.quote.minReceived,
    remainderAmount,
    writeContractAsync,
  ]);

  // Kept in step with the callback above; `confirm` reaches the placement
  // through this when nothing filled and there is no swap to send first.
  useLayoutEffect(() => {
    placeRemainderRef.current = placeRemainder;
  });

  const skipRemainder = useCallback(
    () => setState((current) => ({ ...current, step: "result" })),
    [],
  );

  const reset = useCallback(() => {
    setApprovalHash(undefined);
    setSwapHash(undefined);
    setState((current) => ({
      ...current,
      step: "review",
      outcome: null,
      reason: null,
      txHash: null,
      failure: null,
    }));
  }, []);

  return {
    state,
    spender: router ?? null,
    setUnlimited: (unlimited) => setState((current) => ({ ...current, unlimited })),
    toApprove: () => setState((current) => ({ ...current, step: "approve" })),
    approve,
    confirm,
    // Back CLEARS the failure. It belonged to the attempt being left, and the
    // review screen is for reviewing a trade — a chain error still sitting on it
    // after the user has walked away from that attempt is stale text on the one
    // screen that has to be trusted.
    back: () => setState((current) => ({ ...current, step: "review", failure: null })),
    reset,
    placeRemainder,
    skipRemainder,
  };
};
