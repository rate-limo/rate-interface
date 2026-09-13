"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Maximize2, Settings2 } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { useWalletConnect } from "@/lib/wallet";
import { useGasStatus } from "@/lib/wallet/gasStatus";
import { useAccount, useBalance, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { erc20Abi, parseAbi, parseUnits, zeroAddress } from "viem";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { matchingEngineAddress, matchingEngineSupportsDeadlines } from "@/lib/deployments";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { networkNameToSlug } from "@/consts";
import { chainIdToNetworkName } from "@/consts";
import { useChainSwitch } from "@/hooks/useChainSwitch";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { quoteSwap, routeTokens, lpAprPct } from "@/lib/swap/quote";
import { WRAPPED_NATIVE, classifySwap, isNativeAddress, wrappedNativeAbi } from "@/lib/swap/wrap";
import { emptyQuote } from "@/lib/swap/emptyQuote";
import { isNativeSymbol } from "@/utils/order";
import { useRouteQuote } from "@/lib/swap/routeQuote";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { useTokenBrand } from "@/lib/swap/useTokenBrand";
import {
  getSwapTokens,
  getHubToken,
  defaultSwapPair,
  tokenColor,
} from "@/lib/swap/tokens";
import type { Disposition, SwapToken } from "@/lib/swap/types";
import { TokenPicker } from "./TokenPicker";
import { SwapFlow } from "./SwapFlow";
import { SwapDepthChart } from "./SwapDepthChart";
import { useSwapDepth } from "@/hooks/useSwapDepth";
import { depthStepFor } from "@/lib/swap/depth";
import { useOrderPreview } from "@/hooks/useOrderPreview";
import { useRealSwapExecution } from "./execution";
import { usePairCandles, type PairCandlePeriod } from "@/hooks/usePairCandles";
import { toastContractError } from "@/lib/errors/toastContractError";

/**
 * The Iter swap card. Two user-selectable tokens (pay + receive) with a flip
 * control; numbers come entirely from `quoteSwap` (the validated per-hop cascade).
 * Shows the route (collapsed → per-hop matched/placed), the overall fill split,
 * and the three remainder dispositions (Leave unfilled [default] / Rest as limit /
 * Earn·LP). This is a faithful port of the approved swap-src design.
 * See apps/web/CLAUDE.md ("Swap page & swap card — design spec").
 */

const MOCK_BALANCE = 1.2;
const SLIDER_MIN = 0.02;
/**
 * Track length for the APP slider while it is disabled — i.e. when no wallet
 * balance defines the scale. Deliberately a separate constant from
 * MOCK_BALANCE: that one is the landing hero's illustrative balance, and the two
 * only happen to agree today. Sharing it would let a change made for the hero
 * silently retune a control on the real trading surface.
 */
const EXPLORE_SLIDER_MAX = 1.2;
const ORDER_MATCH_LIMIT = 20;

const conditionalMatchingEngineReadAbi = parseAbi([
  "function getPair(address base, address quote) view returns (address book)",
]);
// Hand-written rather than imported so the shape is visible beside the call. It is the
// one place in this file that names the engine's limit entrypoints, and both now take a
// single LimitOrderInput — the positional form these carried was silently uncheckable,
// since a locally-parsed ABI type-checks the args against ITSELF, not against the engine.
const legacyLimitOrderAbi = parseAbi([
  "function limitBuy((address base,address quote,uint256 price,uint256 amount,bool isMaker,uint32 n,address recipient) input) returns ((uint256 makePrice,uint256 placed,uint32 id) result)",
  "function limitSell((address base,address quote,uint256 price,uint256 amount,bool isMaker,uint32 n,address recipient) input) returns ((uint256 makePrice,uint256 placed,uint32 id) result)",
]);
const createOrderAbi = parseAbi([
  "function createOrder((address base,address quote,bool isBid,bool isLimit,uint32 orderId,uint256 price,uint256 amount,uint32 n,address recipient,bool isMaker,uint32 slippageLimit,uint64 deadline) createOrderData) payable returns ((uint256 makePrice,uint256 placed,uint32 id) result)",
]);
const conditionalOrderbookAbi = parseAbi([
  "function getOperator() view returns (address)",
]);
const stopOrderEngineAbi = parseAbi([
  "function placeStopLimit(address base,address quote,bool isBid,uint256 stopPrice,uint256 limitPrice,uint256 amount,address recipient,uint64 deadline) returns (uint32 id)",
]);

/**
 * Preview opens on a size the book CANNOT fill in one go.
 *
 * `/trade` opens at 0.3, which at listing prices clears both hops outright:
 * 100% delivered, no remainder — and with no remainder the three disposition
 * buttons are `disabled` and render at 45% opacity. That is correct on the
 * trade page, where the user picked the size. In the hero it meant the one
 * control the card is there to show was greyed out, and the card demonstrated
 * a plain swap: a screenshot of every other DEX.
 *
 * Sized in USD rather than tokens because the amount has to straddle a depth
 * figure, and both sides move — depth lives in lib/swap/quote's illustrative
 * table (the thinnest hub leg is USDC→ETH at $35k) while the token price comes
 * from the list. 50k against a 35k leg lands around 70/30, which reads clearly
 * without looking like a broken market. Clamped to the slider's own range so
 * the thumb is never off its track.
 */
const PREVIEW_TARGET_USD = 50_000;

function displayDec(t: SwapToken): number {
  if (t.symbol === "USDC" || t.symbol === "USDT") return 2;
  if (t.priceUsd >= 1000) return 6;
  return 4;
}
function money(n: number): string {
  return (
    "$" +
    Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 0 })
  );
}
function tok(n: number, dec: number): string {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: dec });
}

function parseOrderAmount(value: string, decimals: number): bigint {
  if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0) return BigInt(0);
  try {
    return parseUnits(value, decimals);
  } catch {
    return BigInt(0);
  }
}

function encodeOrderPrice(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return BigInt(0);
  return parseUnits(value.toFixed(8), 8);
}

interface SwapCardProps {
  networkName: string;
  networkSlug: string;
  /**
   * `"preview"` is the landing hero. Same component, same markup tree — the
   * card already refuses a second tree for its two layouts (see the group
   * comment below), and a decorative copy of it in `Landing/` was built once
   * and deleted for exactly the drift reason recorded there.
   *
   * Everything that shapes an order stays live: amount, slider, both token
   * pickers, flip, and the remainder disposition all re-quote through the real
   * `quoteSwap`. Four things change, and each has its own note at the site:
   *
   * 1. **No transaction flow.** `SwapFlow` defaults to `useMockSwapExecution`,
   *    a timer that renders a green "Delivered N ETH". Behind the app shell
   *    that is a known pre-launch state; in a landing hero it is a fabricated
   *    success shown to a stranger, on the same page whose stat strip prints
   *    "TBD · at mainnet" rather than invent a number. The primary button is a
   *    link to `/trade` instead.
   * 2. **No wallet prompt**, so the hero has one call to action and it is the
   *    waitlist.
   * 3. **No depth figure** — same reason as (1). It is the one number on the
   *    card that claims something about our books.
   * 4. **Never the two-column desktop grid.** That layout assumes the page's
   *    full width; the hero gives it a 360px column at viewports well past
   *    900px, where the media query would otherwise fire.
   */
  variant?: "full" | "preview";
}

export function SwapCard({ networkName, networkSlug, variant = "full" }: SwapCardProps) {
  const preview = variant === "preview";
  const { open } = useWalletConnect();
  const { address, isConnected } = useAccount();

  const staticTokens = useMemo(() => getSwapTokens(networkName), [networkName]);
  const staticHub = useMemo(() => getHubToken(networkName), [networkName]);
  const liveTokens = useLiveSwapTokens(networkName, !preview);
  const tokens = preview ? staticTokens : (liveTokens.data ?? []);
  const hub = tokens.find((token) => token.symbol === "USDC") ?? staticHub;
  // Committing a cross-chain token pick re-homes the card — see `pick`.
  const { switchHere } = useChainSwitch();
  const initial = useMemo((): { pay: SwapToken; get: SwapToken | null } => {
    const previewPair = defaultSwapPair(networkName);
    // The landing hero keeps BOTH sides: it exists to demonstrate a completed
    // quote, and an unchosen receive token would show it demonstrating nothing.
    if (preview) return previewPair;

    // Pay opens on the chain's NATIVE token — ETH on RISE — because that is what
    // a visitor arrives holding. `isNativeSymbol` is shared with utils/order so
    // the per-chain list lives in one place.
    //
    // Receive opens UNCHOSEN. Defaulting it picked a direction on the user's
    // behalf and, worse, made the card look ready to trade a pair nobody had
    // asked for. Null is the honest starting state: nothing is quoted, and the
    // primary action says what is missing.
    const native = staticTokens.find((token) => isNativeSymbol(token.symbol));
    return { pay: native ?? previewPair.pay, get: null };
  }, [networkName, preview, staticTokens]);

  const [pay, setPay] = useState<SwapToken>(initial.pay);
  const [get, setGet] = useState<SwapToken | null>(initial.get);
  // Every downstream calculation needs SOME token to type against. The hub is the
  // neutral stand-in, and nothing derived from it is ever displayed while `get` is
  // null — the receive leg, the quote and the primary action are all gated on the
  // real value below.
  const getOrHub = get ?? hub;


  const [amountIn, setAmountIn] = useState(() => {
    if (!preview) return 0;
    const target = PREVIEW_TARGET_USD / initial.pay.priceUsd;
    const clamped = Math.min(MOCK_BALANCE, Math.max(SLIDER_MIN, target));
    return Math.round(clamped * 100) / 100;
  });
  const [amountText, setAmountText] = useState(() => preview ? String(amountIn) : "");
  const [disposition, setDisposition] = useState<Disposition>("none");
  const [routeOpen, setRouteOpen] = useState(false);
  const [picker, setPicker] = useState<null | "pay" | "get">(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const { requireGas } = useGasStatus();
  const [hasShownResults, setHasShownResults] = useState(preview);
  const [mode, setMode] = useState<"trade" | "limit" | "stop">("trade");
  const [chartOpen, setChartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippagePct, setSlippagePct] = useState(0.005);
  const [deadlineMinutes, setDeadlineMinutes] = useState(30);

  // Replace the bootstrap token-list objects with their live indexed metadata
  // as soon as the market list arrives. Addresses remain the stable identity.
  useEffect(() => {
    if (preview || tokens.length === 0) return;
    // Keep the CURRENT token when the indexer has no row for it, rather than
    // falling back to tokens[0]. That fallback is what silently replaced the
    // native default with whichever token the gateway happened to list first.
    /**
     * A placeholder has no address to match on, so it is matched by SYMBOL.
     *
     * `getSwapTokens` has no entry for some chains — Arc, today — so
     * `defaultSwapPair` falls through to `getHubToken`'s fallback: a priced
     * stand-in with `address: ""`. Matching that by address finds nothing and
     * `?? pay` then kept it forever, so the card sat holding a token that does
     * not exist. It looked entirely normal — symbol, chain badge, balance row —
     * while `useRouteQuote` bailed on `!args.pay.address` before it ever
     * fetched, and the receive box printed its `placeholder="0"`. Typing an
     * amount produced a grey zero, no request, and no error to explain it.
     *
     * Only for the empty-address case. A real token still matches by address and
     * still falls back to itself: the `tokens[0]` fallback stays gone, for the
     * reason given directly above.
     */
    const nextPay = pay.address
      ? (tokens.find((token) => token.address.toLowerCase() === pay.address.toLowerCase()) ?? pay)
      : (tokens.find((token) => token.symbol === pay.symbol) ?? pay);
    setPay(nextPay);
    // Never resurrect an unchosen receive leg: this effect upgrades a token's
    // metadata, and there is no metadata to upgrade until the user picks one.
    if (!get) return;
    const indexedGet = tokens.find((token) => token.address.toLowerCase() === get.address.toLowerCase());
    if (indexedGet && indexedGet.address.toLowerCase() !== nextPay.address.toLowerCase()) setGet(indexedGet);
  }, [get, pay.address, preview, tokens]);

  /**
   * `token: undefined` reads the NATIVE balance; passing the sentinel as a token
   * address would call `balanceOf` on an address that holds no contract.
   *
   * This is what made native funds invisible: the pay leg always passed a token
   * address, so a wallet holding native ETH read zero against WETH and the
   * amount slider disabled itself with nothing to explain why.
   */
  const payIsNative = isNativeAddress(pay.address);
  const getIsNative = Boolean(get && isNativeAddress(get.address));
  const { data: payBalanceData, isLoading: payBalanceLoading, isError: payBalanceError } = useBalance({
    address,
    token: payIsNative ? undefined : (pay.address as `0x${string}`),
    chainId: pay.chainId,
    query: { enabled: !preview && Boolean(address && pay.address) },
  });
  const { data: getBalanceData, isLoading: getBalanceLoading, isError: getBalanceError } = useBalance({
    address,
    token: getIsNative ? undefined : (get?.address as `0x${string}` | undefined),
    chainId: getOrHub.chainId,
    query: { enabled: !preview && Boolean(address && get?.address) },
  });

  /**
   * Wrap, unwrap, the same asset twice, or an ordinary trade.
   *
   * `same-asset` is the Arc case — native USDC and the ERC-20 at `0x3600…` are
   * one balance behind two interfaces, so there is no conversion to perform and
   * the card must say so rather than route it. Everything else on Arc, and every
   * pair on a chain with no native leg, classifies as `trade` and follows the
   * existing engine path untouched.
   */
  const swapKind = get ? classifySwap(pay, get, pay.chainId) : "trade";
  const isWrapKind = swapKind === "wrap" || swapKind === "unwrap";
  const payBalance = preview ? MOCK_BALANCE : Number(payBalanceData?.formatted ?? 0);
  const getBalance = preview ? 0 : Number(getBalanceData?.formatted ?? 0);
  // A disconnected visitor can still explore quote sizes — through the AMOUNT
  // INPUT, which stays live because quoting never depends on wallet state (see
  // `initial` above). The SLIDER is the one control that does: its whole span is
  // "what this wallet can spend", so with no wallet there is no scale for it to
  // express, and the 1.2 it used to inherit from MOCK_BALANCE was a ceiling
  // invented out of nothing. It is disabled rather than hidden so the card keeps
  // its layout across connect, and so the reason is visible next to the
  // "Connect wallet" balance directly above it.
  //
  // The landing hero is exempt: it is never connected, and the slider is the
  // control the whole preview exists to demonstrate.
  // Keyed on "this wallet can fund this leg", NOT on "a wallet exists". Connected
  // with a zero balance produced min === max === 0 on an ENABLED input: a slider
  // that silently cannot move, which is worse than the disabled one because
  // nothing says why. That state is the common one rather than an edge case —
  // the pay leg reads `balanceOf` on the ERC-20 the router actually spends (see
  // execution.ts, which approves and has no native `value:`), and on RISE the
  // token the list calls ETH is the WETH contract, so a wallet holding native
  // ETH reads zero here and is right to.
  const sliderLive = preview || (isConnected && payBalance > 0);
  const sliderMin = preview ? SLIDER_MIN : 0;
  // When the slider is dead the track still has to hold the typed amount, or the
  // thumb pins below a number the input above it plainly shows — a disabled
  // control that also reads as wrong. Only a fundable balance IS the scale.
  const sliderMax = sliderLive
    ? (preview ? MOCK_BALANCE : Math.max(sliderMin, payBalance))
    : Math.max(EXPLORE_SLIDER_MAX, amountIn);
  const insufficientBalance = !preview && isConnected && !!payBalanceData && amountIn > payBalance;
  const balanceLabel = (
    balance: number,
    token: SwapToken,
    state: { loaded: boolean; loading: boolean; error: boolean },
  ) => {
    if (preview || state.loaded) return `${tok(balance, displayDec(token))} ${token.symbol}`;
    // Disconnected this used to read "Connect wallet" on BOTH legs, which is the
    // same string in both places — so flipping the pair visibly changed nothing
    // here, and the line never said which token it was even about. The dash is
    // the honest value (no wallet, no balance, and we invent nothing), while the
    // symbol keeps the row attached to its leg and makes the flip legible. The
    // prompt itself is not lost: the header and the primary button both already
    // say "Connect wallet", so this was its third printing on one screen.
    if (!isConnected) return `— ${token.symbol}`;
    if (state.error) return "Unavailable";
    return state.loading ? "Loading…" : "Unavailable";
  };

  const hasAmount = amountText.trim() !== "" && amountIn > 0;
  // Quoting is intentionally driven by the amount the user entered, not by
  // the wallet balance. A user may want to preview a route before funding the
  // wallet; the balance is an execution constraint only.
  const canQuote = !preview && hasAmount && Boolean(get);
  const previewQuote = useMemo(
    () => quoteSwap({ pay, get: getOrHub, amountIn, slippagePct }, hub),
    [pay, getOrHub, amountIn, hub, slippagePct]
  );
  const live = useRouteQuote({
    networkName,
    pay,
    get: getOrHub,
    tokens,
    amountIn,
    slippagePct,
    enabled: canQuote,
  });
  // The preview remains exactly the approved illustrative landing card. The app
  // card uses only a gateway-issued quote; the zero-size placeholder merely
  // keeps the existing markup stable while that quote is loading.
  const quote = preview ? previewQuote : (live.quote ?? emptyQuote(pay, getOrHub));
  // Never gate a displayed quote on balance. `insufficientBalance` is used by
  // the primary action below, while this value controls the read-only output
  // and route details. This keeps an over-sized amount useful for planning.
  const quoteReady = preview || (canQuote && !live.loading && !live.error && Boolean(live.quote));
  const cardExpanded = preview || (hasAmount && hasShownResults);
  // Only quote results need the two-column swap layout. The chart is an
  // external sibling panel, so opening it must not stretch an otherwise
  // compact 430px form into an empty results column.
  const wideResults = mode === "trade" && cardExpanded;

  // A refresh must not collapse the form back to one column: the quote hook
  // intentionally clears its result while fetching, and tying width directly
  // to that transient state made every slider movement shift under the cursor.
  // Collapse only when the user actually clears the amount.
  useEffect(() => {
    if (quoteReady) setHasShownResults(true);
    else if (!hasAmount) setHasShownResults(false);
  }, [hasAmount, quoteReady]);

  const getDec = displayDec(getOrHub);
  const anyPlaced = quote.placedUsd > 0;
  const placeOn = disposition !== "none";
  const fillPct = quote.payUsd > 0 ? Math.round((quote.deliveredUsd / quote.payUsd) * 100) : 0;
  const remPct = 100 - fillPct;

  function flip() {
    // Nothing to swap with until the receive leg is chosen; flipping would
    // otherwise move the native default into a slot the user never filled.
    if (!get) return;
    setPay(get);
    setGet(pay);
  }
  function pick(token: SwapToken) {
    const side = picker;
    setPicker(null);
    if (!side) return;

    /**
     * A token from another chain RE-HOMES the whole card.
     *
     * There is no bridge and the router routes within a single chain, so a pair
     * spanning two of them cannot be quoted at all — `quoteSwap` would price a
     * route that does not exist. The other side therefore has to move too, and
     * the hub is the only token guaranteed to be on every chain, so it is what
     * that side resets to.
     *
     * `switchHere` carries the chain into `?chain=`, which is what actually
     * re-scopes this card: `/trade/page.tsx` reads it on the server and passes
     * `networkName` back down, and `tokens`/`hub`/the quote all follow from
     * that. Setting local state without it would leave the card holding an Arc
     * token while every list around it still described RISE.
     *
     * The metadata effect above keeps a token it cannot find in the incoming
     * list rather than falling back to `tokens[0]`, so these two survive the
     * refetch and get upgraded in place once the new chain's list lands.
     */
    if (token.chainId !== pay.chainId) {
      const nextNetwork = chainIdToNetworkName[token.chainId];
      if (nextNetwork) {
        const nextHub = getHubToken(nextNetwork);
        const isHub = token.symbol === nextHub.symbol;
        if (side === "pay") {
          setPay(token);
          // Picking the hub itself leaves nothing sensible to receive; let them
          // choose rather than seeding both sides with the same token.
          setGet(isHub ? null : nextHub);
        } else {
          // `defaultSwapPair` returns two distinct NON-hub tokens, so it can
          // never collide with the hub the user just chose to receive.
          setPay(isHub ? defaultSwapPair(nextNetwork).pay : nextHub);
          setGet(token);
        }
        switchHere(nextNetwork);
        return;
      }
    }

    const other = side === "pay" ? get : pay;
    if (other && token.symbol === other.symbol) {
      flip();
      return;
    }
    if (side === "pay") setPay(token);
    else setGet(token);
  }

  const impactClass =
    quote.impactPct < 1
      ? "text-[color:var(--m-on-surface-success)]"
      : quote.impactPct < 3
        ? "text-[color:var(--m-warning)]"
        : "text-[color:var(--m-error)]";

  const orderCount = quote.placements.length;
  const weightedApr =
    anyPlaced
      ? Math.round(
          quote.placements.reduce(
            (s, p) => s + lpAprPct(p.from.symbol, p.to.symbol) * p.inAmount * p.from.priceUsd,
            0
          ) / quote.placedUsd
        )
      : 0;

  // Primary button label — mirrors the swap-src rules.
  let buttonLabel: string;
  if (!isConnected) buttonLabel = "Connect wallet";
  // Before the amount: an amount cannot be quoted against a leg that is not set,
  // so asking for one first would be asking for the wrong thing.
  else if (!get) buttonLabel = "Select a token";
  else if (!hasAmount) buttonLabel = "Enter an amount";
  else if (insufficientBalance) buttonLabel = `Insufficient ${pay.symbol} balance`;
  else if (anyPlaced && disposition === "none") {
    buttonLabel = `Trade available ${tok(quote.delivered, getDec)} ${get.symbol} (${fillPct}%)`;
  }
  else if (disposition === "lp") buttonLabel = "Trade + provide liquidity";
  else if (disposition === "limit") buttonLabel = `Trade + place limit${orderCount > 1 ? "s" : ""}`;
  else buttonLabel = "Trade";

  const showWarn = anyPlaced && disposition === "none";

  function onPrimary() {
    if (!isConnected) {
      open();
      return;
    }
    if (!get || !hasAmount || insufficientBalance) return;
    if (!quote.execution || live.loading || live.error) return;
    // Asked last, after every other reason this click does nothing: opening the
    // deposit sheet over an incomplete form would answer a question the user has
    // not reached yet. See `useGasStatus` for why an unread balance proceeds.
    if (!requireGas()) return;
    setFlowOpen(true);
  }

  const dispSub = !anyPlaced
    ? "The book fills your whole order at this size."
    : disposition === "none"
      ? `Default: trade the matched amount and refund the rest as ${pay.symbol}.`
      : disposition === "lp"
        ? "Puts the idle remainder to work as pool liquidity while it converts."
        : "Rests on the book; converts when price comes to it.";

  const legTop =
    "mb-2 flex justify-between font-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]";
  const legBox =
    "rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-4 py-3.5";

  const dispositions: { key: Disposition; label: string }[] = [
    { key: "none", label: "Refund unmatched" },
    { key: "limit", label: "Rest as limit" },
    { key: "lp", label: "Earn · provide LP" },
  ];

  function toggleChart() {
    setChartOpen((open) => !open);
  }

  const cardHeader = !preview ? (
    <SwapCardHeader
      mode={mode}
      onMode={setMode}
      chartOpen={chartOpen}
      onChart={toggleChart}
      settingsOpen={settingsOpen}
      onSettings={() => setSettingsOpen((open) => !open)}
      slippagePct={slippagePct}
      onSlippage={setSlippagePct}
      deadlineMinutes={deadlineMinutes}
      onDeadline={setDeadlineMinutes}
    />
  ) : null;

  return (
    <div
      data-results-ready={quoteReady ? "true" : "false"}
      className={cn(
        "t-resize swap-chart-dock relative mx-auto w-full rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[7px] shadow-[0_1px_2px_rgba(20,40,60,.05),0_18px_44px_-22px_rgba(20,40,60,.28)]",
        !preview && cn(
          wideResults ? "min-[900px]:w-full" : "min-[900px]:w-[430px]",
          chartOpen && "min-[900px]:translate-x-[206px]",
        )
      )}
    >
      {!preview && <SwapChartPanel open={chartOpen} networkName={networkName} pay={pay} get={get} hub={hub} />}
      {cardHeader}
      {!preview && mode !== "trade" ? (
        <ConditionalOrderCard
          mode={mode}
          networkName={networkName}
          pay={pay}
          get={get}
          hub={hub}
          payBalance={payBalance}
          getBalance={getBalance}
          connected={isConnected}
          onConnect={open}
          onFlip={flip}
          onPickPay={() => setPicker("pay")}
          onPickGet={() => setPicker("get")}
        />
      ) : (
      <>
      {/*
        The card's sections are grouped into three runs so a desktop grid can
        place them without changing source order — see
        docs/superpowers/specs/2026-08-05-desktop-swap-card-design.md.

        INVARIANT: a, b and c must stay CONTIGUOUS and in this order. A new
        section goes INSIDE one of them. Put one between the groups and the
        grid quietly places the wrong things in the wrong column with nothing
        throwing — scripts/check-swap-groups.mjs is what makes that loud.

        The grid is on this wrapper, not on the card root, because TokenPicker
        and SwapFlow are the root's last children and would otherwise become
        grid items with cells of their own.
      */}
      {/* The grid is off in preview: the hero hands this card a 360px column at
          viewports far past 900px, so the media query would fire on a width
          that cannot hold two columns. `data-swap-grid` stays either way —
          check-swap-groups.mjs walks from it, and it runs against /trade. */}
      <div
        data-swap-grid=""
        className={cn(
          "overflow-hidden",
          !preview && wideResults && "min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:gap-2"
        )}
      >
        <div data-swap-group="a" className="min-[900px]:col-start-1 min-[900px]:row-start-1">
      {/* You pay */}
      <div className={legBox}>
        <div className={legTop}>
          <span>You pay</span>
          <span>Balance {balanceLabel(payBalance, pay, { loaded: !!payBalanceData, loading: payBalanceLoading, error: payBalanceError })}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            data-testid="swap-pay-amount"
            aria-label={`Amount of ${pay.symbol} to pay`}
            placeholder="0"
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[27px] font-normal tracking-[-0.02em] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] placeholder:opacity-70 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
            type="number"
            /* step="any" is not optional with type="number": the default step is 1, so a
               browser treats every decimal amount as invalid — which is most of them. */
            step="any"
            min={0}
            /* A focused number input takes the scroll wheel, so scrolling the page over
               it silently rewrites the amount. Blur on wheel is the standard guard. */
            onWheel={(e) => e.currentTarget.blur()}
            inputMode="decimal"
            value={amountText}
            onChange={(e) => {
              const raw = e.target.value;
              setAmountText(raw);
              const v = parseFloat(raw);
              setAmountIn(Number.isFinite(v) ? v : 0);
            }}
            onBlur={() => setAmountText(amountIn > 0 ? String(amountIn) : "")}
          />
          <TokenButton token={pay} networkName={networkName} onClick={() => setPicker("pay")} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-[color:var(--m-text-secondary-2)]">
          <span>
            {quoteReady ? `≈ ${money(quote.payUsd)}` : hasAmount && live.loading ? <InlineSkeleton className="w-16" /> : ""}
          </span>
          {/* Depth is the one number here that claims something about OUR
              books, and the landing page deliberately prints "TBD · at
              mainnet" rather than invent those. Off in preview. */}
          {!preview && (
            quoteReady
              ? <span className="swap-results-reveal">Depth here ≈ {money(quote.hops[0]?.depthUsd ?? 0)}</span>
              : hasAmount && live.loading
                ? <InlineSkeleton className="w-24" />
                : null
          )}
        </div>
        <div className="mx-1 mb-0.5 mt-2.5">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={preview ? 0.01 : 0.00000001}
            value={Math.min(sliderMax, Math.max(sliderMin, amountIn))}
            disabled={!sliderLive}
            aria-label="Amount to pay"
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setAmountIn(value);
              setAmountText(String(value));
            }}
            className="w-full cursor-pointer accent-[color:var(--m-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          />
          {/* The reason has to be VISIBLE text, not a title or an aria-label: a
              disabled input is out of tab order and never announced, and `title`
              never appears on touch at all — so either alternative leaves the
              dead control unexplained for exactly the people least able to
              guess. It also says what still works, because the amount field
              above quotes without a wallet and nothing else on the card says
              so. */}
          {!sliderLive && (
            <div className="mt-1 text-[11px] text-[color:var(--m-text-secondary-2)]">
              {isConnected
                ? `No ${pay.symbol} to spend — type an amount to quote.`
                : "Connect a wallet to size by balance — you can still type an amount to quote."}
            </div>
          )}
        </div>
      </div>

      {/* Flip */}
      <div className="relative z-[2] -my-3 flex justify-center">
        <button
          type="button"
          onClick={flip}
          title="Flip"
          aria-label="Flip pay and receive"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[15px] text-[color:var(--m-primary)] shadow-sm transition-transform hover:rotate-180"
        >
          ⇅
        </button>
      </div>

      {/* You receive */}
      <div className={legBox}>
        <div className={legTop}>
          <span>You receive</span>
          <span>{get ? `Balance ${balanceLabel(getBalance, get, { loaded: !!getBalanceData, loading: getBalanceLoading, error: getBalanceError })}` : ""}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <input
              readOnly
              aria-label={get ? `Estimated ${get.symbol} to receive` : "Estimated amount to receive"}
              aria-busy={!preview && hasAmount && live.loading}
              placeholder="0"
              className={cn(
                "w-full min-w-0 border-0 bg-transparent font-mono text-[27px] font-normal tracking-[-0.02em] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] placeholder:opacity-70",
                quoteReady && !preview && "swap-results-reveal"
              )}
              value={quoteReady ? tok(quote.delivered, getDec) : ""}
            />
            {!preview && hasAmount && live.loading && (
              <span className="t-skel-skeleton is-pulsing pointer-events-none absolute inset-y-0 left-0 flex items-center">
                <span className="h-7 w-28 rounded-full bg-[color:var(--m-surface-2)]" />
              </span>
            )}
          </div>
          <TokenButton token={get} networkName={networkName} onClick={() => setPicker("get")} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11.5px] text-[color:var(--m-text-secondary-2)]">
          <span className={cn(quoteReady && !preview && "swap-results-reveal")}>
            {quoteReady
              ? `≈ ${money(quote.delivered * getOrHub.priceUsd)}`
              : hasAmount && live.loading
                ? <InlineSkeleton className="w-20" />
                : ""}
          </span>
          <span />
        </div>
        {insufficientBalance && quoteReady && (
          <div className="mt-2 text-[11px] leading-4 text-[color:var(--m-warning)]">
            Quote shown for the entered amount. Add {pay.symbol} to execute this trade.
          </div>
        )}
      </div>
        </div>

        <div
          data-swap-group="b"
          className={cn(
            "min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:row-span-2",
            quoteReady && !preview && "swap-results-reveal"
          )}
        >
      {!preview && cardExpanded && live.loading && <SwapResultsSkeleton />}
      {/* Route */}
      {/* Disclosure control for the breakdown below. Note it is inert from
          900px up: both branches of the breakdown's className render
          `block` there (the chevron is also hidden), so toggling routeOpen
          has no visible effect at that width. Not fixed — making it
          conditional on viewport would need a JS viewport read, which this
          whole feature deliberately avoids to prevent a hydration mismatch.

          That inertness is also why aria-expanded is a known trade-off, not
          a solved problem. Below 900px it is correct: it tracks the same
          hidden/block state the sighted layout shows. From 900px up the
          breakdown is always rendered, so it is genuinely present and
          exposed in the accessibility tree no matter what routeOpen is —
          aria-expanded="false" there misreports a region that is actually
          on screen, a false state reported to AT, not merely a harmless
          no-op. It stays anyway because it is correct where the control
          functions, and there's no clean alternative: CSS can't
          conditionally set an HTML attribute, and making this
          viewport-conditional in JS reintroduces the hydration-mismatch
          risk this whole feature exists to avoid. */}
      {/* Route is off in preview. It is the section the hero can most afford to
          lose — "Open this order in the app" leads straight to the full card,
          which opens on the same route — and dropping it plus the warning box
          and three meta rows is what keeps the remainder toggle above the fold
          on a 900px viewport. The fill-split bar still carries the argument. */}
      {!preview && quoteReady && (
      <>
      {/* The tighter gap and padding below 360px buy back the last few pixels
          the route chain needs to render whole there; from 360 up the row has
          room and keeps the card's usual spacing. */}
      {hasAmount && <button
        type="button"
        onClick={() => setRouteOpen((v) => !v)}
        aria-expanded={routeOpen}
        className="mt-1.5 flex w-full items-center gap-1.5 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3 py-2.5 text-[13px] min-[360px]:gap-2 min-[360px]:px-3.5"
      >
        <span className="flex-shrink-0 font-mono text-[11px] text-[color:var(--m-text-secondary)]">
          Route
        </span>
        {/* The only elastic item in the row. Everything else here is
            fixed-size, but the chain grows with both hop count and symbol
            length — a two-hop route through six-character symbols is wider
            than a phone. `min-w-0` overrides the `min-width: auto` a flex
            item gets by default, which is what otherwise pins this span at
            its min-content width and pushes the row past the viewport;
            `justify-end` then makes the clip fall on the leading token,
            which the "you pay" card directly above already names. Same
            treatment the hop breakdown below already uses. */}
        <span className="ml-auto flex min-w-0 items-center justify-end gap-1.5 overflow-hidden font-mono text-[12.5px] text-[color:var(--m-text-primary)]">
          {quote.route.map((t, i) => (
            <span key={t.symbol + i} className="flex flex-shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-[color:var(--m-text-secondary-2)]">→</span>}
              <TokenImageIcon symbol={t.symbol} color={tokenColor(t.symbol)} logoURI={t.logoURI} size="sm" className="!h-[17px] !w-[17px] flex-shrink-0" />
              <span className="text-[12px]">{t.symbol}</span>
            </span>
          ))}
        </span>
        {/* Dropped below 390px, which is where the full row stops fitting: a
            three-token chain plus this pill needs ~336px of content box and
            only has ~310px at 360. It is the one thing here that can go
            without losing information — the chain beside it already draws one
            arrow per hop, so the count is a second reading of what is already
            on screen. Dropping it is what lets the chain render whole on a
            phone instead of falling back on the clip above. */}
        <span className="hidden flex-shrink-0 rounded-full border border-[color:var(--m-border)] px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--m-text-secondary-2)] min-[390px]:inline">
          {quote.hops.length} {quote.hops.length === 1 ? "hop" : "hops"}
        </span>
        {/* Hidden from 900px up, where the breakdown is always open and the
            control has nothing to disclose. The button still toggles
            `routeOpen`; that is harmless there and keeps the markup identical
            across the breakpoint. */}
        {/* In preview the breakdown is never force-open, so the chevron always
            has something to disclose and always shows — which also makes
            aria-expanded unambiguously correct there. */}
        <span
          className={cn(
            "flex-shrink-0 text-[11px] text-[color:var(--m-text-secondary-2)] transition-transform",
            !preview && "min-[900px]:hidden",
            routeOpen && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>}
      {/* Always rendered, shown by CSS. Desktop keeps it open because the
          right column has the room and this page's job is route transparency;
          mobile keeps today's chevron and today's collapsed default. A media
          query rather than a viewport read, so there is nothing to mismatch
          on hydration. */}
      {hasAmount && <div
        className={cn(
          "-mt-1.5 rounded-b-[13px] border border-t-0 border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3.5 pb-3 pt-2.5",
          routeOpen ? "block" : cn("hidden", !preview && "min-[900px]:block")
        )}
      >
          {quote.hops.map((h, i) => {
            const mpct = h.inUsd > 0 ? Math.round((h.matchedUsd / h.inUsd) * 100) : 0;
            const ppct = 100 - mpct;
            const matchedFrom = tok(h.matchedUsd / h.from.priceUsd, displayDec(h.from));
            const placedFrom =
              h.placedUsd > 0 ? `${tok(h.placedUsd / h.from.priceUsd, displayDec(h.from))} ${h.from.symbol}` : "—";
            return (
              <div
                key={i}
                className={cn("flex gap-2.5 py-2.5", i > 0 && "border-t border-[color:var(--m-border)]")}
              >
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] bg-[color:var(--m-primary)]/15 font-mono text-[9px] font-medium text-[color:var(--m-primary)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[12px]">
                    <b className="font-mono font-medium text-[color:var(--m-text-primary)]">
                      {h.from.symbol} → {h.to.symbol}
                    </b>
                    <span className="font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
                      depth {money(h.depthUsd)}
                    </span>
                  </div>
                  <div className="my-1.5 flex h-1.5 overflow-hidden rounded border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
                    <span className="bg-[color:var(--m-success)]" style={{ width: `${mpct}%` }} />
                    <span
                      className={cn(placeOn ? "bg-[color:var(--m-primary)]" : "bg-[color:var(--m-border)]")}
                      style={{ width: `${ppct}%` }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[11px] text-[color:var(--m-text-secondary)]">
                    <span>
                      matched <b className="font-normal text-[color:var(--m-text-primary)]">{matchedFrom} {h.from.symbol}</b> → {h.to.symbol}
                    </span>
                    <span>
                      placed <b className="font-normal text-[color:var(--m-text-primary)]">{placedFrom}</b>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>}
      </>
      )}

      {/* Fill split */}
      {quoteReady && (
      <div className="mx-1 mb-0.5 mt-2 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3 py-2.5">
        <div className="flex h-[9px] overflow-hidden rounded-md border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
          <span className="bg-[color:var(--m-success)]" style={{ width: `${fillPct}%` }} />
          {remPct > 0 && (
            <span
              className={cn(
                disposition === "lp"
                  ? "bg-[color:var(--m-logo)]"
                  : disposition === "limit"
                    ? "bg-[color:var(--m-primary)]"
                    : "bg-[color:var(--m-border)]"
              )}
              style={{ width: `${remPct}%` }}
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-[color:var(--m-text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[color:var(--m-success)]" />
            Delivered now <b className="font-mono font-medium text-[color:var(--m-text-primary)]">{fillPct}%</b>
          </span>
          {remPct > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-[3px]",
                  disposition === "lp"
                    ? "bg-[color:var(--m-logo)]"
                    : disposition === "limit"
                      ? "bg-[color:var(--m-primary)]"
                      : "bg-[color:var(--m-border)]"
                )}
              />
              {disposition === "lp" ? "Earning as LP" : disposition === "limit" ? "Rests as limit" : "Refunded"}{" "}
              <b className="font-mono font-medium text-[color:var(--m-text-primary)]">{remPct}%</b>
            </span>
          )}
        </div>
      </div>
      )}

      {/* Remainder disposition */}
      {quoteReady && (
      <div className="mx-1 mb-0.5 mt-1.5 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between text-[12.5px] text-[color:var(--m-text-secondary)]">
          <span>Unmatched remainder</span>
          <b className="font-mono font-medium text-[color:var(--m-text-primary)]">
            {anyPlaced ? money(quote.placedUsd) : "none at this size"}
          </b>
        </div>
        <div className="flex gap-[3px] rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[3px]">
          {dispositions.map((d) => {
            const on = disposition === d.key;
            return (
              <button
                key={d.key}
                type="button"
                disabled={!anyPlaced}
                onClick={() => setDisposition(d.key)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-[7px] px-1 py-2 text-[11.5px] font-medium transition-colors",
                  on
                    ? d.key === "lp"
                      ? "bg-[color:var(--m-surface)] text-[color:var(--m-logo)] shadow-sm"
                      : "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-sm"
                    : "text-[color:var(--m-text-secondary)]",
                  !anyPlaced && "cursor-not-allowed opacity-45"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="mx-0.5 mt-2 font-mono text-[11px] text-[color:var(--m-text-secondary-2)]">
          {dispSub}
        </div>

        {anyPlaced && placeOn && (
          <div className="mt-2.5 flex flex-col gap-2">
            {quote.placements.map((p, i) => {
              const rate = p.to.priceUsd / p.from.priceUsd; // 1 `to` = rate `from`
              const usd = p.inAmount * p.from.priceUsd;
              if (disposition === "limit") {
                return (
                  <RestCard
                    key={i}
                    pair={`${p.from.symbol} → ${p.to.symbol}`}
                    badge="limit"
                    badgeClass="border-[color:var(--m-primary)] text-[color:var(--m-primary)]"
                    rows={[
                      ["You place", `${tok(p.inAmount, displayDec(p.from))} ${p.from.symbol}`],
                      ["Limit price", `1 ${p.to.symbol} = ${tok(rate, 2)} ${p.from.symbol}`],
                      ["Fills to", `${tok(p.outAmount, displayDec(p.to))} ${p.to.symbol}`],
                      ["Time in force", "GTC · maker 0.00%"],
                    ]}
                    flags={p.settlesToTarget ? [] : [`⚠ settles ${p.to.symbol}, not ${getOrHub.symbol}`]}
                  />
                );
              }
              const apr = lpAprPct(p.from.symbol, p.to.symbol);
              const perDay = (usd * apr) / 100 / 365;
              const flags = [
                ...(p.settlesToTarget ? [] : [`⚠ LP sits in the ${p.to.symbol} pool, not ${getOrHub.symbol}`]),
                "Earn fees while your liquidity helps fill trades",
              ];
              return (
                <RestCard
                  key={i}
                  pair={`${p.from.symbol} → ${p.to.symbol} pool`}
                  badge={`~${apr}% APR`}
                  badgeClass="border-[color:var(--m-logo)] text-[color:var(--m-logo)]"
                  rows={[
                    ["You provide", `${tok(p.inAmount, displayDec(p.from))} ${p.from.symbol} · single-sided`],
                    ["Est. earnings", `≈ ${money(perDay)} / day`, true],
                    ["Range", `${tok(rate, 2)} – ${tok(rate * 1.04, 2)} ${p.from.symbol}/${p.to.symbol}`],
                    ["Converts to", `${tok(p.outAmount, displayDec(p.to))} ${p.to.symbol} across the band`],
                  ]}
                  flags={flags}
                />
              );
            })}
          </div>
        )}
      </div>
      )}

      {quoteReady && showWarn && !preview && (
        <div className="mx-1 mt-2 flex items-start gap-2 rounded-[11px] border border-[color:var(--m-warning)]/40 bg-[color:var(--m-warning)]/15 px-3 py-2.5 text-[12px] text-[color:var(--m-text-primary)]">
          <span className="font-medium text-[color:var(--m-warning)]">⚠</span>
          <span>
            <b className="font-medium">{remPct}% is unmatched and will be refunded as {pay.symbol}.</b>{" "}
            You can instead rest it as a limit or provide it as LP.
          </span>
        </div>
      )}
        </div>

        <div data-swap-group="c" className="min-[900px]:col-start-1 min-[900px]:row-start-2">
      {/* Meta. Preview keeps one line: "Expected out" only restates the receive
          leg two inches above it, and min-received is a number you check before
          signing — which happens in the app, not here. */}
      {preview ? (
        <div className="flex flex-col gap-2 px-2.5 pb-1 pt-3">
          <MetaRow
            k="Price impact · taker fee"
            v={`${quote.impactPct.toFixed(2)}% · ≈ ${money(quote.feeUsd)}`}
            vClass={impactClass}
          />
        </div>
      ) : (
      quoteReady ? <div className="swap-results-reveal flex flex-col gap-2 px-2.5 pb-1 pt-3">
        <MetaRow k="Expected out (now)" v={`${tok(quote.delivered, getDec)} ${getOrHub.symbol}`} />
        {anyPlaced && placeOn && (
          <MetaRow
            k={disposition === "lp" ? "Earning as LP" : "Rests as limit"}
            v={
              disposition === "lp"
                ? `≈ ${money(quote.placedUsd)} · ~${weightedApr}% APR`
                : `≈ ${money(quote.placedUsd)} · ${orderCount} order${orderCount > 1 ? "s" : ""}`
            }
          />
        )}
        <MetaRow
          k="Price impact (matched)"
          v={`${quote.impactPct.toFixed(2)}%`}
          vClass={impactClass}
        />
        <MetaRow k="Min received · slippage 0.5%" v={`${tok(quote.minReceived, getDec)} ${getOrHub.symbol}`} />
        <MetaRow k="Taker fee 0.10% · maker 0.00%" v={`≈ ${money(quote.feeUsd)}`} />
      </div> : cardExpanded && live.loading ? <SwapMetaSkeleton /> : <div className="min-h-[18px]" />
      )}

      {preview ? (
        /* Not a button. Confirming here would run the timer mock and show a
           success screen for a swap that never happened — see the variant
           note. The quote above it is real; only the execution is elsewhere. */
        <Link
          href={buildPageUrl("trade", { slug: networkSlug })}
          className="mt-2.5 block w-full rounded-[15px] bg-[color:var(--m-primary)] px-4 py-3.5 text-center text-[15px] font-semibold text-[color:var(--m-on-primary)] transition-colors hover:bg-[color:var(--m-primary-hover)]"
        >
          Open this order in the app →
        </Link>
      ) : (
        <button
          type="button"
          data-testid="swap-submit"
          onClick={onPrimary}
          disabled={isConnected && (!hasAmount || insufficientBalance || !quote.execution || live.loading || !!live.error)}
          className="mt-2.5 w-full cursor-pointer rounded-[15px] bg-[color:var(--m-primary)] px-4 py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] transition-colors hover:bg-[color:var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {insufficientBalance
            ? buttonLabel
            : live.loading
              ? "Getting quote…"
              : live.error
                ? live.error  // the gateway names the cause; see lib/swap/routeQuote
                : buttonLabel}
        </button>
      )}
        </div>
      </div>
      </>
      )}

      <TokenPicker
        open={picker !== null}
        side={picker ?? "pay"}
        tokens={tokens}
        hub={hub}
        currentSymbol={picker === "pay" ? pay.symbol : (get?.symbol ?? "")}
        otherSymbol={picker === "pay" ? (get?.symbol ?? "") : pay.symbol}
        networkName={networkName}
        onSelect={pick}
        onClose={() => setPicker(null)}
      />

      {flowOpen && get && !preview && (
        <SwapFlow
          pay={pay}
          get={get}
          quote={quote}
          disposition={disposition}
          networkName={networkName}
          onClose={() => setFlowOpen(false)}
          useExecution={useRealSwapExecution}
        />
      )}
    </div>
  );
}

type CardMode = "trade" | "limit" | "stop";

function SwapCardHeader({
  mode,
  onMode,
  chartOpen,
  onChart,
  settingsOpen,
  onSettings,
  slippagePct,
  onSlippage,
  deadlineMinutes,
  onDeadline,
}: {
  mode: CardMode;
  onMode: (mode: CardMode) => void;
  chartOpen: boolean;
  onChart: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  slippagePct: number;
  onSlippage: (value: number) => void;
  deadlineMinutes: number;
  onDeadline: (value: number) => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = tabsRef.current;
    const pill = pillRef.current;
    const active = bar?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!pill || !active) return;
    const previous = pill.style.transition;
    pill.style.transition = "none";
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    pill.style.width = `${active.offsetWidth}px`;
    void pill.offsetWidth;
    pill.style.transition = previous;
  }, []);

  function select(next: CardMode, element: HTMLButtonElement) {
    onMode(next);
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.transform = `translateX(${element.offsetLeft}px)`;
    pill.style.width = `${element.offsetWidth}px`;
  }

  return (
    <div className="relative flex items-center justify-between px-2 pb-2 pt-1">
      <div ref={tabsRef} className="t-tabs !gap-0 !bg-transparent !p-0" role="tablist" aria-label="Order type">
        <span ref={pillRef} className="t-tabs-pill !top-0 !h-9 bg-[color:var(--m-surface-2)]" aria-hidden="true" />
        {(["trade", "limit", "stop"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={(event) => select(item, event.currentTarget)} className={cn("t-tab !h-9 !px-3 text-[14px] font-medium capitalize", mode === item ? "!text-[color:var(--m-text-primary)]" : "!text-[color:var(--m-text-secondary)]")}>
            {item}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onChart} aria-pressed={chartOpen} aria-label="Toggle price chart" className={cn("hidden h-9 w-9 items-center justify-center rounded-full text-[color:var(--m-text-secondary)] transition-colors hover:bg-[color:var(--m-surface-2)] min-[900px]:flex", chartOpen && "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]")}>
          <BarChart3 size={18} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onSettings} aria-expanded={settingsOpen} aria-label="Trade settings" className={cn("flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--m-text-secondary)] transition-colors hover:bg-[color:var(--m-surface-2)]", settingsOpen && "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]")}>
          <Settings2 size={18} strokeWidth={1.8} />
        </button>
      </div>
      <div data-origin="top-right" className={cn("t-dropdown absolute right-1 top-11 z-30 w-[300px] rounded-[18px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 shadow-xl", settingsOpen && "is-open")}>
        <div className="mb-4 text-[16px] font-medium text-[color:var(--m-text-primary)]">Trade settings</div>
        <label className="block text-[12px] text-[color:var(--m-text-secondary)]">Max slippage</label>
        <div className="mt-2 flex gap-1.5">
          {[0.001, 0.005, 0.01].map((value) => <button key={value} type="button" onClick={() => onSlippage(value)} className={cn("flex-1 rounded-full border border-[color:var(--m-border)] px-2 py-2 text-[12px]", slippagePct === value ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]" : "text-[color:var(--m-text-primary)]")}>{value * 100}%</button>)}
        </div>
        <label className="mt-4 block text-[12px] text-[color:var(--m-text-secondary)]">Transaction deadline</label>
        <div className="mt-2 flex items-center rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-background)] px-3">
          <input type="number" min={1} max={180} value={deadlineMinutes} onChange={(event) => onDeadline(Math.max(1, Number(event.target.value) || 1))} className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-[14px] font-normal text-[color:var(--m-text-primary)] outline-none" />
          <span className="text-[12px] text-[color:var(--m-text-secondary)]">minutes</span>
        </div>
      </div>
    </div>
  );
}

function ConditionalOrderCard({ mode, networkName, pay, get, hub, payBalance, getBalance, connected, onConnect, onFlip, onPickPay, onPickGet }: { mode: Exclude<CardMode, "trade">; networkName: string; pay: SwapToken; get: SwapToken | null; hub: SwapToken; payBalance: number; getBalance: number; connected: boolean; onConnect: () => void; onFlip: () => void; onPickPay: () => void; onPickGet: () => void }) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: pay.chainId });
  const { writeContractAsync } = useWriteContract();
  const [sellText, setSellText] = useState("");
  const [priceText, setPriceText] = useState("");
  const router = useRouter();
  const [limitPriceText, setLimitPriceText] = useState("");
  const [expiry, setExpiry] = useState("1 week");
  const [submitting, setSubmitting] = useState<"approval" | "order" | null>(null);
  // Mirrors the trade card: the hub stands in so the route/pair reads keep their
  // types, and every path that could ACT on it is gated on `get` being real.
  const getOrHub = get ?? hub;
  const route = routeTokens(pay, getOrHub, hub);
  const multiHop = route.length > 2;
  const sell = Number(sellText) || 0;
  const price = Number(priceText) || 0;
  const executionPrice = mode === "stop" ? Number(limitPriceText) || 0 : price;
  // Depth is counted in the token being SOLD: that is the side the user is
  // adding to, so it is the number their own size is comparable against. The
  // chart displays the symbol rather than leaving it implied — depth in base and
  // depth in quote are different numbers and neither is "the" depth.
  const depthUnit: "base" | "quote" = "base";
  /**
   * The indexed cross rate, used ONLY to choose a grouping step and as the
   * last-resort seed below. It divides the two tokens' USD prices, so it is
   * right only while those two figures are in step — good enough to pick a
   * bucket size, not good enough to price an order against.
   */
  const usdCross = getOrHub.priceUsd > 0 ? pay.priceUsd / getOrHub.priceUsd : 0;
  const depth = useSwapDepth(networkName, pay, get, depthStepFor(usdCross), depthUnit);
  /**
   * The market rate this card quotes against, book first.
   *
   * `depth.mid` is the real mid of the pair's own order book — the price an order
   * placed now would sit beside. The fallback divides the two tokens' indexed USD
   * prices, which is a DERIVED cross rate: it is the right answer only while the
   * two USD figures are in step, and it silently disagrees with the book whenever
   * they are not. It stays because a market with no resting orders still needs a
   * number to seed the field with, but it is the second choice, not the first.
   */
  const marketRate = depth.mid > 0 ? depth.mid : usdCross;
  /**
   * The gateway's verdict on this exact order.
   *
   * Asked for the refusals the card cannot see for itself: whether the pair has
   * a book at all, whether that book is open for trading yet (`listingDate` is
   * compared against block time, so a market can exist and still decline), and
   * whether the price rests or crosses. Skipped entirely for a multi-hop route,
   * which already has its own explanation on screen and no single book to place
   * on — asking would spend a request to be told something the card knows.
   */
  const orderPreview = useOrderPreview({
    networkName,
    pay,
    get,
    kind: mode === "stop" ? "stop" : "limit",
    side: "buy",
    price,
    limitPrice: mode === "stop" ? Number(limitPriceText) || undefined : undefined,
    amount: sell,
    disabled: multiHop,
  });
  const buy = sell * executionPrice;
  const matchingEngine = matchingEngineAddress(pay.chainId);
  const supportsDeadlines = matchingEngineSupportsDeadlines(pay.chainId);
  const { data: forwardPair } = useReadContract({
    abi: conditionalMatchingEngineReadAbi,
    address: matchingEngine,
    functionName: "getPair",
    args: matchingEngine && get ? [pay.address as `0x${string}`, get.address as `0x${string}`] : undefined,
    query: { enabled: Boolean(matchingEngine && pay.address && get?.address) },
  });
  const { data: reversePair } = useReadContract({
    abi: conditionalMatchingEngineReadAbi,
    address: matchingEngine,
    functionName: "getPair",
    args: matchingEngine && get ? [get.address as `0x${string}`, pay.address as `0x${string}`] : undefined,
    query: { enabled: Boolean(matchingEngine && pay.address && get?.address) },
  });
  const payIsBase = Boolean(forwardPair && forwardPair !== zeroAddress);
  const pairAddress = payIsBase ? forwardPair : reversePair;
  const pairExists = Boolean(pairAddress && pairAddress !== zeroAddress);
  // getOrHub, not get: these feed the pair lookup and the order encoding, both of
  // which are gated on a real `get` before they can run (see submitOrder).
  const base = payIsBase ? pay : getOrHub;
  const quote = payIsBase ? getOrHub : pay;
  const isBid = !payIsBase;
  const contractExecutionPrice = executionPrice > 0 ? (payIsBase ? executionPrice : 1 / executionPrice) : 0;
  const contractTriggerPrice = price > 0 ? (payIsBase ? price : 1 / price) : 0;
  const executionPriceRaw = encodeOrderPrice(contractExecutionPrice);
  const triggerPriceRaw = encodeOrderPrice(contractTriggerPrice);
  const { data: stopOrderEngine } = useReadContract({
    abi: conditionalOrderbookAbi,
    address: pairExists ? pairAddress : undefined,
    functionName: "getOperator",
    query: { enabled: mode === "stop" && pairExists },
  });
  const spender = mode === "limit" ? matchingEngine : stopOrderEngine;
  const amountRaw = parseOrderAmount(sellText, pay.decimals);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: pay.address as `0x${string}`,
    functionName: "allowance",
    args: address && spender && spender !== zeroAddress ? [address, spender] : undefined,
    query: { enabled: Boolean(address && spender && spender !== zeroAddress && amountRaw > BigInt(0)) },
  });
  const stopEngineAvailable = mode !== "stop" || Boolean(stopOrderEngine && stopOrderEngine !== zeroAddress);
  const insufficientBalance = connected && sell > payBalance;
  const pricesEncode = executionPriceRaw > BigInt(0) && (mode !== "stop" || triggerPriceRaw > BigInt(0));
  /**
   * A refusal from the gateway blocks; being unable to REACH it does not.
   *
   * Those are different states and collapsing them is the failure mode to avoid:
   * an unreachable gateway would otherwise disable the button and tell the user
   * their order is invalid, which is false and stops them trading over our
   * outage. The chain re-checks everything anyway, so an unverified order is
   * allowed through and reverts loudly at worst — while a KNOWN refusal is worth
   * stopping, because it is certain and costs a wallet prompt to discover.
   */
  const previewRefuses = orderPreview.preview?.ok === false;
  const ready = amountRaw > BigInt(0) && price > 0 && executionPrice > 0 && pricesEncode && !insufficientBalance && !multiHop && pairExists && stopEngineAvailable && Boolean(matchingEngine && address) && !previewRefuses && !orderPreview.checking;
  const busy = submitting !== null;
  const label = !connected
    ? "Connect wallet"
    : orderPreview.checking
      ? "Checking…"
      : previewRefuses
        // The gateway's own sentence, not a generic one: it names the actual
        // refusal (no book, not open yet, band cannot fill) where "Enter details"
        // would send the user hunting.
        ? (orderPreview.preview?.reason ?? "This order cannot be placed")
        : multiHop
      ? "Choose a direct pair"
      : !matchingEngine
        ? "Orders unavailable on this network"
        : !pairExists
          ? "Pair is not listed"
          : !stopEngineAvailable
            ? "Stop orders unavailable for this pair"
            : insufficientBalance
              ? `Insufficient ${pay.symbol} balance`
              : !pricesEncode && price > 0 && executionPrice > 0
                ? "Price is below 8-decimal precision"
            : !ready
              ? `Enter ${mode === "stop" ? "trigger and " : ""}order details`
              : submitting === "approval"
                ? `Approving ${pay.symbol}…`
                : submitting === "order"
                  ? `Submitting ${mode} order…`
                  : `Place ${mode} order`;

  async function submitOrder() {
    // The receive leg starts unchosen; there is no order to encode without it.
    if (!get) return;
    if (!connected) {
      onConnect();
      return;
    }
    if (!ready || !address || !matchingEngine || !spender || spender === zeroAddress || !publicClient) return;
    try {
      if (chainId !== pay.chainId) await switchChainAsync({ chainId: pay.chainId });
      if (typeof allowance !== "bigint" || allowance < amountRaw) {
        setSubmitting("approval");
        const approvalHash = await writeContractAsync({
          abi: erc20Abi,
          address: pay.address as `0x${string}`,
          functionName: "approve",
          args: [spender, amountRaw],
          chainId: pay.chainId,
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash, timeout: 120_000 });
        if (approvalReceipt.status !== "success") throw new Error(`${pay.symbol} approval reverted`);
        await refetchAllowance();
      }

      setSubmitting("order");
      const expirySeconds = expiry === "1 day" ? 86_400 : expiry === "1 month" ? 2_592_000 : 604_800;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + expirySeconds);
      let hash: `0x${string}`;
      if (mode === "limit") {
        // `isBid` moved from a function-name choice (limitBuy vs limitSell) to a
        // struct field, so the buy and sell branches that used to call two
        // different deadline-aware entry points now collapse into one createOrder
        // call — that collapse is the whole point of the new struct shape.
        hash = supportsDeadlines
          ? await writeContractAsync({
              abi: createOrderAbi,
              address: matchingEngine,
              functionName: "createOrder",
              args: [{
                base: base.address as `0x${string}`,
                quote: quote.address as `0x${string}`,
                isBid,
                isLimit: true,
                orderId: 0,
                price: executionPriceRaw,
                amount: amountRaw,
                n: ORDER_MATCH_LIMIT,
                recipient: address,
                isMaker: true,
                slippageLimit: 0,
                deadline,
              }],
              chainId: pay.chainId,
            })
            : isBid
              ? await writeContractAsync({
                  abi: legacyLimitOrderAbi,
                  address: matchingEngine,
                  functionName: "limitBuy",
                  args: [{
                    base: base.address as `0x${string}`,
                    quote: quote.address as `0x${string}`,
                    price: executionPriceRaw,
                    amount: amountRaw,
                    isMaker: true,
                    n: ORDER_MATCH_LIMIT,
                    recipient: address,
                  }],
                  chainId: pay.chainId,
                })
              : await writeContractAsync({
                  abi: legacyLimitOrderAbi,
                  address: matchingEngine,
                  functionName: "limitSell",
                  args: [{
                    base: base.address as `0x${string}`,
                    quote: quote.address as `0x${string}`,
                    price: executionPriceRaw,
                    amount: amountRaw,
                    isMaker: true,
                    n: ORDER_MATCH_LIMIT,
                    recipient: address,
                  }],
                  chainId: pay.chainId,
                });
      } else {
        hash = await writeContractAsync({
          abi: stopOrderEngineAbi,
          address: stopOrderEngine as `0x${string}`,
          functionName: "placeStopLimit",
          args: [base.address as `0x${string}`, quote.address as `0x${string}`, isBid, triggerPriceRaw, executionPriceRaw, amountRaw, address, deadline],
          chainId: pay.chainId,
        });
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error(`${mode} order reverted`);
      /**
       * The link is the point, not decoration.
       *
       * "Order placed" was the last thing this surface said until something
       * filled — which for an order parked below the market can be days — and the
       * amount field clears on the next line, so nothing on screen was left to
       * show anything was pending. The swap card has no open-orders table of its
       * own; the portfolio does.
       *
       * Tab-aware because a stop order is NOT in Open orders: it is held by the
       * stop engine until its trigger and has its own tab. Sending both to the
       * default would tell someone their stop order had vanished.
       */
      toast.success(`${mode === "limit" ? "Limit" : "Stop-limit"} order placed`, {
        description:
          mode === "limit"
            ? "Resting on the book until it fills."
            : "Armed — it becomes a limit order when the trigger is hit.",
        action: {
          label: "View",
          onClick: () =>
            router.push(`/portfolio?tab=${mode === "limit" ? "orders" : "stopOrders"}`),
        },
        duration: 8000,
      });
      setSellText("");
    } catch (error) {
      toastContractError(error, `Could not place ${mode} order`, {
        chainId: pay.chainId,
        /**
         * What this card can actually do about a refusal.
         *
         * `use-market-price` only exists in stop mode, which is the one mode with a price
         * field to write into; in limit mode the intent resolves to nothing and no button
         * renders, which is the correct degrade rather than a control that does nothing.
         *
         * `browse-markets` answers a pair the exchange does not have.
         *
         * No `switch-to-limit`: it answers a market order with an empty book to cross, and
         * this card only ever places orders that REST. The intent cannot arise here, so
         * wiring it would be a handler for an error this surface cannot produce.
         */
        fixes: {
          ...(mode === "stop" && price
            ? { "use-market-price": () => setLimitPriceText(String(price)) }
            : {}),
          "browse-markets": () =>
            router.push(buildPageUrl("explore", { slug: networkNameToSlug[networkName] })),
        },
      });
    } finally {
      setSubmitting(null);
    }
  }

  return <div className="relative space-y-1">
    <div className="rounded-[15px] bg-[color:var(--m-background)] p-4">
      <div className="flex items-center justify-between gap-3 text-[13px] text-[color:var(--m-text-secondary)]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span>{mode === "stop" ? "Trigger when 1" : "When 1"}</span>
          <button
            type="button"
            onClick={onPickPay}
            aria-label={`Select base token, currently ${pay.symbol}`}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] py-1 pl-1 pr-2 font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
          >
            <TokenImageIcon symbol={pay.symbol} color={tokenColor(pay.symbol)} logoURI={pay.logoURI} size="sm" className="!h-4 !w-4" />
            <span>{pay.symbol}</span>
            <span className="text-[9px] text-[color:var(--m-text-secondary-2)]">▾</span>
          </button>
          <span>is worth</span>
        </div>
        <button type="button" onClick={onFlip} aria-label="Flip pair">⇅</button>
      </div>
      <div className="mt-2 flex items-center gap-2"><input inputMode="decimal" type="number" step="any" min={0} onWheel={(e) => e.currentTarget.blur()} value={priceText} onChange={(event) => setPriceText(event.target.value)} placeholder={String(marketRate)} className="min-w-0 flex-1 bg-transparent font-mono text-[30px] font-normal text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" /><TokenButton token={get} onClick={onPickGet} /></div>
      <div className="mt-3 flex gap-2">{["Market", "+1%", "+5%", "+10%"].map((preset, index) => <button key={preset} type="button" onClick={() => setPriceText(String(marketRate * (1 + [0, .01, .05, .1][index]!)))} className="rounded-full border border-[color:var(--m-border)] px-3 py-1 text-[12px] text-[color:var(--m-text-primary)]">{preset}</button>)}</div>
      {mode === "stop" && <div className="mt-4 border-t border-[color:var(--m-border)] pt-3"><label className="text-[12px] text-[color:var(--m-text-secondary)]">Limit price after trigger</label><div className="mt-1 flex items-center gap-2"><input inputMode="decimal" type="number" step="any" min={0} onWheel={(e) => e.currentTarget.blur()} value={limitPriceText} onChange={(event) => setLimitPriceText(event.target.value)} placeholder="0" className="min-w-0 flex-1 bg-transparent font-mono text-[22px] font-normal text-[color:var(--m-text-primary)] outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" /><span className="text-[13px] text-[color:var(--m-text-secondary)]">{get ? get.symbol : ""}</span></div></div>}
    </div>
    {/*
      Right on desktop, below on mobile — CSS only, one tree, no JavaScript
      reading the viewport (same rule as the swap card's own two-column layout
      and the OG Pass countdown). It sits in the STACK, so the mobile position
      falls out of source order; from 900px it docks beside the card instead.

      Not `data-swap-group="b"`: those groups only exist in trade mode. This card
      REPLACES them when mode !== "trade", and the price input only exists here,
      so the group grid and the price can never coexist.
    */}
    {get && (
      /*
       * Docked at 1200px, not 900. The card is 430px and centred and this is
       * 340px, so parking it at `left-full` needs roughly 1130px of viewport
       * before it stops running off the right edge — at 900 it renders into
       * space that is not there. 1200 is also the width AppShell brings in its
       * own chrome at, so the card gains a right-hand neighbour at the same
       * point the rest of the app widens.
       */
      <div className="min-[1200px]:absolute min-[1200px]:left-full min-[1200px]:top-0 min-[1200px]:ml-3 min-[1200px]:w-[340px]">
        <SwapDepthChart
          pairSymbol={depth.pairSymbol || `${pay.symbol}/${get?.symbol ?? ""}`}
          bids={depth.bids}
          asks={depth.asks}
          ranges={depth.ranges}
          mid={depth.mid}
          limitPrice={mode === "stop" ? Number(limitPriceText) || undefined : price || undefined}
          triggerPrice={mode === "stop" ? price || undefined : undefined}
          side="bid"
          unit={depthUnit}
          unitSymbol={depthUnit === "base" ? pay.symbol : (get?.symbol ?? "")}
          loading={depth.loading}
        />
      </div>
    )}
    <div className="rounded-[15px] bg-[color:var(--m-background)] p-4">
      <div className="text-[13px] text-[color:var(--m-text-secondary)]">Sell</div><div className="mt-2 flex items-center gap-2"><input inputMode="decimal" type="number" step="any" min={0} onWheel={(e) => e.currentTarget.blur()} value={sellText} onChange={(event) => setSellText(event.target.value)} placeholder="0" className="min-w-0 flex-1 bg-transparent font-mono text-[30px] font-normal text-[color:var(--m-text-primary)] outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]" /><TokenButton token={pay} onClick={onPickPay} /></div><div className="mt-1 text-right text-[12px] text-[color:var(--m-text-secondary)]">Balance {tok(payBalance, displayDec(pay))} {pay.symbol}</div>
    </div>
    <div className="relative rounded-[15px] bg-[color:var(--m-background)] p-4"><button type="button" onClick={onFlip} className="absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-xl border border-[color:var(--m-surface)] bg-[color:var(--m-background)]">↓</button><div className="text-[13px] text-[color:var(--m-text-secondary)]">Buy</div><div className="mt-2 flex items-center gap-2"><div className="min-w-0 flex-1 font-mono text-[30px] font-normal text-[color:var(--m-text-primary)]">{buy > 0 ? tok(buy, displayDec(getOrHub)) : "0"}</div><TokenButton token={get} onClick={onPickGet} /></div><div className="mt-1 text-right text-[12px] text-[color:var(--m-text-secondary)]">Balance {tok(getBalance, displayDec(getOrHub))} {get ? get.symbol : ""}</div></div>
    {/* The verdict as a line, not only as a disabled button. A greyed-out CTA
        says "no" without saying why, and the reason is the part a user can act
        on. Silent when the gateway is unreachable: that is our problem, not a
        fact about their order. */}
    {!multiHop && orderPreview.preview && (
      <div
        className={cn(
          "rounded-[14px] px-4 py-2 text-[12px] leading-5",
          orderPreview.preview.ok
            ? "text-[color:var(--m-text-secondary)]"
            : "border border-[color:var(--m-warning)]/30 bg-[color:var(--m-warning)]/10 text-[color:var(--m-text-primary)]",
        )}
      >
        {orderPreview.preview.ok
          ? orderPreview.preview.outcome === "crosses"
            ? "Crosses the market — this fills immediately rather than resting."
            : "Rests on the book — fills as the market crosses your price."
          : orderPreview.preview.reason}
      </div>
    )}
    {multiHop && <div className="rounded-[14px] border border-[color:var(--m-warning)]/30 bg-[color:var(--m-warning)]/10 px-4 py-3 text-[12px] leading-5 text-[color:var(--m-text-primary)]"><b className="font-medium">Conditional orders use one book.</b> {pay.symbol} → {get?.symbol ?? ""} routes through {route.slice(1, -1).map((token) => token.symbol).join(", ")}. Select a directly listed pair to place a {mode} order.</div>}
    <div className="flex items-center justify-between px-4 py-3"><span className="text-[13px] text-[color:var(--m-text-secondary)]">Expiry</span><div className="flex gap-1">{["1 day", "1 week", "1 month"].map((value) => <button key={value} type="button" onClick={() => setExpiry(value)} className={cn("rounded-full border border-[color:var(--m-border)] px-2.5 py-1 text-[11px]", expiry === value && "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]")}>{value}</button>)}</div></div>
    <button type="button" disabled={connected && (!ready || busy)} onClick={() => void submitOrder()} className="w-full rounded-[15px] bg-[color:var(--m-primary)] px-4 py-4 text-[15px] font-medium text-[color:var(--m-on-primary)] disabled:cursor-not-allowed disabled:bg-[color:var(--m-surface-2)] disabled:text-[color:var(--m-text-secondary-2)]">{label}</button>
  </div>;
}

/**
 * Both sides of the trade, stacked in one flyout — pay on top, receive below,
 * one shared timeframe control at the foot.
 *
 * Each row prices its own token against `hub` (USDC), never against the OTHER
 * side directly: Basic can route multi-hop (`WBTC → USDC → ETH`), so a direct
 * pay/receive pair frequently doesn't exist. Pricing both against the hub is
 * what the single-token version already did, and it's what makes a receive
 * chart possible at all — there's no assumption here that a pay/receive pair
 * exists as its own market.
 *
 * One `period` state, not two: the point of showing both is comparing them
 * over the same window. Independent timeframes would answer a question
 * ("which moved more today") with two charts that aren't looking at the same
 * "today".
 */
function SwapChartPanel({ open, networkName, pay, get, hub }: { open: boolean; networkName: string; pay: SwapToken; get: SwapToken | null; hub: SwapToken }) {
  const [period, setPeriod] = useState<PairCandlePeriod>("1D");

  return <aside
    data-open={open ? "true" : "false"}
    aria-hidden={!open}
    className="t-panel-slide absolute z-10 hidden max-h-[85vh] overflow-y-auto rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 [--panel-translate-y:0px] min-[900px]:right-[calc(100%+12px)] min-[900px]:top-0 min-[900px]:block min-[900px]:w-[400px] min-[900px]:shadow-xl"
  >
    <SwapChartRow label="Pay" token={pay} hub={hub} networkName={networkName} period={period} />
    <hr className="my-3 border-[color:var(--m-border)]" />
    {/* Both rows exist to be COMPARED over one window, so with no receive token
        there is no comparison to draw — the pay row stands alone rather than the
        panel inventing a second series. */}
    {get && <SwapChartRow label="Receive" token={get} hub={hub} networkName={networkName} period={period} />}
    <div className="mt-3 flex items-center">
      <div className="flex rounded-full border border-[color:var(--m-border)] p-0.5 font-mono text-[10px] text-[color:var(--m-text-secondary)]">
        {(["1H", "1D", "1W", "1M", "1Y"] as PairCandlePeriod[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={period === option}
            onClick={() => setPeriod(option)}
            className={cn("rounded-full px-2 py-1 transition-colors", period === option && "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]")}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  </aside>;
}

/** One token's price row — icon, price, change, sparkline. Reused for both
 * pay and receive so the two can never drift in how they compute or render. */
function SwapChartRow({ label, token, hub, networkName, period }: { label: "Pay" | "Receive"; token: SwapToken; hub: SwapToken; networkName: string; period: PairCandlePeriod }) {
  /**
   * A token priced against itself has no market, and asking for one is a 404
   * the query layer then RETRIES.
   *
   * This is the normal state on Arc, not an edge case: USDC is the native gas
   * asset AND the quote hub, so the Pay row opens holding the hub itself and
   * this row asked the gateway for `USDC/USDC` on every render — a pair that
   * cannot exist, since `/api/pairs` has no self-pairs to serve. Production was
   * answering 404 in a loop on /trade and /swap.
   *
   * Compared on symbol as well as address because on Arc the native view and
   * the ERC-20 view are the SAME asset behind two addresses; an address-only
   * test would call that a real pair and rebuild the bad URL.
   *
   * An empty symbol disables the query outright — `usePairCandles` already
   * gates on `Boolean(symbol)` — rather than firing and discarding the result.
   * The ratio is definitionally 1, which is exactly what `fallback` below
   * computes, so the row still renders a correct flat line.
   */
  const isHub =
    token.address.toLowerCase() === hub.address.toLowerCase() ||
    token.symbol.toUpperCase() === hub.symbol.toUpperCase();
  const candles = usePairCandles(networkName, isHub ? "" : `${token.symbol}/${hub.symbol}`, period);
  // The token's own brand colour, if the operator has catalogued this exact
  // deployment — falls back to the deterministic per-symbol hash the rest of
  // the card already uses for an unlinked token's icon. Keyed by (chainId,
  // address): the catalogue exists specifically because a symbol alone is not
  // proof of identity here.
  const brand = useTokenBrand(token.chainId, token.address);
  const accentColor = brand.data?.brandColorHex ?? tokenColor(token.symbol);
  const values = candles.data?.map((candle) => candle.c) ?? [];
  const fallback = token.priceUsd / Math.max(hub.priceUsd, 1e-12);
  const chartValues = values.length > 1 ? values : [fallback, fallback];
  const min = Math.min(...chartValues);
  const max = Math.max(...chartValues);
  const range = Math.max(max - min, Math.abs(max) * 0.002, 1e-12);
  const points = chartValues.map((value, index) => {
    const x = (index / Math.max(1, chartValues.length - 1)) * 360;
    const y = 112 - ((value - min) / range) * 76;
    return `${x},${y}`;
  }).join(" ");
  const latest = chartValues.at(-1)!;
  const first = chartValues[0]!;
  const change = latest - first;
  const changePct = first ? (change / first) * 100 : 0;
  const positive = change >= 0;
  const chartLoading = candles.isLoading || candles.isFetching;
  // The line's whole job is "did this go up or down" — a static brand hue would
  // carry the same weight whichever way it moved, which throws away the one
  // thing a sparkline is for. Same tokens the change badge below already uses,
  // so a reader never sees the arrow disagree with the line above it.
  const trendColor = positive ? "var(--m-success)" : "var(--m-error)";

  return <div>
    <div className="flex items-center gap-2">
      <TokenImageIcon symbol={token.symbol} color={accentColor} logoURI={token.logoURI} size="sm" />
      <span className="font-mono text-[12px] text-[color:var(--m-text-secondary)]">{token.symbol}</span>
      <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">{label}</span>
      <Maximize2 aria-hidden="true" className="ml-auto h-3.5 w-3.5 text-[color:var(--m-text-secondary-2)]" />
    </div>
    {chartLoading ? (
      <div className="t-skel-skeleton is-pulsing mt-2" role="status" aria-label={`Loading ${token.symbol} chart price`}>
        <span className="block h-7 w-32 rounded-full bg-[color:var(--m-surface-2)]" />
        <span className="mt-2 block h-3 w-24 rounded-full bg-[color:var(--m-surface-2)]" />
      </div>
    ) : (
      <>
        <div className="mt-1 font-mono text-[24px] text-[color:var(--m-text-primary)]">
          <span className="mr-0.5">$</span>
          <NumberFlow value={latest} locales="en-US" format={{ minimumFractionDigits: 2, maximumFractionDigits: 6 }} />
        </div>
        <div className={cn("mt-0.5 flex items-center gap-1.5 font-mono text-[12px]", positive ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]")}>
          <span aria-hidden="true">{positive ? "▲" : "▼"}</span>
          <span>{positive ? "+" : "−"}${Math.abs(change).toLocaleString("en-US", { maximumFractionDigits: 4 })} ({Math.abs(changePct).toFixed(2)}%)</span>
        </div>
      </>
    )}
    <div className="relative mt-2 h-[118px] overflow-hidden rounded-xl bg-[radial-gradient(circle,var(--m-border)_1px,transparent_1px)] [background-size:20px_20px]">
      {chartLoading ? (
        <div className="t-skel-skeleton is-pulsing flex h-full flex-col justify-end gap-3 p-3" aria-hidden="true">
          <span className="h-2 w-2/3 rounded-full bg-[color:var(--m-surface-2)]" />
          <span className="ml-auto h-2 w-4/5 rounded-full bg-[color:var(--m-surface-2)]" />
          <span className="h-2 w-full rounded-full bg-[color:var(--m-surface-2)]" />
        </div>
      ) : (
        <svg viewBox="0 0 360 120" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id={`swap-chart-fill-${label === "Pay" ? "pay" : "receive"}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,120 ${points} 360,120`} fill={`url(#swap-chart-fill-${label === "Pay" ? "pay" : "receive"})`} />
          <polyline points={points} fill="none" stroke={trendColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx="360" cy={points.split(" ").at(-1)?.split(",")[1]} r="4" fill={trendColor} stroke="var(--m-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  </div>;
}

/** `token` is nullable because the receive leg starts unchosen. An empty slot is
 *  drawn as a filled prompt rather than an outlined chip: it is the one control
 *  the card is waiting on, so it should read as the next thing to do, not as a
 *  disabled twin of the pay button. */
function TokenButton({ token, networkName, onClick }: { token: SwapToken | null; networkName?: string; onClick: () => void }) {
  if (!token) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[color:var(--m-primary)] py-1.5 pl-3.5 pr-2.5 text-[14.5px] font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
      >
        <span>Select token</span>
        <span className="text-[11px] opacity-80">▾</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] py-1.5 pl-1.5 pr-2.5 text-[14.5px] font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
    >
      <TokenImageIcon symbol={token.symbol} color={tokenColor(token.symbol)} logoURI={token.logoURI} size="md" chainName={networkName} className="!h-6 !w-6" />
      <span>{token.symbol}</span>
      <span className="text-[11px] text-[color:var(--m-text-secondary-2)]">▾</span>
    </button>
  );
}

function SwapResultsSkeleton() {
  const bar = "rounded-full bg-[color:var(--m-surface-2)]";

  return (
    <div
      className="t-skel-skeleton is-pulsing px-1 pb-2 pt-1.5"
      role="status"
      aria-label="Updating swap results"
    >
      <div className="rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] p-3.5">
        <div className="flex items-center justify-between">
          <span className={cn(bar, "h-3 w-14")} />
          <span className={cn(bar, "h-3 w-32")} />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className={cn("py-3", row > 0 && "border-t border-[color:var(--m-border)]")}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-4 w-4 rounded-[5px] bg-[color:var(--m-surface-2)]" />
              <span className={cn(bar, "h-3 w-24")} />
              <span className={cn(bar, "ml-auto h-2.5 w-16")} />
            </div>
            <span className={cn(bar, "block h-2 w-full")} />
            <div className="mt-2 flex justify-between">
              <span className={cn(bar, "h-2.5 w-28")} />
              <span className={cn(bar, "h-2.5 w-20")} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] p-3">
        <span className={cn(bar, "block h-2.5 w-full")} />
        <div className="mt-2 flex gap-3">
          <span className={cn(bar, "h-3 w-28")} />
          <span className={cn(bar, "h-3 w-24")} />
        </div>
      </div>
      <div className="mt-2 rounded-[13px] border border-[color:var(--m-border)] bg-[color:var(--m-background)] p-3.5">
        <div className="flex justify-between">
          <span className={cn(bar, "h-3 w-32")} />
          <span className={cn(bar, "h-3 w-20")} />
        </div>
        <span className={cn(bar, "mt-3 block h-9 w-full rounded-[10px]")} />
        <span className={cn(bar, "mt-2 block h-2.5 w-3/4")} />
      </div>
      <span className="sr-only">Updating swap results…</span>
    </div>
  );
}

function InlineSkeleton({ className }: { className: string }) {
  return (
    <span className="t-skel-skeleton is-pulsing inline-flex align-middle" aria-hidden="true">
      <span className={cn("h-2.5 rounded-full bg-[color:var(--m-surface-2)]", className)} />
    </span>
  );
}

function SwapMetaSkeleton() {
  return (
    <div className="t-skel-skeleton is-pulsing flex flex-col gap-2 px-2.5 pb-1 pt-3" aria-hidden="true">
      {["w-28", "w-32", "w-36", "w-24"].map((width, index) => (
        <div key={width} className="flex items-center justify-between">
          <span className={cn("h-2.5 rounded-full bg-[color:var(--m-surface-2)]", width)} />
          <span className={cn("h-2.5 rounded-full bg-[color:var(--m-surface-2)]", index % 2 ? "w-16" : "w-20")} />
        </div>
      ))}
    </div>
  );
}

function MetaRow({ k, v, vClass }: { k: string; v: string; vClass?: string }) {
  return (
    <div className="flex justify-between text-[12.5px] text-[color:var(--m-text-secondary)]">
      <span>{k}</span>
      <b className={cn("font-mono font-medium text-[color:var(--m-text-primary)]", vClass)}>{v}</b>
    </div>
  );
}

function RestCard({
  pair,
  badge,
  badgeClass,
  rows,
  flags,
}: {
  pair: string;
  badge: string;
  badgeClass: string;
  rows: [string, string, boolean?][];
  flags: string[];
}) {
  return (
    <div className="rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between border-b border-[color:var(--m-border)] pb-2 text-[13px] font-medium">
        <span className="font-mono text-[color:var(--m-text-primary)]">{pair}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.05em]",
            badgeClass
          )}
        >
          {badge}
        </span>
      </div>
      {rows.map(([k, v, em], i) => (
        <div key={i} className="flex justify-between gap-3 py-0.5 text-[12px]">
          <span className="text-[color:var(--m-text-secondary)]">{k}</span>
          <span className={cn("text-right font-mono", em ? "text-[color:var(--m-logo)]" : "text-[color:var(--m-text-primary)]")}>
            {v}
          </span>
        </div>
      ))}
      {flags.map((f, i) => (
        <div
          key={i}
          className={cn(
            "mt-2 flex items-start gap-1.5 border-t border-[color:var(--m-border)] pt-2 font-mono text-[11px]",
            f.startsWith("⚠")
              ? "text-[color:var(--m-warning)]"
              : "text-[color:var(--m-text-secondary)]"
          )}
        >
          {f}
        </div>
      ))}
    </div>
  );
}
