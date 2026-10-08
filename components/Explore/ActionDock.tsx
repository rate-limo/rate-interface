"use client";

import Link from "next/link";
import type { DepositShape } from "@/lib/liquidity/shape";
import { formatPct } from "@/lib/pair/derive";
import { useEffect, useMemo, useState } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { PoolRiskNote } from "@/components/Liquidity/PoolRiskNote";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";
import { normalizeAmountInput } from "@/utils/numberInput";
import { remainderSplit } from "@/lib/swap/remainder";
import type { Disposition } from "@/lib/swap/types";
import { formatSubscriptDecimal, formatUsd } from "@/utils/number";
import { tokenColor } from "@/lib/portfolio/mock";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { SwapFlow } from "@/components/Swap/SwapFlow";
import { useRealSwapExecution } from "@/components/Swap/execution";
import { useDepositApr } from "@/hooks/useDepositApr";
import { useWalletConnect } from "@/lib/wallet";
import { useAccount } from "wagmi";
import { useRouteQuote } from "@/lib/swap/routeQuote";
import { useLadderTrade } from "@/hooks/useLadderTrade";
import { REFUND_NOTE } from "@/lib/launch/ladderBuy";
import { applyQuoteDisplay, useQuoteDisplay } from "@/lib/chains/useQuoteDisplay";
import type { SwapToken } from "@/lib/swap/types";
import type { SpotPair } from "@/types";

/**
 * The Action Dock — Buy · Sell · LP.
 *
 * ## What changed, and what deliberately did not
 *
 * The layout follows a reference the operator supplied: a segmented control
 * with a sliding pill, one oversized amount field, preset chips, a payment-asset
 * row with Max, and a quick-action strip under the CTA. Three things in that
 * reference are NOT reproduced, on purpose:
 *
 *  - **Its class names.** It was written against another app's Tailwind
 *    (`bg-bg-secondary`, `text-text-primary`, `border-border-secondary`). None
 *    of those exist here, so pasting the markup verbatim renders an unstyled,
 *    untheme-able card. Everything below uses this app's `--m-*` tokens, which
 *    is also what makes it work in both light and dark.
 *  - **Its accent.** The reference hardcodes one product's green. Buy uses
 *    `--m-success`, Sell `--m-error`, LP `--m-primary`, so the control carries
 *    the meaning of the action rather than a borrowed brand.
 *  - **Its footer.** "Cross-chain swap via Relay" describes someone else's
 *    router. Ours names the route this dock actually takes.
 *
 * ## The CTA still deep-links, and says so
 *
 * There is no in-dock Review → Approve → Confirm machine yet (the previous
 * version's docstring called that phase 2, and it is still phase 2). So the
 * button carries the entered amount into the surface that can execute it rather
 * than pretending to fill here. It is disabled until an amount exists, which is
 * what the reference's "Enter an amount" state is for.
 */

export type DockTab = "buy" | "sell" | "lp";

const TABS: { key: DockTab; label: string }[] = [
  { key: "buy", label: "Buy" },
  { key: "sell", label: "Sell" },
  { key: "lp", label: "LP" },
];

/** The accent each side owns. Semantic, not decorative. */
const ACCENT: Record<DockTab, string> = {
  buy: "var(--m-success)",
  sell: "var(--m-error)",
  lp: "var(--m-primary)",
};

const USD_PRESETS = [25, 100, 250];
const SELL_PRESETS = [25, 50, 100];

const EMPTY_TOKEN: SwapToken = {
  symbol: "",
  name: "",
  address: "",
  decimals: 18,
  chainId: 0,
  priceUsd: 0,
};

/**
 * Dollars, through the app's one formatter.
 *
 * This was a local `toLocaleString({ maximumFractionDigits: 2 })`, which
 * rendered a real 0.0001 USDC balance as **`$0.00`** — a figure reserved for an
 * exact zero, beside a chip that also said `0.0001 USDC`. `formatUsd` carries
 * the subscript-zero rule for exactly this range.
 */
const usd = formatUsd;

/**
 * A token amount for the rail: subscript below 1, four decimals above it.
 *
 * The unfilled note printed `9.066196836199511 DONUT` — a float straight off
 * the quote. Fifteen digits do not make a figure more accurate to read, they
 * make it unreadable, and in a 300px rail they wrapped one sentence onto three
 * lines.
 */
const amt = (n: number): string =>
  formatSubscriptDecimal(n, { digits: 4 }) ??
  n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/**
 * Is the wallet short of what this trade would spend?
 *
 * ## The bug
 *
 * The dock quoted, labelled and armed a trade against a balance it never looked
 * at. A wallet holding 0 USDC got a live "Buy VF15CK" button, and the first
 * thing to say otherwise would have been the wallet's own rejection — after a
 * signature prompt, which is the most expensive place to learn it.
 *
 * ## Both tabs, one comparison
 *
 * Buying spends the quote asset and selling spends the base, and the dock's
 * `amountAsset`/`balance` already follow that split — so the caller passes the
 * spend and the holding of the SAME token whichever tab is open.
 *
 * ## Disconnected is never "insufficient"
 *
 * There is no balance to read, and `balance` defaults to 0 — so without this
 * gate every disconnected visitor would be told their funds were short, which
 * describes their wallet rather than the app's ignorance of it. The dock's
 * primary button says "Connect wallet" in that state and must keep saying it.
 *
 * Exported for direct unit testing: the dock itself needs MarketPageProvider,
 * `useLiveSwapTokens` and `useRouteQuote` to mount, so the rule is pinned here
 * rather than behind three mocks — the same reason `PaymentAsset` is exported.
 */
export function isShort(spend: number, balance: number, connected: boolean): boolean {
  if (!connected) return false;
  // Not `>=`: spending a balance to the last unit is a legitimate trade, and
  // refusing it would make Max unusable — Max sets exactly this number.
  return spend > balance;
}

/**
 * The shapes the deposit page offers, in its order and its words.
 *
 * Deliberately the same four, because this control hands its answer to that
 * page: a dock that named them differently would make the two screens look
 * like different features. `auto` leads and is the default here for the same
 * reason it is there — it is measured from the pair's own trading rather than
 * guessed by someone who has just met this market.
 */
const DOCK_SHAPES: ReadonlyArray<{ key: DepositShape; name: string; blurb: string }> = [
  { key: "auto", name: "Auto", blurb: "From this pair's own trading" },
  { key: "spot", name: "Spot", blurb: "Even across every band" },
  { key: "curve", name: "Curve", blurb: "Most in the tightest band" },
  { key: "wide", name: "Wide", blurb: "Most in the outer bands" },
];

export function ActionDock({
  pair,
  pairs = [],
  onPairChange,
  tab,
  onTabChange,
  className,
}: {
  /** The bound market. Its BASE is what the page is about. */
  pair: SpotPair | null;
  /**
   * Every market for that same base, so the quote is a choice made HERE.
   *
   * This used to be a separate "Quoted in" card sitting above the dock, which
   * split one decision across two surfaces: the card chose what you pay with,
   * the dock spent it. Picking the payment asset is part of the buy form, so it
   * lives in the form. Omit or pass one pair and the selector hides itself —
   * a single inert chip implies a choice that is not there.
   */
  pairs?: SpotPair[];
  onPairChange?: (pairId: string) => void;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  className?: string;
}) {
  const { displayNetworkSlug, displayNetworkName, tokenListWithBalance, displayChainId } =
    useMarketPageContext();
  const { open: openWallet } = useWalletConnect();
  const { isConnected } = useAccount();
  const slug = displayNetworkSlug;

  // An operator's ordering and hiding, applied to the markets the page found.
  // Failure yields no curation, which leaves `pairs` in its own depth order —
  // exactly how the picker behaved before this existed.
  const { data: quoteConfig } = useQuoteDisplay(displayChainId);
  const offered = useMemo(
    () =>
      applyQuoteDisplay(
        // `symbol` is required for the built-in USDC/USDT/native preference to
        // apply — without it every quote looks unopinionated and falls to depth.
        pairs.map((p) => ({ pair: p, quoteAddress: p.quote.id, symbol: p.quoteSymbol })),
        quoteConfig ?? [],
      ).map((entry) => entry.pair),
    [pairs, quoteConfig],
  );

  const [amount, setAmount] = useState("");
  /**
   * The field's type size, shrinking as the number gets longer.
   *
   * It was a fixed 56px, which is right for `$25` and wrong the moment a real
   * amount is typed: a sub-cent figure in subscript-free digits already fills
   * the rail at six characters, and the next keystroke clips or reflows the
   * card. Sizing off the LENGTH keeps the whole number visible, which on a
   * field that decides how much money moves is the only acceptable outcome.
   *
   * 56px up to six characters, then 4px per character down to a 30px floor —
   * below that it stops reading as the screen's headline figure and the
   * hierarchy inverts against the preset chips.
   */
  const amountFontPx = Math.max(30, 56 - Math.max(0, amount.length - 6) * 4);
  /** false = the field is USD; true = the field is the asset itself. */
  const [inAsset, setInAsset] = useState(false);
  /**
   * How the deposit SPREADS ACROSS BANDS — the same question the deposit page
   * asks, in the same vocabulary, defaulting to the same answer.
   *
   * It was three price tolerances, `±5% / ±10% / Full`, and they described
   * nothing this venue has. A band's width is a fraction of the pair's
   * slippage limit, not a percentage of price the LP picks: measured on Arc's
   * TITER/USDC the ladder is ±0.02% / ±0.06% / ±0.10%, so every option here was
   * two orders of magnitude wide and none of them named a band. The chips fed
   * `minPrice`/`maxPrice` into the APR estimate and nothing else — the deposit
   * itself is a deep link, which dropped the choice on the way out.
   */
  const [shape, setShape] = useState<DepositShape>("auto");
  /**
   * What happens to the part of the order the book cannot take.
   *
   * `"none"` — refund — is the default and must stay the default: a rail that
   * silently rests an unfilled remainder opens a position the user never asked
   * for, which is the reason this control did not exist at all until now. What
   * changed is that the other two stopped being invisible; a pure swap that
   * leaves no stray position is still one click.
   */
  const [disposition, setDisposition] = useState<Disposition>("none");
  /** Which side of a single-sided band the LP tab is providing. */
  const [lpSide, setLpSide] = useState<"base" | "quote">("base");
  const [flowOpen, setFlowOpen] = useState(false);
  const [lpBase, setLpBase] = useState("");
  const [lpQuote, setLpQuote] = useState("");

  /*
   * A disposition belongs to the trade it was chosen for. Changing the market or
   * the direction makes it a decision about something else — resting a leftover
   * of a market the user has navigated away from is the failure this whole
   * control is being careful about.
   */
  useEffect(() => {
    setDisposition("none");
  }, [pair?.id, tab]);

  const liveTokens = useLiveSwapTokens(displayNetworkName, Boolean(pair));
  const tokens = liveTokens.data ?? [];
  const quoteToken = tokens.find((t) => t.symbol === pair?.quoteSymbol) ?? EMPTY_TOKEN;
  const baseToken = tokens.find((t) => t.symbol === pair?.baseSymbol) ?? EMPTY_TOKEN;

  // Buying spends the quote asset; selling spends the base asset. Everything
  // below — the balance, Max, the payment row — follows from that one fact.
  const spending = tab === "sell" ? baseToken : quoteToken;
  const spendingSymbol = tab === "sell" ? pair?.baseSymbol : pair?.quoteSymbol;

  const held = useMemo(
    () => (tokenListWithBalance ?? []).find((t) => t.symbol === spendingSymbol),
    [tokenListWithBalance, spendingSymbol],
  );
  const balance = held?.balance ?? 0;
  const balanceUsd = held?.valueUSD ?? 0;

  // The quick-sell row is visible on the BUY tab too, so it cannot read the
  // "currently spending" balance — on that tab it would be the quote's.
  const baseBalance = useMemo(
    () => (tokenListWithBalance ?? []).find((t) => t.symbol === pair?.baseSymbol)?.balance ?? 0,
    [tokenListWithBalance, pair?.baseSymbol],
  );
  const quoteBalance = useMemo(
    () => (tokenListWithBalance ?? []).find((t) => t.symbol === pair?.quoteSymbol)?.balance ?? 0,
    [tokenListWithBalance, pair?.quoteSymbol],
  );

  /**
   * The LP tab provides ONE asset, and this is which.
   *
   * A band position is single-sided by construction — the manager's entry point
   * is `addLiquiditySingleSided`, and the quote answers `singleSided` per
   * market. The tab used to render a base field and a quote field side by side,
   * which is the shape of a two-sided v3 range: a position the liquidity spec
   * explicitly refuses here, because it parks the provider in impermanent loss
   * and belongs in a separate Earn tab.
   *
   * Picking the side IS the directional call. The base side converts to quote as
   * price rises through the band; the quote side converts to base as it falls.
   */
  const lpSymbol = lpSide === "base" ? pair?.baseSymbol : pair?.quoteSymbol;
  const lpBalance = lpSide === "base" ? baseBalance : quoteBalance;
  const lpAmount = lpSide === "base" ? lpBase : lpQuote;
  const setLpAmount = (next: string) => {
    // Only the chosen side carries a number. Leaving a stale figure on the other
    // one would send the APR query a two-sided deposit the pool cannot take.
    if (lpSide === "base") {
      setLpBase(next);
      setLpQuote("");
    } else {
      setLpQuote(next);
      setLpBase("");
    }
  };

  // One number drives everything; the toggle only changes which unit the field
  // is expressed in, never what was meant.
  const typed = Number(amount);
  const typedIsNumber = Number.isFinite(typed) && typed > 0;
  const price = spending.priceUsd || 0;
  const amountUsd = !typedIsNumber ? 0 : inAsset ? typed * price : typed;
  const amountAsset = !typedIsNumber ? 0 : inAsset ? typed : price > 0 ? typed / price : 0;

  const route = useRouteQuote({
    networkName: displayNetworkName,
    pay: spending,
    get: tab === "sell" ? quoteToken : baseToken,
    tokens,
    amountIn: amountAsset,
    slippagePct: 0.005,
    enabled: Boolean(pair && spending.address && amountAsset > 0 && tab !== "lp"),
  });
  // A launch coin still selling its ladder: buys are walked across the steps and
  // both sides go out fill-or-refund — see hooks/useLadderTrade. Everything
  // below reads `quote`, so the ladder and the ordinary route share one path.
  const ladder = useLadderTrade({
    networkName: displayNetworkName,
    pay: spending,
    get: tab === "sell" ? quoteToken : baseToken,
    amountIn: amountAsset,
    slippage: 0.005,
    liveQuote: route.quote,
    enabled: Boolean(pair && amountAsset > 0 && tab !== "lp"),
  });
  const quote = ladder.active ? ladder.quote : route.quote;
  const quoteError = ladder.buy ? null : route.error;

  /*
   * No bounds. The estimator takes them to describe a v3 RANGE, and a band
   * deposit has no range to send — its bands are the pool's, at widths the
   * pool sets. Passing the old chips' invented ±5% asked the gateway to price
   * a position nobody could open.
   */
  const lpBounds = {};

  const lpApr = useDepositApr({
    networkName: displayNetworkName,
    base: pair?.base?.id,
    quote: pair?.quote?.id,
    amountBase: Number(lpBase) || 0,
    amountQuote: Number(lpQuote) || 0,
    ...lpBounds,
    enabled: tab === "lp",
  });

  const receiving = tab === "sell" ? pair?.quoteSymbol : pair?.baseSymbol;
  // One source for the split and the resting price, shared with the execution
  // that actually posts the order — see `lib/swap/remainder` for the 27.6%
  // mispricing that came of deriving it twice.
  const { unfilled, filled, restsTo, restPrice } = remainderSplit(quote);
  /**
   * `6.5581 filled · 2.4419 refunded` — the split, in the asset being spent.
   *
   * It was a sentence naming both totals ("Only X of Y fills now — the rest is
   * refunded"), which said the same thing in three lines of a 300px rail. Two
   * labelled figures are the whole content; a reader can subtract.
   */
  const splitNote =
    ladder.active ? REFUND_NOTE : unfilled > 0 && quote ? `${amt(filled)} filled · ${amt(unfilled)} refunded` : "";
  /**
   * What the WHOLE input is worth — the conversion, not the execution.
   *
   * `delivered` is only the part the book can take right now, so on a thin
   * market the ≈ line answered a question nobody asked: type 9.05713 DONUT and
   * it read 6.5089 USDC, which is neither the conversion of what was typed nor
   * anything the reader could tie back to the field above it.
   *
   * `delivered + Σ placements.outAmount` is the quote's own arithmetic for the
   * full amount: `outAmount` is each unfillable part valued at its resting
   * price, so the sum is what the input converts to. It matches the balance
   * chip's own `≈ $8.99` for the same tokens, which is the check that this is
   * the figure a reader is already holding in their head.
   *
   * The execution reality has not gone anywhere — it is the line underneath,
   * which says how much of that fills now and how much comes back. Conversion
   * first, then what the market can actually do with it.
   */
  const converted = quote
    ? quote.delivered + quote.placements.reduce((sum, p) => sum + p.outAmount, 0)
    : 0;
  /*
   * There is deliberately NO rate line here.
   *
   * One was added and removed across two commits: first beside the delivered
   * amount, then underneath it. Both crowded the answer, and neither earned the
   * room — the page already states the market's rate above the dock, and a
   * reader who wants it can read it there. What this rail owes them is what
   * they get and what comes back, which is what the two lines below say.
   */

  const estimate = !(amountAsset > 0)
    ? ""
    : route.loading && !ladder.buy
      ? "Finding a route…"
      : quoteError
        ? quoteError
        : quote
          ? // The delivered amount AND the price it fills at. With a partial
            // fill those are the two numbers that reconcile the screen: 9 DONUT
            // in and 6.5089 USDC out reads as a mispriced trade until the rate
            // sits on the same line. Subscript-zero below 1 like every other
            // figure here — a launch token's delivery routinely sits under a
            // hundredth, and a fixed decimal cap turns that into a run of zeros.
            `≈ ${amt(converted)} ${receiving ?? ""}`
          : "";

  /**
   * How much of the order the book CANNOT take right now.
   *
   * Without this the estimate is a number nobody can reconcile: selling 9 DONUT
   * at a stated rate of 0.9925 showed "≈ 6.50893212 USDC", which looks like a
   * pricing bug and is not one. The gateway's own figures for that quote were
   * `bookDepthIn: 6.558118` against `amountIn: 9` — the market held 6.56 DONUT
   * of bids and no more, so 2.44 DONUT could not fill at any price.
   *
   * The swap card has a fill-split bar for exactly this. The dock has no room
   * for one, but silence is the wrong economy: a rate and a delivered amount
   * that disagree, with nothing explaining why, reads as the app being wrong
   * about the price.
   *
   * `disposition="none"` here, so the leftover is REFUNDED rather than rested —
   * see the SwapFlow mount below. The wording says refunded because that is
   * what this surface actually does with it.
   */

  // LP still deep-links: the deposit flow is a page with a band picker, a range
  // chart and a shape control, none of which belongs in a 550px rail.
  /*
   * The choice travels with the link.
   *
   * This carried only the pair, so a person who typed an amount and picked a
   * shape landed on an empty deposit form and started again — the dock asked
   * three questions and threw two of the answers away. `shape` and `amount`
   * are read back by `LiquidityFlow`, so the page opens on what was chosen
   * here.
   */
  const lpHref = pair
    ? buildPageUrl("pool", {
        slug,
        deposit: true,
        base: pair.baseSymbol,
        quote: pair.quoteSymbol,
        shape,
        /*
         * WHICH token, not just how much. The card asks the LP to pick a side
         * and the link dropped it, so the deposit page opened on its own default
         * — the base token — after someone had explicitly chosen the quote.
         * Reading the amount off `lpSide` too, rather than preferring whichever
         * field happened to be filled.
         */
        one: lpSide,
        amount: Number(lpAmount) > 0 ? lpAmount : undefined,
      })
    : buildPageUrl("trade", { pro: true, slug });

  const getToken = tab === "sell" ? quoteToken : baseToken;

  /**
   * Buy and Sell EXECUTE here. They used to be a `<Link>` to /trade/pro, which
   * carried the market but silently dropped the amount the user had just typed,
   * landing them on an order-book terminal to start again — for what they had
   * expressed as one tap. A dock whose primary action is "go somewhere else" is
   * not a ticket.
   *
   * Nothing new is built for this: `SwapFlow` is the same Review -> Approve ->
   * Confirm -> Pending -> Result machine the swap card mounts, and
   * `useRealSwapExecution` is the same BandSwapRouter path — real allowance
   * check, real approve, real `swap()`. Reusing both is what keeps one
   * definition of "what a swap does" instead of a second one in the rail.
   */
  const canExecute = ladder.order
    ? Boolean(pair && getToken.address && quote && quote.delivered > 0)
    : Boolean(pair && getToken.address && route.quote?.execution && !route.loading && !route.error);

  const insufficientBalance = isShort(amountAsset, balance, isConnected);

  function onPrimary() {
    if (!isConnected) {
      openWallet();
      return;
    }
    if (!canExecute || insufficientBalance) return;
    setFlowOpen(true);
  }

  const ctaLabel = !pair
    ? "Pick a market"
    : !isConnected
      ? "Connect wallet"
      : route.loading && !ladder.buy
        ? "Finding a route…"
        : insufficientBalance
          ? // Named, not merely disabled: a dead button with a trade label on it
            // reads as the app being broken. `SwapCard` words it identically.
            `Insufficient ${spendingSymbol ?? "balance"}`
          : (quoteError ??
          /*
           * The label names BOTH transactions when a disposition is set.
           *
           * "Sell DONUT" on a click that also opens a maker order describes half
           * of what the button does, and the half it omits is the one that
           * leaves a position behind. Long is the right trade here.
           */
          (disposition !== "none" && unfilled > 0
            ? `${tab === "buy" ? "Buy" : "Sell"} ${amt(filled)}, ${
                disposition === "limit" ? "rest" : "provide"
              } ${amt(unfilled)}`
            : `${tab === "buy" ? "Buy" : "Sell"} ${pair.baseSymbol}`));

  // Connecting is always available — gating it behind an amount is what makes a
  // disconnected dock look broken rather than unstarted.
  const ready = Boolean(pair) && (tab === "lp" || amountUsd > 0 || !isConnected);
  const accent = ACCENT[tab];

  return (
    <section
      aria-label="Action dock"
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[12px] border border-solid",
        "border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4",
        className,
      )}
    >
      {/* The pill is one absolutely-positioned element that slides, rather than a
          background on each button: three separate backgrounds cross-fade and
          read as a flicker at this size. `left` is driven off the index so the
          track never needs to know how many tabs there are. */}
      <div
        role="tablist"
        aria-label="Dock action"
        className="relative grid h-10 w-full grid-cols-3 items-center overflow-hidden rounded-full bg-[color:var(--m-surface-2)] p-1"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 rounded-full transition-[left] duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: "calc((100% - 0.5rem) / 3)",
            left: `calc(0.25rem + ${TABS.findIndex((t) => t.key === tab)} * ((100% - 0.5rem) / 3))`,
            background: accent,
          }}
        />
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            data-testid={`dock-tab-${t.key}`}
            aria-selected={tab === t.key}
            onClick={() => onTabChange(t.key)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-transparent px-3 py-1.5",
              "text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-[color:var(--m-primary)]",
              tab === t.key
                ? "text-[color:var(--m-on-primary)]"
                : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!pair ? (
        <p className="rounded-xl bg-[color:var(--m-surface-2)] px-3 py-6 text-center text-xs leading-relaxed text-[color:var(--m-text-secondary)]">
          Pick a market to continue.
        </p>
      ) : tab === "lp" ? (
        <div className="flex flex-col gap-3">
          {/* WHICH SIDE. A band takes one asset, so this is the whole
              directional decision — not a pair of deposit fields, which would
              describe a two-sided range this venue does not offer here. */}
          <div className="flex flex-col gap-1.5">
            <span className="font-dm-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary-2)]">
              Provide
            </span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { side: "base" as const, symbol: pair.baseSymbol, held: baseBalance },
                { side: "quote" as const, symbol: pair.quoteSymbol, held: quoteBalance },
              ]).map((option) => (
                <button
                  key={option.side}
                  type="button"
                  aria-pressed={lpSide === option.side}
                  onClick={() => {
                    setLpSide(option.side);
                    // The amount is denominated in the OLD asset, so it cannot
                    // survive the switch — the same rule the withdraw panel
                    // follows when its asset changes.
                    setLpBase("");
                    setLpQuote("");
                  }}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    lpSide === option.side
                      ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-selected)]"
                      : "border-[color:var(--m-border)] hover:border-[color:var(--m-text-secondary-2)]",
                  )}
                >
                  <span className="text-[12px] font-semibold text-[color:var(--m-text-primary)]">
                    {option.symbol}
                  </span>
                  <span className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
                    {amt(option.held)} held
                  </span>
                </button>
              ))}
            </div>
          </div>

          <DepositField
            symbol={lpSymbol ?? ""}
            logoURI={lpSide === "base" ? pair.base.logoURI : pair.quote.logoURI}
            value={lpAmount}
            onChange={setLpAmount}
          />

          {/* The amount control the tab never had — the same chips the Sell tab
              uses, in the same place, so moving between tabs is not learning a
              second control. MAX rather than 100%: it is a balance, and the
              percent chips above it already read as fractions of one. */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { label: "25%", share: 0.25 },
              { label: "50%", share: 0.5 },
              { label: "MAX", share: 1 },
            ]).map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={!(lpBalance > 0)}
                onClick={() => setLpAmount(String(Number((lpBalance * preset.share).toFixed(6))))}
                className="rounded-lg border border-[color:var(--m-border)] px-2 py-2 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] text-[color:var(--m-text-secondary)]">
              Spread across bands
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {DOCK_SHAPES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`dock-shape-${option.key}`}
                  onClick={() => setShape(option.key)}
                  aria-pressed={shape === option.key}
                  title={option.blurb}
                  className={cn(
                    "rounded-lg border px-2 py-2 font-dm-mono text-[11px] transition-colors",
                    shape === option.key
                      ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-selected)] text-[color:var(--m-primary-fg)]"
                      : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
                  )}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
          {/*
            No fee-tier row. It printed a constant 0.30%, which is a v3 concept
            this venue does not have: the fee is the engine's taker fee times a
            PER-BAND multiplier, so one number cannot state it and 0.30% was not
            any of them.
          */}
          {/* Estimated APR — the figure this tab never had. It is a function of
              the amount AND the band, so it only exists once an amount is typed;
              before that there is no deposit to estimate and a number here would
              be describing nothing.

              Three outcomes, kept apart on purpose. A real percentage. `0%` for
              an out-of-range band, which genuinely earns nothing until price
              enters it. And an em-dash when the gateway declines to answer —
              either the pair has no indexed volume, or the market has an order
              book but no pool, which on this venue is common and is not an
              error. Collapsing the last two into "0%" would report a measured
              zero yield where there was no measurement. */}
          <div className="flex justify-between font-dm-mono text-[11px]">
            <span className="text-[color:var(--m-text-secondary)]">Est. APR</span>
            {Number(lpBase) + Number(lpQuote) <= 0 ? (
              <span className="text-[color:var(--m-text-secondary-2)]">enter an amount</span>
            ) : lpApr.loading ? (
              <span className="text-[color:var(--m-text-secondary-2)]">estimating…</span>
            ) : lpApr.data?.aprPct === null || lpApr.data === null ? (
              <span
                className="text-[color:var(--m-text-secondary-2)]"
                title="No estimate available: this market has no indexed volume yet, has an order book but no pool, or is a band pool — whose fee inputs are not recorded yet."
              >
                —
              </span>
            ) : !lpApr.data.inRange ? (
              <span title="This band does not straddle the current price, so it earns nothing until price enters it.">
                0% · out of range
              </span>
            ) : (
              <span className="font-semibold text-[color:var(--m-logo)]">
                ~{formatPct(lpApr.data.aprPct)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* The amount. `field-sizing:content` lets the input grow with the
              value so the currency mark stays glued to the number instead of
              floating at a fixed offset. */}
          <div className="relative flex w-full min-w-0 flex-col items-stretch gap-2 py-3">
            <div className="flex min-h-[68px] min-w-0 items-center justify-center gap-2 overflow-hidden px-2">
              <label className="flex min-w-0 cursor-text items-baseline gap-1 overflow-hidden">
                <span className="sr-only">
                  Amount to {tab} in {inAsset ? (spendingSymbol ?? "asset") : "USD"}
                </span>
                {!inAsset && (
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[color:var(--m-text-secondary-2)] opacity-85"
                    style={{ fontSize: "30.8px", lineHeight: 1 }}
                  >
                    $
                  </span>
                )}
                {amount === "" && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none shrink-0 select-none font-semibold text-[color:var(--m-text-secondary-2)] opacity-30"
                    style={{ fontSize: `${amountFontPx}px`, lineHeight: 1 }}
                  >
                    0
                  </span>
                )}
                <input
                  /* Named for e2e: this is the token profile's buy amount, a
                     different component from the swap card's, and the two are
                     easy to confuse from a spec. */
                  data-testid="dock-amount"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  autoComplete="off"
                  spellCheck={false}
                  value={amount}
                  // Shared with the deposit and withdraw fields: three screens
                  // collect an amount, and each had its own inline rule. This
                  // one also drops a leading zero run, which is how "018 USDC"
                  // reached a button and then a transfer record.
                  onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
                  className={cn(
                    "min-w-0 max-w-full bg-transparent text-left font-semibold outline-none",
                    "text-[color:var(--m-text-primary)] caret-[color:var(--m-text-primary)] [field-sizing:content]",
                  )}
                  type="text"
                  // Transitioned so a keystroke that crosses a step reads as the
                  // field adjusting, not as the layout jumping under the cursor.
                  style={{ fontSize: `${amountFontPx}px`, lineHeight: 1, transition: "font-size 120ms ease-out" }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  // Carry the VALUE across the unit change, not the digits.
                  // Flipping 100 USD into "100 ETH" is the bug this avoids.
                  if (typedIsNumber && price > 0) {
                    setAmount(String(Number((inAsset ? amountUsd : amountAsset).toFixed(inAsset ? 2 : 6))));
                  }
                  setInAsset((v) => !v);
                }}
                className="flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--m-surface-2)] px-3 py-1 text-xs font-medium uppercase text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
                aria-label={`Switch denomination (currently ${inAsset ? (spendingSymbol ?? "asset") : "USD"})`}
              >
                {inAsset ? (spendingSymbol ?? "—") : "USD"}
                <span aria-hidden="true" className="text-[10px] opacity-70">
                  ⇅
                </span>
              </button>
            </div>
            {/* Keyed on the text so the entrance REPLAYS: typing a new amount,
                and a route resolving from "Finding a route…" to a figure, are
                both answers to something the user just did. The height is held
                whether or not there is an estimate, so nothing below shifts. */}
            <div className="h-4 text-center text-xs text-[color:var(--m-text-secondary)]">
              {estimate && (
                <span key={estimate} className="dock-estimate-in inline-block">
                  {estimate}
                </span>
              )}
            </div>
            {/* Only when the book cannot take the whole order. It is the
                difference between "the app priced this wrong" and "the market
                is this thin", and the reader cannot tell them apart from the
                delivered figure alone. */}
            {/* Only when the book cannot take the whole order. Nothing else
                goes under the estimate: the `≈` line is the answer, and this is
                the one qualification that changes what the reader receives. */}
            {splitNote && (
              <p className="mt-1 text-center font-dm-mono text-[11px] leading-4 text-[color:var(--m-warning-600)]">
                {splitNote}
              </p>
            )}
            {/* WHAT TO DO WITH THE PART THAT WILL NOT FILL.
                
                Absent whenever there is nothing to decide — the common case is a
                market deep enough to take the whole order, and a permanently
                present disposition picker would make every trade look like it
                had a problem. */}
            {unfilled > 0 && spendingSymbol && receiving && (
              <RemainderChoice
                value={disposition}
                onChange={setDisposition}
                unfilled={unfilled}
                spending={spendingSymbol}
                receiving={receiving}
                restsTo={restsTo}
                restPrice={restPrice}
                lpRange={route.quote?.execution ?? null}
              />
            )}
          </div>

          {/* Presets. Buying is denominated in money, selling in a share of what
              you hold — the same chip row would be meaningless for both. */}
          <div className="flex items-stretch gap-2 px-1" data-testid="dock-presets">
            {(tab === "buy" ? USD_PRESETS : SELL_PRESETS).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (tab === "buy") {
                    setInAsset(false);
                    setAmount(String(preset));
                    return;
                  }
                  setInAsset(true);
                  setAmount(String(Number(((balance * preset) / 100).toFixed(6))));
                }}
                // On EITHER tab: 25% of an empty balance is 0, and a preset
                // that silently produces zero reads as a broken control. This
                // was sell-only, so the buy tab offered them against nothing.
                disabled={balance <= 0}
                className={cn(
                  "flex-1 select-none rounded-lg border border-transparent px-2 py-2 text-sm font-medium transition-all duration-150",
                  "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)] hover:scale-[1.02]",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                {tab === "buy" ? `$${preset}` : `${preset}%`}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-1 text-xs text-[color:var(--m-text-secondary)]">
            <PaymentAsset
              symbol={spendingSymbol ?? ""}
              logoURI={tab === "sell" ? pair.base.logoURI : pair.quote.logoURI}
              balance={balance}
              balanceUsd={balanceUsd}
              /* Only the BUY side is a choice. Selling spends the base — the
                 token this page is about — and offering to "choose" it would
                 imply you could sell something else from here. */
              options={tab === "buy" ? offered : []}
              activePairId={pair.id}
              onSelect={onPairChange}
            />
            <button
              type="button"
              onClick={() => {
                setInAsset(true);
                setAmount(String(Number(balance.toFixed(6))));
              }}
              disabled={balance <= 0}
              title={balance <= 0 ? `No ${spendingSymbol ?? "asset"} balance to spend` : undefined}
              className="rounded-md bg-[color:var(--m-surface-2)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[color:var(--m-text-primary)] transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-40"
            >
              Max
            </button>
          </div>
        </>
      )}

      {/* The pool-pricing disclosure. The dock reads no pool reserves, so it
          shows the standard line; the deposit page it links to judges the pool. */}
      {ready && tab === "lp" && <PoolRiskNote variant="standard" />}

      {ready && tab === "lp" ? (
        <Link
          href={lpHref}
          className="w-full rounded-lg px-4 py-3 text-center text-sm font-semibold leading-normal text-[color:var(--m-on-primary)] shadow-sm transition-opacity hover:opacity-90"
          style={{ background: accent }}
        >
          Deposit liquidity
        </Link>
      ) : ready ? (
        <button
          type="button"
          data-testid="dock-submit"
          onClick={onPrimary}
          // Connecting is never blocked by the quote or the balance — only
          // executing is.
          disabled={isConnected && (!canExecute || insufficientBalance)}
          className="w-full rounded-lg px-4 py-3 text-center text-sm font-semibold leading-normal text-[color:var(--m-on-primary)] shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: accent }}
        >
          {ctaLabel}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-[color:var(--m-surface-2)] px-4 py-3 text-sm font-semibold leading-normal text-[color:var(--m-text-secondary)] opacity-60"
        >
          {pair ? "Enter an amount" : "Pick a market"}
        </button>
      )}

      {/* One-tap shortcuts. BOTH rows stay visible on either side, as in the
          reference: their value is that you can go straight from a buy to
          "sell half" without first finding the tab.

          They FILL the form rather than firing a trade. There is no in-dock
          execution yet, and a button that looked like it sold half your
          holding but only navigated would be the worst version of this. So a
          tap switches side, sets the amount, and leaves the CTA to confirm. */}
      {pair && tab !== "lp" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-stretch gap-1.5" role="group" aria-label="Quick buy">
            {USD_PRESETS.map((preset) => (
              <QuickAction
                key={`buy-${preset}`}
                label={`$${preset}`}
                ariaLabel={`Quick buy $${preset}`}
                accent="var(--m-success)"
                onClick={() => {
                  onTabChange("buy");
                  setInAsset(false);
                  setAmount(String(preset));
                }}
              />
            ))}
          </div>
          <div className="flex items-stretch gap-1.5" role="group" aria-label="Quick sell">
            {SELL_PRESETS.map((preset) => (
              <QuickAction
                key={`sell-${preset}`}
                label={`${preset}%`}
                ariaLabel={`Quick sell ${preset}%`}
                accent="var(--m-error)"
                /* A percentage of nothing is nothing. Disabled with the reason
                   rather than silently setting 0 and failing at the CTA. */
                disabled={baseBalance <= 0}
                title={
                  baseBalance <= 0 ? `No ${pair.baseSymbol} to sell` : `Sell ${preset}% of your ${pair.baseSymbol}`
                }
                onClick={() => {
                  onTabChange("sell");
                  setInAsset(true);
                  setAmount(String(Number(((baseBalance * preset) / 100).toFixed(6))));
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Only the LP tab keeps a footnote. "Routed on-chain through Rate's
          orderbook and pools" described the venue rather than the trade in
          front of the reader — true of every trade here, so it told nobody
          anything they could act on. The LP line survives because bands ARE a
          choice being made on that tab. */}
      {/* The same machine the swap card mounts, on the same real router path.
          The disposition is now the reader's, defaulting to a refund — see
          `RemainderChoice`. It was hardcoded to "none" while this rail had no
          control, on the argument that a dock which silently rested a remainder
          would open a position nobody asked for; that argument is satisfied by
          the default, not by removing the choice. */}
      {flowOpen && quote && pair && getToken.address && (
        <SwapFlow
          pay={spending}
          get={getToken}
          quote={quote}
          disposition={ladder.order ? "none" : disposition}
          networkName={displayNetworkName}
          ladder={ladder.order}
          onClose={() => setFlowOpen(false)}
          useExecution={useRealSwapExecution}
        />
      )}
    </section>
  );
}

/**
 * Controlled since 2026-09-04. It was a bare `<input>` with no `value` and no
 * `onChange`, so the LP tab collected nothing — which is why it could not show
 * an estimated APR: the estimate is a function of the amount, and the amount was
 * never read out of the DOM.
 */
function DepositField({
  symbol,
  logoURI,
  value,
  onChange,
}: {
  symbol: string;
  logoURI?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-[color:var(--m-surface-2)] px-3 py-3">
      <span className="text-xs text-[color:var(--m-text-secondary)]">Deposit</span>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          aria-label={`Deposit ${symbol}`}
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
          className="min-w-0 flex-1 bg-transparent font-dm-mono text-xl leading-none outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
        />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <TokenImageIcon symbol={symbol} logoURI={logoURI} color={tokenColor(symbol)} size="sm" />
          {symbol}
        </span>
      </span>
    </label>
  );
}

/**
 * The asset being spent, and — when buying — which one.
 *
 * A plain span when there is no choice: one market means one quote, and a
 * control that opens a menu with a single item implies an option that is not
 * there. Same rule the "Quoted in" card it replaces already applied.
 *
 * Depth is shown beside each option because it is the reason one market is the
 * default, so it is the one number worth seeing while choosing.
 */
export function PaymentAsset({
  symbol,
  logoURI,
  balance,
  balanceUsd,
  options,
  activePairId,
  onSelect,
}: {
  symbol: string;
  logoURI?: string;
  balance: number;
  balanceUsd: number;
  options: SpotPair[];
  /**
   * The MARKET currently selected, not its quote token.
   *
   * It was the quote's id, and that cannot identify a row here. Two markets can
   * be quoted in tokens sharing a symbol — this venue lets anyone mint a coin
   * called USDC, which is why nothing else in the app keys on one — and if two
   * options resolve to the same quote id, `find(p => p.quote.id === id)` always
   * returns the first, so the second row is unselectable: it highlights, and the
   * card behind it never changes. A pair id is exact.
   */
  activePairId?: string;
  onSelect?: (pairId: string) => void;
}) {
  const label = (
    <>
      <TokenImageIcon symbol={symbol} logoURI={logoURI} color={tokenColor(symbol)} size="sm" />
      <span>
        {balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} {symbol}
        {balanceUsd > 0 ? ` \u2248 ${usd(balanceUsd)}` : ""}
      </span>
    </>
  );

  const shell =
    "flex items-center gap-1.5 rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-1 text-xs font-medium text-[color:var(--m-text-primary)]";

  if (options.length < 2 || !onSelect) {
    return <span className={shell}>{label}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Choose payment asset"
        className={cn(shell, "transition-colors hover:border-[color:var(--m-text-secondary-2)]")}
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-2.5 w-2.5 text-[color:var(--m-text-secondary)]"
        >
          <path
            d="M20 9L12.7071 16.2929C12.3166 16.6834 11.6834 16.6834 11.2929 16.2929L4 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary-2)]">
          Pay with
        </div>
        {options.map((option) => {
          const active = option.id === activePairId;
          // Two rows reading "USDC" are indistinguishable, and picking the wrong
          // one routes a trade through a different market — often an empty one.
          // The address is the only thing that separates them, which is the rule
          // the deposit list's `needsAddress` already applies.
          const ambiguous =
            options.filter((other) => other.quoteSymbol === option.quoteSymbol).length > 1;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              aria-pressed={active}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
                active
                  ? "bg-[color:var(--m-surface-selected)] font-semibold text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <TokenImageIcon
                  symbol={option.quoteSymbol}
                  logoURI={option.quote.logoURI}
                  color={tokenColor(option.quoteSymbol)}
                  size="sm"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate">{option.quoteSymbol}</span>
                  {ambiguous && (
                    <span className="truncate font-dm-mono text-[9.5px] opacity-70">
                      {option.quote.id.slice(0, 6)}…{option.quote.id.slice(-4)}
                    </span>
                  )}
                </span>
              </span>
              <span className="font-dm-mono text-[10px] opacity-70">
                {usd(option.dayQuoteTvlUSD ?? 0)}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}


/**
 * A quick-action chip. Tinted with its side's accent so a sell row can never be
 * mistaken for a buy row at a glance — the two sit adjacent and differ only by
 * label otherwise.
 */
/**
 * The three things that can happen to an unfilled remainder.
 *
 * ## Refund is selected and stays selected
 *
 * A rail that silently rests a leftover opens a position nobody asked for, and
 * that is the reason this control did not exist until now. Making the other two
 * visible does not make either of them a default — a pure swap that leaves no
 * stray position is still one click, exactly as before.
 *
 * ## Each alternative costs a second transaction, and says so
 *
 * Resting and providing stopped being atomic on 2026-09-05, when `Router.sol`
 * was deleted: the remainder goes out as its own call to `limitBuy`/`limitSell`
 * or `addLiquiditySingleSided`, each behind its own allowance because each is a
 * different spender. That is a cost the reader is agreeing to on this screen, so
 * it is on the option rather than arriving as a surprise prompt after a screen
 * that said the trade was done.
 *
 * ## The band option promises fees, not a yield
 *
 * No APR is claimed because none is measurable here: the gateway skips the
 * calculation entirely for band pools, whose liquidity lives in `bandPositions`
 * rather than `spotLiquidityRanges` and whose fills arrive as `BandSwap`, which
 * has no handler and no table. When both land the figure can join this row; a
 * number invented to fill the space cannot.
 */
function RemainderChoice({
  value,
  onChange,
  unfilled,
  spending,
  receiving,
  restsTo,
  restPrice,
  lpRange,
}: {
  value: Disposition;
  onChange: (next: Disposition) => void;
  unfilled: number;
  spending: string;
  receiving: string;
  restsTo: number;
  restPrice: number;
  lpRange: { lpMinPrice: number; lpMaxPrice: number } | null;
}) {
  const band =
    lpRange && lpRange.lpMinPrice > 0 && lpRange.lpMaxPrice > 0
      ? `${amt(lpRange.lpMinPrice)} – ${amt(lpRange.lpMaxPrice)}`
      : null;

  /*
   * The second wallet step is said in WORDS, not as "+ 1 tx".
   *
   * It was a chip reading `+ 1 tx`, which names the thing by how the chain
   * models it. Someone deciding what to do with a leftover is not thinking in
   * transactions; what they need to know is that their wallet will ask them
   * again, which is the part with a cost attached — a second confirmation and a
   * second fee. "Approve" is avoided too: it means a specific ERC-20 grant
   * elsewhere in this app, and reusing it here for "confirm" would collide.
   */
  const options: { key: Disposition; title: string; lines: string[] }[] = [
    {
      key: "none",
      title: "Give it back",
      lines: [`Stays in your wallet as ${spending}.`, "Nothing else to sign."],
    },
    {
      key: "limit",
      title: "Rest it as an order",
      lines: [
        // The price this posts at, from the same figures the execution reads.
        `1 ${spending} = ${amt(restPrice)} ${receiving} → ${amt(restsTo)} ${receiving}`,
        "Fills when price reaches it · your wallet asks once more",
      ],
    },
    {
      key: "lp",
      title: "Provide liquidity",
      lines: [
        band
          ? `${band} · converts to ${amt(restsTo)} ${receiving}`
          : `Converts to ${amt(restsTo)} ${receiving} as price crosses`,
        "Earns fees while it waits · your wallet asks once more",
      ],
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="What to do with the part that will not fill"
      className="mt-2 overflow-hidden rounded-xl border border-[color:var(--m-border)]"
    >
      <div className="flex items-baseline justify-between gap-2 bg-[color:var(--m-surface-2)] px-3 py-2">
        <span className="text-[11.5px] font-semibold text-[color:var(--m-text-primary)]">
          {amt(unfilled)} {spending} won&apos;t fill now
        </span>
      </div>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            /* The disposition decides which shape the review and result take,
               so a spec picks one by key rather than by a title that is copy. */
            data-testid={`dock-disposition-${option.key}`}
            aria-checked={active}
            onClick={() => onChange(option.key)}
            className={cn(
              "flex w-full items-start gap-2.5 border-t border-[color:var(--m-border)] px-3 py-2.5 text-left transition-colors first:border-t-0",
              active
                ? "bg-[color:var(--m-surface-selected)]"
                : "hover:bg-[color:var(--m-surface-2)]",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
                active
                  ? "border-[color:var(--m-primary)]"
                  : "border-[color:var(--m-text-secondary-2)]",
              )}
            >
              {active && <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--m-primary)]" />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold text-[color:var(--m-text-primary)]">
                {option.title}
              </span>
              {option.lines.map((line, index) => (
                <span
                  key={line}
                  className={cn(
                    "font-dm-mono text-[10.5px] leading-4",
                    index === 0
                      ? "text-[color:var(--m-text-secondary)]"
                      : "text-[color:var(--m-text-secondary-2)]",
                  )}
                >
                  {line}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuickAction({
  label,
  ariaLabel,
  accent,
  onClick,
  disabled = false,
  title,
}: {
  label: string;
  ariaLabel: string;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ borderColor: `color-mix(in srgb, ${accent} 25%, transparent)`, background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
      className={cn(
        "flex-1 select-none rounded-full border px-2 py-1 text-xs font-semibold leading-tight",
        "transition-[transform,background-color,border-color] duration-150 ease-out",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.95] motion-reduce:transform-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {label}
    </button>
  );
}
