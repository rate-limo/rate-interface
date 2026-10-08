"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { positionAfter } from "@/lib/swap/remainder";
import { formatSubscriptDecimal, formatUsd } from "@/utils/number";
import { explorerUrlForNetwork } from "@/lib/search/explorer";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { ThesisComposer } from "@/components/Pages/Profile/ThesisComposer";
import { THESIS_DISPLAY_MIN_USD } from "@/lib/thesis/candidates";
import { GAS_LIMITS, useNetworkFee } from "@/hooks/useNetworkFee";
import { chainIds } from "@/consts";
import { Stepper } from "@/components/Atoms/Stepper";
import { tokenColor } from "@/lib/swap/tokens";
import { lpAprPct } from "@/lib/swap/quote";
import type { Disposition, SwapQuote, SwapToken } from "@/lib/swap/types";
import { type SwapExecutionConfig, useMockSwapExecution, type SwapExecution, type SwapExecutionHook } from "./execution";

/**
 * The swap transaction flow: Review → Approve → Confirm → Pending → Result, in a
 * modal over the card. Ported from the approved swapflow-src design (the LEFT
 * card only — the demo control/spec panels are not product UI). Approval detects
 * permit (gasless signature) vs. on-chain approve (its own pending state); the
 * swap is one atomic tx; the result is composite (delivered + any limit/LP the
 * same tx opened) and failures say "funds untouched".
 *
 * All step transitions come from a {@link SwapExecution}. Today that's the timer
 * mock; wiring real Permit2/Router calls means swapping the hook, not this markup.
 * See apps/web/CLAUDE.md ("Transaction flow — inside the card").
 */

interface SwapFlowProps {
  pay: SwapToken;
  get: SwapToken;
  quote: SwapQuote;
  disposition: Disposition;
  networkName: string;
  /** A launch coin's fill-or-refund ladder order — see SwapExecutionConfig.ladder. */
  ladder?: SwapExecutionConfig["ladder"];
  onClose: () => void;
  /** Injectable execution — defaults to the timer mock. */
  useExecution?: SwapExecutionHook;
}

/**
 * Dollars, through the app's ONE formatter.
 *
 * This was a local `"$" + toLocaleString({maximumFractionDigits: n < 1 ? 4 : 0})`
 * — a fourth hand-rolled `$` formatter in a codebase whose `utils/number`
 * docstring exists because three of them had already disagreed. It also lost
 * the sub-cent range outright: `$0.0001` is four zeros away from being
 * readable, and anything smaller rendered as `$0`.
 */
const money = formatUsd;

/**
 * A token amount, with SUBSCRIPT-ZERO notation below 1.
 *
 * `displayDec` caps USDC at two decimals, so `toLocaleString` rendered a
 * 0.0001 USDC trade as a flat **"0 USDC"** — on the review screen, above a
 * button that spends it, and again as "Exact 0" on the approval screen. A zero
 * where a number should be is the one rendering that cannot be read as
 * "rounded": it reads as nothing being traded.
 *
 * `formatSubscriptDecimal` is the same notation the price surfaces use
 * (`0.0₃1`), so a reader meets one convention across the app rather than one
 * per screen. It answers null at or above 1 and for an exact zero, which is
 * where the ordinary formatting is right and stays.
 *
 * Its DEFAULT `minZeros` (2) is deliberate rather than lazy. Forcing the
 * notation on everything below 1 renders `0.99` as `0.0₀99` — a subscript
 * counting nothing, which is harder to read than the number it replaced. Two
 * leading zeros is also exactly where `formatUsd` switches, so the dollar
 * figure and the token figure on the same row change shape together instead of
 * one at a time.
 */
function tokNum(n: number, dec: number): string {
  return (
    formatSubscriptDecimal(n, { digits: 4 }) ??
    Number(n).toLocaleString("en-US", { maximumFractionDigits: dec })
  );
}
function displayDec(t: SwapToken): number {
  if (t.symbol === "USDC" || t.symbol === "USDT") return 2;
  if (t.priceUsd >= 1000) return 6;
  return 4;
}

interface RemainderSummary {
  kind: "limit" | "lp";
  label: string;
  tag: string;
  v: string;
}

export function SwapFlow({
  pay,
  get,
  quote,
  disposition,
  networkName,
  ladder,
  onClose,
  useExecution = useMockSwapExecution,
}: SwapFlowProps) {
  const exec = useExecution({ pay, get, quote, disposition, networkName, ladder });

  /**
   * The flow's outcome is a card, not a toast, so it is sounded here, keyed by
   * the transaction so a re-render or a StrictMode double effect cannot replay
   * it. The swap landing with a remainder still to place is a fill; the
   * remainder's own outcome is the rest (limit) or the drop into the pool (LP).
   */
  const { step, outcome, txHash, remainderTxHash, remainderFailed } = exec.state;
  useEffect(() => {
    if (step === "remainder") {
      playSound("fill", { key: `swap-fill:${txHash}` });
      return;
    }
    if (step !== "result") return;
    if (outcome === "failure") playSound("error", { key: `swap-fail:${txHash}` });
    else if (remainderFailed) playSound("error", { key: `swap-rem-fail:${txHash}` });
    else if (remainderTxHash) playSound(disposition === "lp" ? "pool" : "rest", { key: `swap-rem:${remainderTxHash}` });
    else if (outcome === "success") playSound("success", { key: `swap-ok:${txHash}` });
  }, [step, outcome, txHash, remainderTxHash, remainderFailed, disposition]);

  /**
   * Rendered into `document.body`, not where it is mounted.
   *
   * `fixed inset-0 z-50` positions against the VIEWPORT but stacks inside
   * whatever context its ancestors created — and any ancestor with a
   * `transform`, `filter`, `opacity` below 1, `will-change` or a `z-index` of
   * its own makes one. So the overlay's z-index was only ever competing with its
   * siblings, and on the token profile it lost: the chart's own price overlay
   * and change badge drew straight THROUGH the approval card, over the button
   * the user was being asked to press.
   *
   * Raising the number would have fixed that page and left the next one to find
   * it again, because the bug is not the value — it is that a modal was inside
   * the document flow at all. A portal takes it out of every ancestor's
   * stacking context at once, which is what a dialog needs and what Radix does
   * for the app's other overlays.
   *
   * Mounted-gated because `document` does not exist while rendering on the
   * server. Returning null for the first client render costs nothing here: this
   * only renders at all once a user has opened it.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Gas, read live and denominated in the chain's own asset.
   *
   * `order` rather than `approve`: the review screen's figure is for the trade the button
   * is about to send. The approval step's own cost is smaller and is not what a user is
   * deciding on here.
   *
   * Unavailable renders an em-dash, never `$0` — a zero fee is indistinguishable from a
   * measured one, and at this venue's sizes a reader would believe it.
   */
  const networkFee = useNetworkFee(chainIds[networkName], GAS_LIMITS.order);
  const networkFeeLabel =
    networkFee.state === "ok" ? `~${networkFee.amount} ${networkFee.symbol}` : "—";

  const getDec = displayDec(get);
  const payLabel = `${tokNum(quote.amountIn, displayDec(pay))} ${pay.symbol}`;
  /*
   * The POSITION this trade ends in, not just the part that fills this second.
   *
   * `delivered` is the instant fill, and with a disposition set that is
   * routinely ZERO — a thin market takes none of the order and the whole thing
   * rests. The review screen then read "0 ITRA · You receive · est · $0" above a
   * Remainder row promising "$1 → ITRA", which is the same trade described
   * twice and contradicting itself. Nobody is trading to receive nothing.
   *
   * `restsTo` is what the resting part is worth at the price it rests AT —
   * `remainderSplit` derives it from the placement, so it is the same figure
   * the disposition rail already shows rather than a second guess at it.
   */
  const { resting: restsTo, total: endsWith } = positionAfter(quote, disposition);
  const getN = tokNum(endsWith, getDec);
  const rateLabel = `1 ${get.symbol} = ${tokNum(get.priceUsd, get.priceUsd >= 100 ? 0 : 2)} USDC`;
  const routeLabel =
    quote.route.map((t) => t.symbol).join(" → ") +
    ` · ${quote.hops.length} ${quote.hops.length === 1 ? "hop" : "hops"}`;

  const placed = quote.placedUsd > 0 && disposition !== "none";
  const rem: RemainderSummary | null = placed
    ? disposition === "lp"
      ? {
          kind: "lp",
          label: "LP opened",
          tag: "LP",
          v: `${money(quote.placedUsd)} → ${get.symbol} pool · ~${lpAprPct(
            quote.placements[0]?.from.symbol ?? "",
            quote.placements[0]?.to.symbol ?? ""
          )}% APR`,
        }
      : {
          kind: "limit",
          label: "Limit placed",
          tag: "limit",
          v: `${money(quote.placedUsd)} → ${get.symbol} · GTC`,
        }
    : null;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-[404px]" onClick={(e) => e.stopPropagation()}>
        {/* No rail on the terminal card. A stepper says "you are partway
            through"; nothing follows Result, so a full bar is decoration that
            invites a sixth step. The remainder screens still map to "result"
            and still have actions, so only the settled card drops it. */}
        {exec.state.step !== "result" && <SwapStepper exec={exec} />}
        <div className="flex min-h-[430px] flex-col rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[18px] shadow-[0_1px_2px_rgba(20,40,60,.05),0_18px_44px_-22px_rgba(20,40,60,.28)]">
          <StepBody
            disposition={disposition}
            placedUsd={quote.placedUsd}
            filledUsd={quote.deliveredUsd}
            exec={exec}
            networkName={networkName}
            pay={pay}
            get={get}
            getN={getN}
            payLabel={payLabel}
            payUsd={money(quote.payUsd)}
            amountUsd={quote.payUsd}
            getUsd={money(endsWith * get.priceUsd)}
            /*
             * Says WHEN, because with a remainder the amount above is not one a
             * wallet holds when the dialog closes. "est." alone over a figure
             * that only exists once someone sells into the order would be the
             * more confident version of the same mistake.
             */
            /*
             * What this trade LEAVES BEHIND, when it leaves everything behind.
             *
             * Both dispositions end in a position rather than a delivery, so
             * both were reporting "0 ITRA · You receive". They are not the same
             * position, though: a limit order is a price and a quantity, an LP
             * band is a range and a yield, and the screens have to say which.
             */
            restKind={
              restsTo > 0 && quote.delivered <= 0 && disposition !== "none" ? disposition : null
            }
            lpApr={`~${lpAprPct(pay.symbol, get.symbol)}% APR`}
            lpPerDay={`≈ ${money((quote.payUsd * lpAprPct(pay.symbol, get.symbol)) / 100 / 365)} / day`}
            lpRange={`${tokNum(get.priceUsd, 2)} – ${tokNum(get.priceUsd * 1.04, 2)} ${pay.symbol}/${get.symbol}`}
            orderQty={`${tokNum(restsTo, getDec)} ${get.symbol}`}
            orderLimit={
              restsTo > 0
                ? `${tokNum(quote.amountIn / restsTo, displayDec(pay))} ${pay.symbol}`
                : "—"
            }
            orderCost={money(quote.payUsd)}
            marketNote={`Market · 1 ${get.symbol} = ${tokNum(get.priceUsd, get.priceUsd >= 100 ? 0 : 4)} USDC`}
            receiveNote={
              restsTo > 0 && quote.delivered <= 0
                ? `You receive when it fills · ${money(endsWith * get.priceUsd)}`
                : restsTo > 0
                  ? `${tokNum(quote.delivered, getDec)} now, rest when it fills · ${money(endsWith * get.priceUsd)}`
                  : `You receive · est. · ${money(endsWith * get.priceUsd)}`
            }
            rateLabel={rateLabel}
            impact={`${quote.impactPct.toFixed(2)}%`}
            minLabel={`${tokNum(quote.minReceived, getDec)} ${get.symbol}`}
            minNote={restsTo > 0 ? "on the part that fills now" : null}
            routeLabel={routeLabel}
            feeLabel={money(quote.feeUsd)}
            feeUsd={quote.feeUsd}
            networkFeeLabel={networkFeeLabel}
            rem={rem}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The visual stepper lives in Atoms/Stepper. What stays here is the mapping —
 * the execution machine has more states than the stepper has steps, and
 * collapsing them is this flow's knowledge, not the component's.
 */
const SWAP_STEPS = [
  { key: "review", label: "Review" },
  { key: "approve", label: "Approve" },
  { key: "confirm", label: "Confirm" },
  { key: "pending", label: "Pending" },
  { key: "result", label: "Result" },
] as const;

function SwapStepper({ exec }: { exec: SwapExecution }) {
  const { state } = exec;

  const mapped =
    state.step === "approveWait" || state.step === "approvePending"
      ? "approve"
      : state.step === "confirmWait"
        ? "confirm"
        // The remainder's steps all sit AFTER the swap, so the stepper shows the
        // swap as done rather than inventing a fourth pip: the trade really did
        // settle, and what is left is a separate transaction the screen below
        // explains on its own.
        : state.step === "remainder" ||
            state.step === "remainderApproveWait" ||
            state.step === "remainderWait" ||
            state.step === "remainderPending"
          ? "result"
          : state.step;

  const steps = SWAP_STEPS.map((s) => ({
    ...s,
    // Struck through rather than dimmed: a returning wallet with an allowance
    // does not pass through Approve at all, and 40% opacity read as
    // "disabled, still coming".
    skipped: s.key === "approve" && !state.needsApproval,
  }));

  return (
    /**
     * `bar`, not the default dot row.
     *
     * Five labelled dots do not fit the modal's width, so they wrapped — "5 Result"
     * dropped onto its own line under a dangling connector, which reads as a broken
     * layout rather than as progress. The bar states the same thing in one line that
     * cannot wrap at any width, and the step's name is still announced to a screen
     * reader through `Stepper`'s own `position` text.
     */
    <Stepper
      className="mb-4"
      shape="bar"
      label="Trade progress"
      steps={steps}
      activeIndex={SWAP_STEPS.findIndex((s) => s.key === mapped)}
    />
  );
}

interface StepBodyProps {
  exec: SwapExecution;
  networkName: string;
  pay: SwapToken;
  get: SwapToken;
  getN: string;
  payLabel: string;
  payUsd: string;
  getUsd: string;
  /** Sub-label under the receive leg — names WHEN the amount arrives. */
  receiveNote: string;
  /**
   * Set when nothing fills now and the whole order rests — so the screens
   * describe a POSITION rather than a delivery. Null on any trade that actually
   * moves tokens, which keeps the swap screens exactly as they were.
   */
  restKind: "limit" | "lp" | null;
  lpApr: string;
  lpPerDay: string;
  lpRange: string;
  orderQty: string;
  orderLimit: string;
  orderCost: string;
  marketNote: string;
  rateLabel: string;
  impact: string;
  minLabel: string;
  /** Qualifier for Min received when part of the order rests instead. */
  minNote: string | null;
  routeLabel: string;
  /** The venue's TAKER fee on this trade — a trading cost, not gas. */
  feeLabel: string;
  /** The same figure unformatted, so a zero row can be left out rather than printed. */
  feeUsd: number;
  /** Gas, in the chain's own asset. Its own row, because it is its own fee. */
  networkFeeLabel: string;
  rem: RemainderSummary | null;
  /** Which remainder disposition the card is on — the remainder screens differ. */
  disposition: Disposition;
  /** USD the quote says cannot fill now, for the remainder screen's copy. */
  placedUsd: number;
  /** USD that DID fill. Zero means no swap was sent, so the screen must not
   *  claim a trade happened — it is placing an order, not finishing one. */
  filledUsd: number;
  /** What this trade was worth, in USD. Gates the callout composer on the result
   *  screen against the same figure the server checks. */
  amountUsd: number;
  onClose: () => void;
}

const TX = "0x9a3f…4b21";

function StepBody(props: StepBodyProps) {
  const { exec, pay, get, networkName } = props;
  const { state } = exec;
  const needAppr = state.needsApproval && !state.approved;

  if (state.step === "review") {
    /*
     * An ORDER summary when nothing fills and the user chose to rest it.
     *
     * The swap rows describe an execution that is not happening: price impact,
     * min received and route all speak about crossing a book, and with an empty
     * book every one of them is zero or meaningless. What a limit order is made
     * of is quantity, price and cost — the three rows Robinhood's own limit
     * ticket carries — so the review shows those and nothing it cannot stand
     * behind. The market rate rides under the limit price the way a bid/ask
     * does there, because a limit with no market beside it is a number with no
     * scale.
     */
    if (props.restKind === "lp") {
      /*
       * An LP position is a RANGE and a yield, not an amount of the token.
       *
       * "0 ITRA · You receive" was as wrong here as on the limit side, and the
       * honest answer is different: this deposit becomes a single-sided band
       * that earns fees while it waits and converts as the price crosses it.
       *
       * Note what is deliberately NOT here — a share count. Shares are minted
       * at the pool's own scale, so the figure a client can compute is right
       * only for the first deposit into an empty band and silently wrong once
       * the band holds fees; apps/web/CLAUDE.md records that trap against the
       * portfolio's LP tab. The rows say what the deposit DOES, which is
       * knowable, rather than inventing the receipt for it.
       */
      return (
        <>
          <Head onBack={props.onClose} title={`Provide to the ${get.symbol} pool`} />
          <div className="mb-1 flex flex-col self-stretch text-left">
            <FRow k="You provide" v={`${props.payLabel} · single-sided`} />
            <FRow k="Range" v={props.lpRange} sub={props.marketNote} />
            <FRow k="Converts to" v={`${props.orderQty} across the band`} />
            <FRow k="Est. earnings" v={props.lpPerDay} sub={props.lpApr} />
            <FRow k="Network fee · est." v={props.networkFeeLabel} />
          </div>
          <p className="mt-2.5 text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
            Your {pay.symbol} earns fees while it waits, and converts to {get.symbol} as the price
            moves through your range. Manage or withdraw it any time from your portfolio.
          </p>
          <div className="flex-1" />
          <PrimaryButton
            onClick={() => (needAppr ? exec.toApprove() : exec.confirm())}
            label={needAppr ? `Approve ${pay.symbol}` : "Provide liquidity"}
          />
        </>
      );
    }
    if (props.restKind === "limit") {
      return (
        <>
          <Head onBack={props.onClose} title={`Buy ${get.symbol}`} />
          <div className="mb-1 flex flex-col self-stretch text-left">
            <FRow k={`Amount of ${get.symbol}`} v={props.orderQty} />
            <FRow
              k="Limit price"
              v={props.orderLimit}
              sub={props.marketNote}
            />
            <FRow k="Estimated cost" v={props.orderCost} />
            <FRow k="Good till" v="Cancelled" />
            <FRow k="Network fee · est." v={props.networkFeeLabel} />
          </div>
          <p className="mt-2.5 text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
            Nothing leaves your wallet until someone sells into this order. You can cancel it any
            time from your portfolio.
          </p>
          <div className="flex-1" />
          <PrimaryButton
            onClick={() => (needAppr ? exec.toApprove() : exec.confirm())}
            label={needAppr ? `Approve ${pay.symbol}` : "Place order"}
          />
        </>
      );
    }
    return (
      <>
        <Head onBack={props.onClose} title="Review trade" />
        <div className="mb-3.5 flex flex-col gap-1.5">
          <BigLeg token={pay} amount={props.payLabel} sub={`You pay · ${props.payUsd}`} />
          <div className="self-center text-base text-[color:var(--m-text-secondary-2)]">↓</div>
          <BigLeg
            token={get}
            amount={`${props.getN} ${get.symbol}`}
            sub={props.receiveNote}
          />
        </div>
        <ReviewRows {...props} />
        <div className="flex-1" />
        <PrimaryButton
          onClick={() => (needAppr ? exec.toApprove() : exec.confirm())}
          label={needAppr ? `Approve ${pay.symbol}` : "Confirm trade"}
        />
      </>
    );
  }

  if (state.step === "approve") {
    const perm = state.method === "permit";
    return (
      <>
        <Head onBack={exec.back} title={`Approve ${pay.symbol}`} />
        <div className="my-1.5 mb-3.5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--m-primary)]/15 text-2xl text-[color:var(--m-primary)]">
            {perm ? "🔑" : "📝"}
          </div>
          <p className="m-0 max-w-[34ch] text-[13px] text-[color:var(--m-text-secondary)]">
            Allow the Rate Router to use your {pay.symbol} for this trade.{" "}
            {perm ? (
              <>Signature only — <b className="text-[color:var(--m-text-primary)]">no gas</b>.</>
            ) : (
              <>A one-time on-chain approval — <b className="text-[color:var(--m-text-primary)]">costs a little gas</b>, then it&apos;s remembered.</>
            )}
          </p>
        </div>
        <div className="flex flex-col">
          <FRow k="Token" v={pay.symbol} />
          {/* The REAL router, from the execution that would sign the approval.
              This was the literal string "Router · 0x51…a7" — a mock-era
              placeholder that survived the real execution landing, so the card
              named one address while the transaction granted the allowance to
              another. A dash when the execution has no spender (the mock, or a
              chain with no router): naming nothing beats naming something
              plausible, which is exactly how the placeholder read. */}
          <FRow
            k="Spender"
            v={
              exec.spender
                ? `Router · ${exec.spender.slice(0, 6)}…${exec.spender.slice(-4)}`
                : "—"
            }
          />
          <div className="flex justify-between gap-3 border-t border-[color:var(--m-border)] py-1.5 text-[12.5px]">
            <span className="text-[color:var(--m-text-secondary)]">Amount</span>
            <span className="inline-flex rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-0.5">
              {[
                { u: false, label: `Exact ${props.payLabel.split(" ")[0]}` },
                { u: true, label: "Unlimited" },
              ].map((o) => (
                <button
                  key={String(o.u)}
                  type="button"
                  onClick={() => exec.setUnlimited(o.u)}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1 text-[11px] font-semibold",
                    state.unlimited === o.u
                      ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-sm"
                      : "text-[color:var(--m-text-secondary)]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </div>
          <FRow k="Method" v={perm ? "Permit2 · gasless" : "ERC-20 approve · ~$0.01 gas"} />
        </div>
        <div className="flex-1" />
        <FailureNote text={state.failure} />
        <PrimaryButton onClick={exec.approve} label={perm ? "Sign approval" : `Approve ${pay.symbol}`} />
      </>
    );
  }

  if (state.step === "approveWait") {
    const perm = state.method === "permit";
    return (
      <>
        <Head title={`Approve ${pay.symbol}`} />
        <Waiting
          networkName={networkName}
          title={perm ? "Sign in your wallet" : "Confirm in your wallet"}
          sub={
            perm
              ? `Approve the ${pay.symbol} allowance. A signature — no gas, no transaction.`
              : `Send the approval transaction so the Router can use your ${pay.symbol}.`
          }
        />
      </>
    );
  }

  if (state.step === "approvePending") {
    return (
      <>
        <Head title={`Approving ${pay.symbol}`} />
        <Waiting
          networkName={networkName}
          title="Confirming approval"
          sub={`The allowance transaction is mining on ${props.networkName}. The trade unlocks once it lands.`}
          hash={state.approvalTxHash ?? undefined}
        />
      </>
    );
  }

  if (state.step === "confirmWait") {
    return (
      <>
        <Head title="Confirm trade" />
        <Waiting
          networkName={networkName}
          title="Confirm in your wallet"
          sub={
            props.disposition === "none"
              ? "Sign the trade. One transaction settles everything."
              : // Never "one transaction settles everything" here — it does not.
                // The remainder is its own signature, and saying so before the
                // first one is what stops the second reading as a bug.
                "Sign the part that fills now. What is left needs a second signature."
          }
        />
      </>
    );
  }

  if (state.step === "pending") {
    return (
      <>
        <Head title="Trade submitted" />
        <Waiting
          networkName={networkName}
          title={`Confirming on ${props.networkName}`}
          sub="Your trade is in the mempool."
          hash={state.txHash ?? undefined}
        />
      </>
    );
  }

  if (state.step === "remainder") {
    /**
     * The swap settled; the remainder has not been placed.
     *
     * This screen exists because the two are separate transactions —
     * `BandSwapRouter.swap` has no resting mode, so "fill what you can and rest
     * the rest" is a swap followed by a `limitBuy`/`limitSell` or an
     * `addLiquiditySingleSided`. Pretending otherwise would put a second wallet
     * prompt in front of someone who was told the trade was done.
     *
     * Skip is a real option, not a cancel. The swap already happened and cannot
     * be undone, so leaving is a legitimate choice — the leftover simply stays
     * in the wallet, which is exactly what the "Refund unmatched" disposition
     * does anyway.
     */
    const label = props.disposition === "limit" ? "Place the order" : "Provide as liquidity";
    /*
     * NOTHING filled, so nothing was traded and no transaction was sent.
     *
     * This screen used to read "Traded 1 USDC" over a swap that matched zero and
     * refunded — it named a trade that had not happened, then asked for another
     * signature. When the book cannot take any of the order, execution skips the
     * swap entirely, so this is the FIRST signature, not the second, and the
     * screen says what is actually about to happen: an order gets placed.
     */
    const nothingFilled = props.filledUsd <= 0;
    return (
      <>
        <Head title={nothingFilled ? "Place your order" : "One step left"} />
        <div className="flex flex-1 flex-col items-center pt-1.5 text-center">
          <div
            className={cn(
              "mb-2.5 flex h-14 w-14 items-center justify-center rounded-full text-[26px]",
              nothingFilled
                ? "bg-[color:var(--m-primary)]/15 text-[color:var(--m-primary)]"
                : "bg-[color:var(--m-success)]/15 text-[color:var(--m-success)]",
            )}
          >
            {nothingFilled ? "◷" : "✓"}
          </div>
          <div className="text-[17px] font-semibold">
            {nothingFilled ? `Nobody is selling at this price` : `Traded ${props.payLabel}`}
          </div>
          <p className="mt-1.5 max-w-[34ch] text-[13px] leading-5 text-[color:var(--m-text-secondary)]">
            {nothingFilled
              ? `Place ${money(props.placedUsd)} as an order and it fills the moment someone sells into it. One signature, and nothing leaves your wallet until it fills.`
              : `The book filled what it could. ${money(props.placedUsd)} could not fill now — placing it takes a second transaction.`}
          </p>
          <div className="mt-4 flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="swap-place-remainder"
              onClick={exec.placeRemainder}
              className="h-11 w-full rounded-[15px] bg-[color:var(--m-primary)] text-[14px] font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
            >
              {label}
            </button>
            <button
              type="button"
              onClick={exec.skipRemainder}
              className="h-10 w-full rounded-[15px] text-[13px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
            >
              Leave it in my wallet
            </button>
          </div>
        </div>
      </>
    );
  }

  if (state.step === "remainderApproveWait" || state.step === "remainderWait") {
    return (
      <>
        <Head title="One step left" />
        <Waiting
          networkName={networkName}
          title="Confirm in your wallet"
          sub={
            state.step === "remainderApproveWait"
              ? // Its own allowance: the router's approval says nothing about
                // what the matching engine or the position manager may spend.
                "Approve the remainder, then sign the placement."
              : "Sign the placement."
          }
        />
      </>
    );
  }

  if (state.step === "remainderPending") {
    return (
      <>
        <Head title="Placing the remainder" />
        <Waiting
          networkName={networkName}
          title={`Confirming on ${props.networkName}`}
          sub="The swap is done; this places what was left."
          hash={state.remainderTxHash ?? undefined}
        />
      </>
    );
  }

  // result
  if (state.outcome === "failure") {
    return (
      <div className="flex flex-1 flex-col items-center pt-1.5 text-center">
        <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--m-error)]/15 text-[28px] font-bold text-[color:var(--m-error)]">
          !
        </div>
        <h3 className="mb-1 text-lg font-semibold text-[color:var(--m-text-primary)]">Trade didn&apos;t go through</h3>
        {/* The REAL reason when there is one. This paragraph used to assert a
            slippage revert unconditionally — a mock-era sentence that was a
            plain falsehood for the two failures that actually happen here: a
            wallet that cannot cover the fee, and a public RPC refusing the
            request. Both are pre-spend, so neither reverted anything. */}
        <p className="m-0 mb-1.5 max-w-[34ch] text-[13px] text-[color:var(--m-text-secondary)]">
          {state.failure ?? (
            <>
              Price moved beyond your <b className="text-[color:var(--m-text-primary)]">0.5%</b> slippage before it
              landed. The transaction reverted — <b className="text-[color:var(--m-text-primary)]">your funds are
              untouched</b>.
            </>
          )}
        </p>
        <div className="mt-3 flex w-full flex-col self-stretch text-left">
          <FRow k="Attempted" v={`${props.payLabel} → ${get.symbol}`} />
          {/* A transaction that never left the browser has no hash and did not
              revert. Printing one would send the reader to an explorer looking
              for something that does not exist. */}
          <FRow
            k="Status"
            v={state.txHash ? "Reverted · nothing spent" : "Not sent · nothing spent"}
            vClass="text-[color:var(--m-error)]"
          />
          {state.txHash && (
            <FRow k="Transaction" v={<TxLink hash={state.txHash} networkName={networkName} />} />
          )}
        </div>
        <div className="flex-1" />
        <div className="mt-3 flex w-full gap-2">
          <GhostButton onClick={props.onClose} label="Back" />
          <PrimaryButton onClick={exec.reset} label="Try again" inline />
        </div>
      </div>
    );
  }

  /*
   * ORDER PLACED, not "trade complete".
   *
   * When nothing filled, "Trade complete · +0 ITRA · Received in your wallet"
   * is false three times over: no trade completed, nothing was received, and
   * the wallet holds exactly what it did before. What happened is that an order
   * now rests on the book — so the screen reports the order: what it buys, how
   * much of it has filled so far, what it will cost, and where to go watch it.
   *
   * The shape is Robinhood's order-placed sheet (filled-of-total, cost, then
   * Done beside View order), which is the pattern every venue converges on
   * because the reader's next question is always "is it filled yet".
   */
  if (props.restKind) {
    const lp = props.restKind === "lp";
    return (
      <div data-testid="swap-result" className="flex flex-1 flex-col pt-1.5">
        <h3 className="mb-1 text-balance text-lg font-semibold text-[color:var(--m-text-primary)]">
          {lp ? `${get.symbol} position opened` : `${get.symbol} order placed`}
        </h3>
        <p className="m-0 mb-3 text-[13px] leading-5 text-[color:var(--m-text-secondary)]">
          {lp ? (
            <>
              Your {props.payLabel} is providing liquidity to the {get.symbol} pool. It earns fees
              while it waits and converts as the price moves through your range.
            </>
          ) : (
            <>
              Your limit order to buy {props.orderQty} has been placed. It fills when someone sells
              into it.
            </>
          )}
        </p>
        <div className="flex w-full flex-col self-stretch text-left">
          {lp ? (
            <>
              <FRow k="Provided" v={`${props.payLabel} · single-sided`} />
              <FRow k="Range" v={props.lpRange} sub={props.marketNote} />
              <FRow k="Converts to" v={`${props.orderQty} across the band`} />
              <FRow k="Est. earnings" v={props.lpPerDay} sub={props.lpApr} />
            </>
          ) : (
            <>
              <FRow k={`${get.symbol} bought`} v={`0 of ${props.orderQty}`} />
              <FRow k="Limit price" v={props.orderLimit} sub={props.marketNote} />
              <FRow k="Estimated cost" v={props.orderCost} />
              <FRow k="Good till" v="Cancelled" />
            </>
          )}
          {state.remainderTxHash && (
            <FRow
              k="Transaction"
              v={<TxLink hash={state.remainderTxHash} networkName={networkName} />}
            />
          )}
        </div>
        <div className="flex-1" />
        <div className="mt-3 flex w-full flex-col gap-2">
          <PrimaryButton onClick={props.onClose} label="Done" />
          <a
            href={`${buildPageUrl("portfolio")}?tab=${lp ? "lps" : "orders"}`}
            className="flex min-h-11 items-center justify-center text-center text-[13px] font-semibold text-[color:var(--m-primary-fg)] transition-[color,scale] hover:underline active:scale-[0.96]"
          >
            {lp ? "View position" : "View order"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="swap-result" className="flex flex-1 flex-col items-center pt-1.5 text-center">
      <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--m-success)]/15 text-[28px] font-bold text-[color:var(--m-success)]">
        ✓
      </div>
      {/* "Swapped", not "Trade complete". The card is a RECEIPT: it reports what
          happened rather than announcing an outcome, and the verb is what the
          user will look for when they scan a history later. */}
      <h3 className="mb-1 text-lg font-semibold text-[color:var(--m-text-primary)]">Swapped</h3>
      {/* BOTH LEGS ON ONE LINE, because that pair IS the trade.
          This was a headline (+0.9804 ITRA), a subtitle ("Received in your
          wallet.") and then two table rows (Paid, Delivered) carrying the same
          two numbers again — four restatements of one fact, and the only figure
          that says whether the fill was any good (the rate) sat fourth in the
          table below them. */}
      <div className="my-2 flex flex-wrap items-center justify-center gap-2 font-mono text-[19px] font-semibold">
        <span className="text-[color:var(--m-text-secondary)]">{props.payLabel}</span>
        <span className="text-[color:var(--m-text-tertiary)]">→</span>
        <span className="flex items-center gap-1.5 text-[color:var(--m-success)]">
          <TokenImageIcon symbol={get.symbol} color={tokenColor(get.symbol)} logoURI={get.logoURI} size="md" className="!h-[24px] !w-[24px]" />
          {props.getN} {get.symbol}
        </span>
      </div>
      <p className="m-0 font-mono text-[13px] text-[color:var(--m-text-secondary)]">{props.rateLabel}</p>
      <div className="mt-3 flex w-full flex-col self-stretch text-left">
        {props.rem && (
          <FRow
            k={props.rem.label}
            v={`${props.rem.v} ↗`}
            vClass="text-[color:var(--m-primary)]"
          />
        )}
        {/* A `$0` trading fee beside `~0.008 USDC` of gas is two rows in two unit
            systems that a reader cannot add. When the venue took nothing, the
            row saying so is noise — the network row is then the whole cost.
            `est.` stays: the swap's gas USED is not plumbed out of the receipt,
            and an estimate labelled as settled would be the worse error. */}
        {props.feeUsd > 0 && <FRow k="Trading fee" v={props.feeLabel} />}
        <FRow k="Network fee · est." v={props.networkFeeLabel} />
        <FRow
          k="Transaction"
          /* No block number. It was the hardcoded `#4,821,003` on every trade
             anyone ever made — a real-looking figure beside a real hash, which
             is worse than no figure at all. Nothing in SwapExecutionState
             carries one: the swap does not await its own receipt (only the
             approval does), so showing one means plumbing it through from
             `waitForTransactionReceipt` rather than inventing it. */
          v={<TxLink hash={state.txHash ?? TX} networkName={networkName} />}
        />
      </div>
      {/* A call is a claim about a trade you just made, so this is the moment to write
          one — the fill is on screen and needs no looking up. It used to live under the
          chart on the token page, where posting meant coming back later and finding the
          right fill in a dropdown.

          Gated on the same figure the server enforces (`THESIS_DISPLAY_MIN_USD`), and
          shown only when this trade clears it: a composer that appears and then refuses
          is worse than one that never appeared. */}
      {props.amountUsd >= THESIS_DISPLAY_MIN_USD && (
        <ThesisComposer
          className="mt-4 w-full self-stretch text-left"
          tokenAddress={get.address}
          tokenSymbol={get.symbol}
          networkName={props.networkName}
        />
      )}

      <div className="flex-1" />
      {/* One button, because there was only ever one action.
          "New trade" and "View in portfolio" both called `onClose` — same behaviour,
          two labels, and neither did what its label promised: closing the modal returns
          you to the swap card either way, and nothing navigated to the portfolio. Two
          controls that differ only in wording ask the user to choose between outcomes
          that do not exist. */}
      {/* `inline`, and `self-stretch` on the wrapper.
          Without `inline` the button adds its own `mt-3` on top of the wrapper's — two
          top margins stacked. And the result column is `items-center`, so a child has to
          be told to stretch or it shrinks to the width of its own label. */}
      {/* "Done", never "Confirm". The trade has SETTLED — the tokens are in the
          wallet and its hash is printed above this button. A control called
          Confirm on a finished trade asks for a decision that no longer exists,
          and invites a second one.

          "Trade again" is the action people actually want next, and it used to
          cost a modal close to reach. It resets the machine to Review rather
          than closing, so the card stays where the user already is. */}
      <div className="mt-3 flex w-full items-center gap-2 self-stretch">
        <PrimaryButton onClick={props.onClose} label="Done" inline />
        <button
          type="button"
          onClick={() => exec.reset()}
          className="shrink-0 rounded-xl border border-[color:var(--m-border)] px-3.5 py-2.5 text-[13px] font-medium text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)]"
        >
          Trade again
        </button>
      </div>
    </div>
  );
}

function ReviewRows(props: StepBodyProps) {
  return (
    <div className="flex flex-col">
      <FRow k="Rate" v={props.rateLabel} />
      <FRow
        k="Price impact"
        v={props.impact}
        vClass={parseFloat(props.impact) >= 1 ? "text-[color:var(--m-warning)]" : undefined}
      />
      <FRow
        k={props.minNote ? `Min received · ${props.minNote}` : "Min received · slip 0.5%"}
        v={props.minLabel}
      />
      <FRow k="Route" v={props.routeLabel} />
      {/* Two fees, two rows. This was one row labelled "Network fee" showing
          `quote.feeUsd` — the TAKER fee — which the live router returns as 0, so the
          number a user checks before signing was both mislabelled and always zero. */}
      <FRow k="Trading fee" v={props.feeLabel} />
      <FRow k="Network fee · est." v={props.networkFeeLabel} />
      {props.rem && (
        <div className="flex justify-between gap-3 border-t border-[color:var(--m-border)] py-1.5 text-[12.5px]">
          <span className="text-[color:var(--m-text-secondary)]">Remainder</span>
          <span className="text-right font-mono text-[color:var(--m-text-primary)]">
            {props.rem.v}
            <span
              className={cn(
                "ml-1.5 rounded-[5px] border px-1.5 py-px text-[10px]",
                props.rem.kind === "lp"
                  ? "border-[color:var(--m-logo)] text-[color:var(--m-logo)]"
                  : "border-[color:var(--m-primary)] text-[color:var(--m-primary)]"
              )}
            >
              {props.rem.tag}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function Head({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      {onBack && (
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="h-[30px] w-[30px] rounded-[9px] border border-[color:var(--m-border)] bg-transparent text-[15px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
        >
          ←
        </button>
      )}
      <h3 className="m-0 text-[17px] font-semibold text-[color:var(--m-text-primary)]">{title}</h3>
    </div>
  );
}

function BigLeg({ token, amount, sub }: { token: SwapToken; amount: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3.5 py-3">
      <TokenImageIcon symbol={token.symbol} color={tokenColor(token.symbol)} logoURI={token.logoURI} size="md" className="!h-[34px] !w-[34px]" />
      <div className="flex flex-col">
        <b className="font-mono text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--m-text-primary)]">{amount}</b>
        <span className="text-[11.5px] text-[color:var(--m-text-secondary-2)]">{sub}</span>
      </div>
    </div>
  );
}

/**
 * `v` takes a node, not only a string, so a row can hold a control.
 *
 * The Transaction row needs a link and a copy button; as a string it could only
 * ever be text, which is why a 66-character hash was being printed whole and
 * running off the card. `min-w-0` on the value is what lets the truncation
 * inside it actually happen — without it the flex item refuses to shrink below
 * its content and the ellipsis never appears.
 */
function FRow({
  k,
  v,
  vClass,
  sub,
}: {
  k: string;
  v: React.ReactNode;
  vClass?: string;
  /** A second line under the label — the market rate beside a limit price. */
  sub?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-t border-[color:var(--m-border)] py-1.5 text-[12.5px] first:border-t-0">
      <span className="shrink-0 text-[color:var(--m-text-secondary)]">
        {k}
        {sub && (
          <span className="mt-0.5 block font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
            {sub}
          </span>
        )}
      </span>
      <span className={cn("min-w-0 text-right font-mono tabular-nums text-[color:var(--m-text-primary)]", vClass)}>{v}</span>
    </div>
  );
}

/**
 * A transaction hash: shortened, openable, copyable.
 *
 * It was printed IN FULL — 66 monospace characters in a 404px card, so it
 * overflowed the pending pill and ran off the edge of the result screen's
 * Transaction row, taking the block number with it. A hash is not read; it is
 * followed or pasted, and both of those are actions rather than text.
 *
 * The middle is what an ellipsis may take. The first and last characters are
 * what a reader compares against their wallet's own list, and they are what
 * survives.
 *
 * Copy is a real button rather than "select the text": the text is now
 * truncated, so selecting it no longer yields the hash at all.
 */
function TxLink({ hash, networkName, suffix }: { hash: string; networkName: string; suffix?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const explorer = explorerUrlForNetwork(networkName);
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;

  /*
   * `navigator.clipboard` needs a SECURE CONTEXT. `localhost` is one; the
   * network address Next also prints — `http://172.30.1.51:3000` — is not, and
   * neither is any plain-http deployment. There the API is simply undefined.
   *
   * This used to swallow that in an empty catch, which is right about not
   * claiming a copy that did not happen and wrong about saying nothing at all:
   * the button looked identical before and after, so a reader who pressed it had
   * no way to tell it from a dead control. It now says it could not, and the
   * fallback is tried first so most of those cases simply work.
   */
  const copy = async () => {
    setFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hash);
      } else {
        // Deprecated, and the only thing that works without a secure context.
        const field = document.createElement("textarea");
        field.value = hash;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(field);
        if (!ok) throw new Error("execCommand refused");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2400);
    }
  };

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {explorer ? (
        <a
          href={`${explorer}/tx/${hash}`}
          target="_blank"
          // `noopener` is not optional on a target=_blank to a third-party
          // origin: without it the opened page gets a handle on this one.
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 truncate font-dm-mono text-[color:var(--m-primary)] hover:underline"
          title={hash}
        >
          <span className="truncate">{short}</span>
          {/* INSIDE the anchor. It used to be a sibling, so the one element that
              says "this opens somewhere" was the one element that did nothing —
              and an icon shaped like an action is where people click first. */}
          <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        // A chain with no explorer configured still shows the hash, because it
        // is the only thing that identifies the transaction anywhere else.
        <span className="truncate font-dm-mono text-[color:var(--m-text-primary)]" title={hash}>
          {short}
        </span>
      )}
      {suffix && <span className="shrink-0 text-[color:var(--m-text-secondary-2)]">· {suffix}</span>}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={failed ? "Could not copy — select the hash instead" : copied ? "Copied" : "Copy transaction hash"}
        title={failed ? "Copying is blocked here. Open the explorer instead." : undefined}
        className={cn(
          "shrink-0 rounded p-0.5 transition-colors hover:text-[color:var(--m-text-primary)]",
          failed ? "text-[color:var(--m-error)]" : "text-[color:var(--m-text-secondary-2)]",
        )}
      >
        {copied ? (
          <Check aria-hidden className="h-3 w-3" />
        ) : (
          <Copy aria-hidden className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

function Waiting({ title, sub, hash, networkName }: { title: string; sub: string; hash?: string; networkName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
      <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-[color:var(--m-border)] border-t-[color:var(--m-primary)] motion-reduce:animate-none" />
      <h3 className="m-0 text-[17px] font-semibold text-[color:var(--m-text-primary)]">{title}</h3>
      <p className="m-0 max-w-[32ch] text-[13px] text-[color:var(--m-text-secondary)]">{sub}</p>
      {hash && (
        <>
          <div className="mt-1 flex max-w-full items-center gap-2 rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3 py-2 text-[12px]">
            <TxLink hash={hash} networkName={networkName} />
          </div>
          <div className="mt-0.5 h-[5px] w-[180px] overflow-hidden rounded-[3px] bg-[color:var(--m-surface-2)]">
            <span className="block h-full w-[45%] animate-pulse rounded-[3px] bg-[color:var(--m-primary)] motion-reduce:animate-none" />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Why the last attempt did not go through, in the CARD.
 *
 * Not only a toast: every `<Toaster>` in this app is bottom-right, which is
 * where a wallet extension's panel sits, so the one surface guaranteed to be
 * read is the card holding the button that failed. A 429 from the chain's
 * public RPC was reaching neither — the catch discarded it and moved the step
 * back, which on screen is a button that does nothing.
 */
function FailureNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-3 rounded-[12px] border border-[color:var(--m-error)]/40 bg-[color:var(--m-error)]/10 px-3 py-2 text-[11.5px] leading-4 text-[color:var(--m-error-fg)]">
      {text}
    </p>
  );
}

function PrimaryButton({ onClick, label, inline }: { onClick: () => void; label: string; inline?: boolean }) {
  return (
    <button
      type="button"
      /* One id for the flow's only CTA, whatever it currently says — Confirm
         trade, Place order, Provide liquidity, Done. A spec that clicked the
         label would be asserting the copy twice and breaking on the wording
         rather than on the behaviour. */
      data-testid="swap-primary"
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-[14px] bg-[color:var(--m-primary)] px-4 py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] transition-[background-color,scale] hover:bg-[color:var(--m-primary-hover)] active:scale-[0.96] motion-reduce:active:scale-100",
        !inline && "mt-3"
      )}
    >
      {label}
    </button>
  );
}

function GhostButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full cursor-pointer rounded-[14px] border border-[color:var(--m-border)] bg-transparent px-4 py-3.5 text-[15px] font-semibold text-[color:var(--m-text-primary)]"
    >
      {label}
    </button>
  );
}

