"use client";

/**
 * Iter liquidity + pool-launch flow. Three steps with a stepper:
 *   1 · Pair  — base/quote selectors (order swappable), fee tier, current RATE
 *               (1 base = X quote, never USD); Launch adds a starting-price input.
 *   2 · Range — the interactive v3 chart + deposit inputs + range/status summary.
 *   3 · Confirm — review → approval queue → add-liquidity tx → result.
 *
 * Market price, candles and orderbook depth come from the indexed backend.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPct } from "@/lib/pair/derive";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { CLPriceChart } from "./CLPriceChart";
import { BandPicker } from "./BandPicker";
import { BandDeposit, type DepositMode } from "./BandDeposit";
import { BandShapePicker } from "./BandShapePicker";
import { BandFollowHint } from "./BandFollowHint";
import { pairStatsFrom } from "@/lib/liquidity/auto";
import {
  allocateByShape,
  depositUnits,
  formatDepositUnits,
  resolveDepositShape,
  type DepositShape,
} from "@/lib/liquidity/shape";
import { bandBounds, mockBandSet, selectableBands } from "@/lib/liquidity/bands";
import { TokenModal } from "./TokenModal";
import { Stepper } from "@components/Atoms/Stepper";
import { ConfirmFlow } from "./ConfirmFlow";
import { FEE_TIERS, liqToken } from "@/lib/liquidity/mock";
import { resolveRate } from "@/lib/liquidity/rate";
import { findUnlisted, type UnlistedMarket } from "@/lib/liquidity/unlisted";
// One compact-USD formatter across the app; a second would drift from the
// figures the Creator tab and the Pool overview print for the same numbers.
import { usdCompact } from "@/lib/portfolio/creator";
import { singleSide, concentration } from "@/lib/liquidity/chart";
import type { ChartPeriod, FeeTier, LiqMode } from "@/lib/liquidity/types";
import { feePolicy, type MarketFeeClass } from "@/lib/fees/strategy";
import { suggestedFeeClassForPair } from "@/lib/fees/registry";
import { deploymentConfig } from "@/lib/deployments";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useDepositApr } from "@/hooks/useDepositApr";
import { usePairCandles } from "@/hooks/usePairCandles";
import { usePairLiquidityRanges } from "@/hooks/usePairLiquidityRanges";

type Step = "pair" | "fee" | "range" | "confirm";

/**
 * The stepper, which is DERIVED rather than constant.
 *
 * "Launch a pool" used to put the pair, the fee tier and the starting price on
 * one screen — three unrelated decisions stacked in a single card, where the fee
 * picker read as a detail of the pair rather than a choice of its own. Splitting
 * it means each step asks one question.
 *
 * The fee step exists only when LAUNCHING. Providing liquidity to an existing
 * pair cannot choose a tier — the pair already has one, and that surface is a
 * read-only "Canonical pair fee" card — so a step whose only content is a fact
 * would be a screen the user must click past for nothing.
 */
const LAUNCH_STEPS: { key: Step; label: string }[] = [
  { key: "pair", label: "Pair" },
  { key: "fee", label: "Fee" },
  { key: "range", label: "Range" },
  { key: "confirm", label: "Confirm" },
];
const DEPOSIT_STEPS: { key: Step; label: string }[] = [
  { key: "pair", label: "Pair" },
  { key: "range", label: "Range" },
  { key: "confirm", label: "Confirm" },
];

/**
 * Precision the amount fields are captured and split at.
 *
 * One constant because the parse, the allocation and the receipt must agree: split
 * at four places and print at two and the band rows stop summing to the deposit line
 * directly above them.
 */
const DEPOSIT_DECIMALS = 4;

function fmt(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString();
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(3);
}

export function LiquidityFlow({
  networkSlug,
  unlistedMarkets = [],
  thresholdUsd = 0,
  initialBase = "ETH",
  initialQuote = "USDC",
  depositOnly = false,
}: {
  networkSlug?: string;
  /** Real pre-graduation markets, read server-side by the page. */
  unlistedMarkets?: UnlistedMarket[];
  /** Operator-set USD of quote liquidity needed to list. */
  thresholdUsd?: number;
  initialBase?: string;
  initialQuote?: string;
  depositOnly?: boolean;
}) {
  const { displayNetworkName, defaultSpotPairData } = useMarketPageContext();
  const { isConnected } = useAccount();
  const { open } = useWalletConnect();

  const [mode, setMode] = useState<LiqMode>("provide");
  const [step, setStep] = useState<Step>(depositOnly ? "range" : "pair");
  const [base, setBase] = useState(initialBase);
  const [quote, setQuote] = useState(initialQuote);
  /**
   * 0.30% is the default for every pair, not the classifier's suggestion.
   *
   * `suggestedFeeClassForPair` returns "volatile" (1.00%) whenever either token
   * is missing from the curated registry — which is most pairs on a testnet — so
   * defaulting to it opened the flow on the MOST EXPENSIVE tier, and an LP who
   * did not read the picker shipped a pool at 1%. 0.30% is the standard tier and
   * what `strategy.ts` calls "commonly used for most pairs".
   *
   * The classification still renders underneath as a suggestion; it just no
   * longer decides for the user.
   */
  const [feeClass, setFeeClass] = useState<MarketFeeClass>("major");
  const fee = feePolicy(feeClass).feePct as FeeTier;
  const verifiedSuggestion = suggestedFeeClassForPair(displayNetworkName, base, quote);

  /**
   * The LP/protocol split, READ from the deployment registry rather than stated.
   *
   * This sentence used to read "75% of fees reward executed liquidity, 20% goes
   * to Iter and 5% to the market creator". None of the three numbers were true:
   * `BandPool._fillBand` splits a taker fee by `engine.poolFeeShare()`, which is
   * 50% on RISE, and there is NO creator share anywhere in the contract —
   * `sweepProtocolFees()` sends the entire non-LP half to `engine.feeTo()`.
   *
   * A creator share is not missing, it is unnecessary: the creator seeds the pool
   * and therefore earns as an LP already. Paying them again out of the protocol
   * half would be the same person collecting twice.
   *
   * `poolFeeShare` is DENOM-scaled at 1e8 and set per deployment, so hardcoding
   * any figure here just re-creates the drift. Omit the claim entirely when the
   * registry has no value rather than guessing one.
   */
  const lpFeeCopy = (() => {
    const share = deploymentConfig(displayNetworkName)?.poolFeeShare;
    if (typeof share !== "number") return "";
    const lpPct = Math.round((share / 1e8) * 100);
    return `; ${lpPct}% of each taker fee rewards executed liquidity and the rest goes to Iter`;
  })();
  /**
   * The launch starting price. EMPTY until the pair has a real rate or the
   * creator types one — never a seeded number.
   *
   * This was `useState("1635")`, a hardcoded literal that matched mock.ts's ETH
   * price. It rendered as "1635 USDC per ETH" in an input that looked filled in,
   * on the screen whose own notice says "You set the price". A creator who
   * accepted the default would open a market a fifth below the real rate — and
   * the first taker takes that difference.
   *
   * Initialised from the indexed rate when one exists (an unlisted pair can have
   * traded), and left blank when it does not, which is the honest state for a
   * market that does not exist yet.
   */
  const [initStr, setInitStr] = useState("");

  /**
   * The y-axis is fitted to the BANDS, not to a generic ±20% window.
   *
   * `bounds()` spans `anchor * (1 ± zoom)`, so at the old 0.2 the axis covered
   * ±20% while the bands it is meant to show are ±0.1% to ±1%. A ±0.1% band was
   * about 1.6 USDC tall inside a 654-USDC axis — sub-pixel, i.e. the band
   * shading was drawn and could not be seen.
   *
   * 2.5× the widest band leaves the outermost one filling ~40% of the height and
   * keeps the tightest one visible. Floored so a pathological band set cannot
   * collapse the axis to nothing. The zoom buttons still work from here.
   */
  const [zoom, setZoom] = useState(() => {
    const widest = Math.max(...mockBandSet().bands.map((b) => b.tolerance), 0.004);
    return Math.max(widest * 2.5, 0.01);
  });
  const [isFullRange, setIsFullRange] = useState(false);
  // Bands: the creator's tolerance set. Mock until the pool read lands — see
  // lib/liquidity/bands.ts, which is the one place that changes when it does.
  const bandSet = useMemo(() => mockBandSet(), []);
  /**
   * Bands are multi-select: a deposit may seed several in one transaction, and each
   * becomes its own position. Held sorted so it always reads in fill order, which is
   * the order the pool walks and the order the amounts are split in.
   */
  const [selectedBands, setSelectedBands] = useState<number[]>(
    () => [bandSet.bands.find((b) => b.open)?.index ?? 0],
  );
  const openBands = useMemo(() => selectableBands(bandSet, selectedBands), [bandSet, selectedBands]);
  /**
   * How the amount is spread over those bands. "curve" rather than "auto" as the
   * default: auto depends on measurements that may not exist for this pair, and a
   * default that silently degrades would make the flow's behaviour depend on data
   * the LP cannot see.
   */
  const [shape, setShape] = useState<DepositShape>("curve");
  // The tightest selected band drives anything that needs a single one to point at.
  const band = bandSet.bands[openBands[0] ?? 0];
  const toggleBand = (index: number) =>
    setSelectedBands((prev) => {
      const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      // Never leave the form with nothing selected: an empty set has no valid
      // deposit and the button would simply stop working with no explanation.
      return next.length === 0 ? prev : next.sort((a, b) => a - b);
    });
  const [depositMode, setDepositMode] = useState<DepositMode>("both");
  const [amtOne, setAmtOne] = useState("1.0");
  const [oneIsBase, setOneIsBase] = useState(true);
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const [amtBase, setAmtBase] = useState("1.0");
  const [amtQuote, setAmtQuote] = useState("1,635");

  /**
   * Warn only in PROVIDE mode. "Launch a pool" creates a market that is
   * unlisted by definition, where the same banner would be noise — and the
   * pair does not exist yet, so there is nothing to match against.
   */
  const unlisted =
    mode === "provide" ? findUnlisted(base, quote, unlistedMarkets, thresholdUsd) : null;

  const marketPair = useMemo(
    () => defaultSpotPairData.pairs.find((pair) => pair.base.symbol === base && pair.quote.symbol === quote),
    [base, defaultSpotPairData.pairs, quote],
  );
  // Resolution lives in lib/liquidity/rate.ts so the inversion rule is testable
  // without rendering this component — same split as derive/unlisted.
  const rateFor = useCallback(
    (b: string, q: string) => resolveRate(defaultSpotPairData.pairs, b, q),
    [defaultSpotPairData.pairs],
  );

  const cur = rateFor(base, quote);
  const initNum = parseFloat(initStr.replace(/,/g, "")) || cur;
  /**
   * Seed the field from the indexed rate the first time one arrives, and only
   * while the creator has not typed anything. `cur` is 0 until the pair query
   * resolves, so this cannot run on the first render and cannot overwrite input.
   */
  const seededRate = useRef(false);
  useEffect(() => {
    if (seededRate.current || initStr !== "" || !(cur > 0)) return;
    seededRate.current = true;
    setInitStr(String(cur));
  }, [cur, initStr]);
  const launch = mode === "launch";
  const anchor = launch ? initNum : cur;

  const candleQuery = usePairCandles(
    displayNetworkName,
    launch || !marketPair ? "" : marketPair.symbol,
    period,
  );
  /**
   * What Auto measures. Volatility comes from the candles already on screen; mean
   * trade size comes from the pair row, because `dayQuoteVolumeUSD / dayTradesCount`
   * is a column division and joining day buckets per pair does not scale.
   *
   * Undefined while the candles are still loading, rather than a zeroed default:
   * BandShapePicker shows Auto disabled and says why, and "measuring" is honest
   * where a default would look like a measurement that happened to say "stay tight".
   */
  const pairStats = useMemo(() => {
    const rows = candleQuery.data ?? [];
    if (rows.length < 3) return undefined;
    // The chart's own resolution, so the annualisation matches the series shown.
    const seconds = rows.length > 1 ? Math.max(60, rows[1]!.timestamp - rows[0]!.timestamp) : 60;
    // `dayTradesCount` and `rsi` are declared on `SpotPair` and arrive on the pair
    // payload; both are nullable, because a gateway older than migration 0006 omits
    // them and `pairStatsFrom` reads a missing divisor as zero rather than Infinity.
    // Until such a gateway is retired, `meanTradeUSD` can still be 0 on a live pair
    // and the exhaustion channel correctly contributes nothing.
    return pairStatsFrom(
      {
        dayQuoteVolumeUSD: marketPair?.dayQuoteVolumeUSD ?? null,
        dayTradesCount: marketPair?.dayTradesCount ?? null,
        rsi: marketPair?.rsi ?? null,
      },
      rows.map((c) => c.c),
      seconds,
    );
  }, [candleQuery.data, marketPair]);

  /**
   * The amounts being spread, in 1e4 units. Integer units because the allocator is
   * exact on bigint and a float total would round twice -- once here and once per
   * band.
   *
   * BOTH sides, not just the base: a two-sided deposit puts a slice of each token
   * into every band it seeds, so a receipt that split only the base would name half
   * of what the wallet is about to spend.
   */
  const depositTotal = useMemo(
    () => depositUnits(depositMode === "one" ? amtOne : amtBase, DEPOSIT_DECIMALS),
    [depositMode, amtOne, amtBase],
  );
  const depositQuoteTotal = useMemo(
    () => (depositMode === "one" ? BigInt(0) : depositUnits(amtQuote, DEPOSIT_DECIMALS)),
    [depositMode, amtQuote],
  );

  /**
   * The allocation, resolved once and read everywhere.
   *
   * The picker used to compute this for its own bars and nothing carried it further,
   * so the shape was a control the deposit ignored. Resolving here is what lets the
   * same numbers reach the review screen — and, when the execution seam is wired,
   * `addLiquidityAcross`, which takes exactly `resolvedShape.bands` and the amounts
   * aligned with it.
   */
  const resolvedShape = useMemo(
    () => resolveDepositShape(bandSet, openBands, depositTotal, shape, pairStats),
    [bandSet, openBands, depositTotal, shape, pairStats],
  );

  /**
   * The token the primary amount is denominated in. Single-sided deposits may bring
   * the quote, in which case there is no second side to split — the other half is
   * converted by the pool, not transferred by the LP.
   */
  const primarySymbol = depositMode === "one" && !oneIsBase ? quote : base;

  /**
   * What each band receives, formatted for the receipt.
   *
   * The quote side is allocated with the SAME weight vector rather than its own
   * resolve: a position is one share count over both reserves, so a band that took
   * 40% of the base and 30% of the quote would not be a shape, it would be two.
   */
  const bandDeposits = useMemo(() => {
    const quoteAmounts =
      depositQuoteTotal > BigInt(0)
        ? allocateByShape(depositQuoteTotal, bandSet, openBands, resolvedShape.weights)
        : null;
    return resolvedShape.bands.map((index, i) => {
      const parts = [
        `${formatDepositUnits(resolvedShape.amounts[i] ?? BigInt(0), DEPOSIT_DECIMALS)} ${primarySymbol}`,
      ];
      if (quoteAmounts) {
        parts.push(`${formatDepositUnits(quoteAmounts[i] ?? BigInt(0), DEPOSIT_DECIMALS)} ${quote}`);
      }
      return {
        index,
        tolerance: bandSet.bands[index]?.tolerance ?? 0,
        deposit: parts.join(" + "),
      };
    });
  }, [bandSet, openBands, depositQuoteTotal, resolvedShape, primarySymbol, quote]);

  const depthQuery = usePairLiquidityRanges(
    displayNetworkName,
    launch ? "" : marketPair?.base.id ?? "",
    launch ? "" : marketPair?.quote.id ?? "",
    60,
  );
  const liquidityLevels = useMemo(
    () => (depthQuery.data?.histogram ?? []).map((bin) => {
      const price = (bin.minPrice + bin.maxPrice) / 2;
      return {
        price,
        // Normalize both assets into quote units before comparing bin widths.
        liquidity: bin.quote + bin.base * price,
      };
    }),
    [depthQuery.data],
  );

  /**
   * The chart band, DERIVED from what is selected — not a control.
   *
   * A banded position stores no range and `_fillBand` reads none, so a draggable
   * min/max here would collect a number nothing receives and promise capital that
   * stops working outside it. What the chart shows instead is the outer edge of the
   * widest selected band, which is the real span the deposit covers.
   */
  const [low, high] = useMemo(() => {
    const widest = openBands.length > 0 ? openBands[openBands.length - 1] : 0;
    return bandBounds(anchor, bandSet.bands[widest]?.tolerance ?? 0.05);
  }, [anchor, bandSet.bands, openBands]);
  const syncedPairRef = useRef<string | null>(null);

  const [modal, setModal] = useState<{ open: boolean; which: "base" | "quote" }>({
    open: false,
    which: "base",
  });

  const resetRange = (_a: number) => {
    // Nothing to reset: the chart band is derived from the selected bands now.
    setIsFullRange(false);
  };

  useEffect(() => {
    if (launch || !marketPair || syncedPairRef.current === marketPair.id) return;
    syncedPairRef.current = marketPair.id;
    setIsFullRange(false);
  }, [launch, marketPair]);

  const pickToken = (sym: string) => {
    const other = modal.which === "base" ? quote : base;
    if (sym === other) return;
    if (modal.which === "base") setBase(sym);
    else setQuote(sym);
    const nextBase = modal.which === "base" ? sym : base;
    const nextQuote = modal.which === "quote" ? sym : quote;
    setFeeClass("major");
    resetRange(launch ? initNum : rateFor(nextBase, nextQuote));
    setModal((m) => ({ ...m, open: false }));
  };

  const swapOrder = () => {
    setBase(quote);
    setQuote(base);
    setFeeClass("major");
    resetRange(launch ? initNum : rateFor(quote, base));
  };

  const changeMode = (m: LiqMode) => {
    setMode(m);
    resetRange(m === "launch" ? initNum : cur);
    setStep("pair");
  };

  const changeInit = (v: string) => {
    setInitStr(v);
    const n = parseFloat(v.replace(/,/g, ""));
    if (n > 0) resetRange(n);
  };

  const side = singleSide(anchor, low, high, isFullRange);
  const inRange = isFullRange || (anchor >= low && anchor <= high);
  const eff = concentration(anchor, low, high, isFullRange);

  /**
   * What this deposit would earn. `/pool/deposit` carried no APR at all — the
   * gateway's estimator had no reader anywhere in the app.
   *
   * Addresses come from `defaultSpotPairData`, which is listing-gated, so an
   * unlisted market resolves to undefined and the row reads "—". That degrades
   * the right way: the estimator 404s for a market with no pool regardless, and
   * an unlisted launch is exactly that case.
   */
  const aprPair = useMemo(
    () =>
      (defaultSpotPairData?.pairs ?? []).find(
        (candidate) => candidate.baseSymbol === base && candidate.quoteSymbol === quote,
      ),
    [defaultSpotPairData, base, quote],
  );

  const depositApr = useDepositApr({
    networkName: displayNetworkName,
    base: aprPair?.base?.id,
    quote: aprPair?.quote?.id,
    amountBase: Number(String(amtBase).replace(/,/g, "")) || 0,
    amountQuote: Number(String(amtQuote).replace(/,/g, "")) || 0,
    minPrice: isFullRange ? undefined : low,
    maxPrice: isFullRange ? undefined : high,
  });
  // `side` still reaches ConfirmFlow, but nothing on THIS step greys an input any
  // more: a banded deposit is two-sided by construction, or converted into one.

  const STEPS = launch ? LAUNCH_STEPS : DEPOSIT_STEPS;
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[22px] pb-24 pt-12 text-[var(--m-text-primary)]">
      <header>
        <p className="mb-3.5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--m-primary-fg)]">
          <span className="font-bold text-[var(--m-logo)]">Iter</span> · liquidity
        </p>
        <h1 className="mb-3 text-[clamp(26px,3.4vw,38px)] font-medium leading-[1.06] tracking-[-0.02em]">
          {depositOnly ? "Deposit liquidity" : "Provide liquidity & launch pools"}
        </h1>
        <p className="mb-5 max-w-[72ch] text-[15.5px] text-[var(--m-text-secondary)]">
          The full flow: pick the pair &amp; fee{depositOnly ? null : " (and a starting price when launching)"}, set your range on the v3-style chart, then approve &amp; confirm. Concentrated liquidity — your capital works
          only where you set it.
        </p>
      </header>

      {/* mode + stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        {!depositOnly && <div className="inline-flex rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] p-[3px]">
          {(["provide", "launch"] as LiqMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={cn(
                "rounded-[9px] px-[18px] py-2.5 text-[13.5px] font-semibold",
                m === mode ? "bg-[var(--m-surface)] text-[var(--m-text-primary)] shadow-sm" : "text-[var(--m-text-secondary)]",
              )}
            >
              {m === "provide" ? "Provide liquidity" : "Launch a pool"}
            </button>
          ))}
        </div>}
        <Stepper label="Provide liquidity" steps={STEPS} activeIndex={stepIdx} />
      </div>

      {/* STEP 1 — PAIR */}
      {step === "pair" && (
        <div className="mx-auto max-w-[520px] rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-sm">
          <h3 className="mb-4 text-[17px] font-semibold">{launch ? "Choose the pair and starting price" : "Select a pair"}</h3>
          <div className="flex items-stretch gap-2.5">
            <TokenSelect role="Base" sym={base} chainName={displayNetworkName} onClick={() => setModal({ open: true, which: "base" })} />
            <button
              type="button"
              aria-label="Swap order"
              onClick={swapOrder}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center self-center rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface)] text-[15px] text-[var(--m-primary-fg)]"
            >
              ⇅
            </button>
            <TokenSelect role="Quote" sym={quote} chainName={displayNetworkName} onClick={() => setModal({ open: true, which: "quote" })} />
          </div>

          {/* Only when the selected pair really is a pre-graduation market.
              This is the moment the threshold is actionable: a quote-side
              deposit here is what lists it. */}
          {unlisted && (
            <div className="mt-3.5 rounded-[11px] border border-[var(--m-warning)] bg-[color:color-mix(in_srgb,var(--m-warning)_11%,transparent)] px-3.5 py-3">
              <div className="flex gap-2.5">
                <span className="shrink-0 text-[var(--m-warning-600)]">&#9651;</span>
                <p className="m-0 text-[12.5px] text-[var(--m-text-secondary)]">
                  <span className="text-[var(--m-text-primary)]">
                    {unlisted.market.symbol} is unlisted.
                  </span>{" "}
                  It holds{" "}
                  <span className="font-mono tabular-nums text-[var(--m-text-primary)]">
                    {usdCompact(unlisted.market.quoteTvlUsd)}
                  </span>{" "}
                  of the{" "}
                  <span className="font-mono tabular-nums text-[var(--m-text-primary)]">
                    {usdCompact(unlisted.thresholdUsd)}
                  </span>{" "}
                  quote liquidity it needs to list across Iter. Your {quote} deposit counts
                  toward that; your {base} deposit does not.
                </p>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--m-surface-2)]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${unlisted.progressPct}%`,
                    backgroundColor:
                      unlisted.shortfallUsd === 0
                        ? "var(--m-success)"
                        : "var(--m-text-secondary-2)",
                  }}
                />
              </div>
              <div className="mt-1 font-mono text-[10.5px] tabular-nums text-[var(--m-text-secondary-2)]">
                {unlisted.shortfallUsd === 0
                  ? "threshold met"
                  : `${usdCompact(unlisted.shortfallUsd)} to go`}
              </div>
            </div>
          )}

          {launch && (
            <>
              <div className="mb-[7px] mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
                Starting price
              </div>
              <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5">
                <input
                  value={initStr}
                  placeholder={`${quote} per ${base}`}
                  inputMode="decimal"
                  onChange={(e) => changeInit(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[19px] font-semibold tabular-nums text-[var(--m-text-primary)] outline-none"
                />
                <span className="font-mono text-xs text-[var(--m-text-secondary-2)]">{quote} per {base}</span>
              </div>
            </>
          )}

          <div
            className={cn(
              "mt-3.5 flex items-center justify-between rounded-[11px] border px-3.5 py-3 text-[13px]",
              launch
                ? "border-[color-mix(in_srgb,var(--m-accent)_34%,transparent)] bg-[color-mix(in_srgb,var(--m-accent)_10%,transparent)]"
                : "border-[var(--m-border)] bg-[var(--m-surface-2)]",
            )}
          >
            <span className="text-[var(--m-text-secondary)]">{launch ? "This pair has no pool" : "Current rate"}</span>
            <span className="font-mono font-semibold tabular-nums">
              {launch
                ? "You set the price →"
                : cur > 0
                  ? `1 ${base} = ${fmt(cur)} ${quote}`
                  : "—"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setStep(launch ? "fee" : "range")}
            /* Every later step is drawn around the anchor — the chart axis, the
               band bounds, the deposit split. Leaving here without a positive
               price is what made a fabricated default necessary in the first
               place. */
            disabled={launch && !(initNum > 0)}
            className="mt-3 w-full rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue
          </button>
        </div>
      )}

      {/* STEP 2 — FEE (launch only) */}
      {step === "fee" && (
        <div className="mx-auto max-w-[520px] rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-sm">
          <h3 className="mb-1 text-[17px] font-semibold">Choose a fee tier</h3>
          <p className="mb-4 text-[13px] text-[var(--m-text-secondary)]">
            What takers pay on {base}/{quote}, and the compensation for the liquidity you are about to provide.
          </p>

          <div className="mb-[7px] mt-3.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
            <span>Market fee class</span>
            <span>{launch ? "Maker fee 0%" : "Fixed for this pair"}</span>
          </div>
          {launch ? (
            <div className="grid grid-cols-2 gap-1.5">
            {/* EVERY tier is selectable for every pair. There used to be an
                `eligible` gate here that allowed 0.01% only when the pair
                classified as `stable` and 0.05% only when it classified as
                `correlated` — which, since the classifier only returns those for
                two same-peg fiat tokens or two assets sharing a reference asset,
                made both tiers unreachable for essentially every real pair.

                It also blocked ETH/USDC at 0.05%, one of the highest-volume
                pools in DeFi, while strategy.ts cites ETH/USDC as the example
                for 0.30%. Uniswap v3 has no equivalent rule: its factory checks
                only that a fee tier is enabled globally
                (`feeAmountTickSpacing[fee] != 0`) and imposes nothing per pair.

                The classification is kept — as the SUGGESTION rendered below.
                Telling an LP which tier suits their pair is useful; refusing to
                let them pick another one is not, and the fee is their own
                compensation to price. */}
              {FEE_TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFeeClass(t.key)}
                  className={cn(
                    "flex min-h-[82px] flex-col justify-between rounded-[9px] border px-3 py-2.5 text-left",
                    t.value === fee
                      ? "border-[var(--m-primary)] bg-[var(--m-primary-100)] text-[var(--m-primary-fg)]"
                      : "border-[var(--m-border)] bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="font-mono text-[15px] tabular-nums">{t.value}%</span>
                    {t.value === fee && <span aria-hidden>●</span>}
                  </span>
                  <span className="text-[10px] leading-snug text-[var(--m-text-secondary-2)]">{t.description}.</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[9px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--m-text-primary)]">Canonical pair fee</span>
                <span className="font-mono text-[12px] text-[var(--m-text-secondary)]">Onchain · read only</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary-2)]">
                Adding liquidity uses the fee class already assigned to this pair. A second pool cannot be created by choosing another tier.
              </p>
            </div>
          )}
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary)]">
            {launch ? <>Suggested for {base}/{quote}: <span className="text-[var(--m-text-primary)]">{feePolicy(verifiedSuggestion).label}</span>. A suggestion, not a restriction—any tier can be chosen. It is derived from registered token addresses, never symbols. </> : null}Iter keeps one canonical book per pair{lpFeeCopy}.
          </p>


          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => setStep("pair")}
              className="rounded-[13px] border border-[var(--m-border)] px-4 py-3.5 text-[15px] text-[var(--m-text-secondary)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep("range")}
              className="flex-1 rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--m-primary-hover)]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — RANGE */}
      {step === "range" && (
        <div className="grid items-start gap-[18px] [grid-template-columns:1fr] min-[860px]:[grid-template-columns:1fr_340px]">
          <CLPriceChart
            baseSym={base}
            quoteSym={quote}
            rate={anchor}
            low={low}
            high={high}
            /* Bands ARE the overlay now — never a full-range shade, which would
               draw a bound the position does not have. */
            isFullRange={false}
            zoom={zoom}
            period={period}
            isLaunch={launch}
            bandZones={bandSet.bands.map((b) => ({
              tolerance: b.tolerance,
              open: b.open,
              selected: openBands.includes(b.index),
            }))}
            candleData={candleQuery.data}
            candlesLoading={candleQuery.isLoading}
            liquidityLevels={liquidityLevels}
            liquidityLoading={depthQuery.isLoading}
            /**
             * `readOnly`, so the two drag handles and the preset row are not drawn
             * at all — this chart's own prop doc puts it best: "a reading surface
             * that invites a drag it will not act on is worse than no control".
             * Leaving them rendered but inert, which is what shipped before, is
             * exactly that failure: they look draggable, they move nothing.
             *
             * A banded position has no range for a drag to write to — the pool
             * stores none and `_fillBand` reads none. What the chart shows instead
             * is `bandZones`: the tolerance bands drawn around the current price,
             * shaded by open/selected, which IS what the LP is choosing below.
             */
            readOnly
            onRangeChange={() => {}}
            onZoom={setZoom}
            onPeriod={setPeriod}
          />

          <div className="rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-[18px] shadow-sm">
            <h3 className="mb-2 text-[15px] font-semibold">Bands</h3>
            <p className="mb-2.5 text-[12px] text-[var(--m-text-secondary)]">
              Tightest fills first. Pick as many as you want — each becomes its own
              position, and your amount is split evenly between them.
            </p>
            <BandPicker
              set={bandSet}
              bands={bandSet.bands}
              anchor={anchor}
              selected={openBands}
              baseSym={base}
              quoteSym={quote}
              onToggle={toggleBand}
            />

            <div className="my-3.5 h-px bg-[var(--m-border)]" />

            <BandDeposit
              set={bandSet}
              bandIndex={openBands[0] ?? 0}
              selectedBands={openBands}
              baseSym={base}
              quoteSym={quote}
              anchor={anchor}
              bandIsEmpty={band.liquidityUSD === 0}
              mode={depositMode}
              onMode={setDepositMode}
              amtBase={amtBase}
              amtQuote={amtQuote}
              onAmtBase={setAmtBase}
              onAmtQuote={setAmtQuote}
              amtOne={amtOne}
              onAmtOne={setAmtOne}
              oneIsBase={oneIsBase}
              onOneIsBase={setOneIsBase}
            />

            {/*
              Renders nothing when fewer than two bands can take liquidity, which is
              the common case at a stock 0.10% spread -- there is no distribution to
              choose and the step removes itself rather than sitting inert.
            */}
            <BandShapePicker
              set={bandSet}
              selected={openBands}
              resolved={resolvedShape}
              onShape={setShape}
              stats={pairStats}
              symbol={primarySymbol}
              decimals={DEPOSIT_DECIMALS}
              /* Hidden when launching: Auto reads the pair's own trading, and a
                 pair being launched has never traded, so it could only ever
                 render permanently disabled. See BandShapePicker's showAuto. */
              showAuto={!launch}
            />

            <div className="my-3.5 h-px bg-[var(--m-border)]" />

            <h3 className="mb-3 flex items-center justify-between text-[15px] font-semibold">
              Where it fills
              <button type="button" onClick={() => setStep(launch ? "fee" : "pair")} className="font-mono text-[11px] font-medium text-[var(--m-primary-fg)]">
                ← back
              </button>
            </h3>

            {/* A BAND'S BID AND ASK, not a range the position owns.
                
                This panel used to read "Your range · Min price / Max price",
                with an in-range status pill and a capital-concentration
                multiplier. All three describe a v3 position, and a BandPool
                position has none of them: `PoolPositions.sol` deleted
                `minPrice`/`maxPrice` on 2026-08-22 precisely because `_fillBand`
                never read them, so "your range" promised capital that stops
                working outside it when it never did.

                What a band actually has is a TOLERANCE around the pair's TWAP,
                so the two numbers below are the band's bid and ask AT THIS
                BLOCK — they move as the anchor moves, and they are not a bound
                the LP chose. Same framing the on-chain card uses (see
                PositionDescriptor's BAND BIDS / BAND ASKS).

                The status pill is gone because a band always straddles the
                anchor, so "in range" is true by construction and tells nobody
                anything. The concentration multiplier is gone because it is
                measured against a full-range position, which does not exist
                here. */}
            <div className="mb-[7px] mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
              Band bid / ask · at this block
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RangeCell k="Band bids" v={fmt(low)} s={`${((low - anchor) / anchor * 100).toFixed(2)}%`} />
              <RangeCell k="Band asks" v={fmt(high)} s={`+${((high - anchor) / anchor * 100).toFixed(2)}%`} />
            </div>

            {/* Estimated APR, from the gateway's own tier- and age-weighted
                estimator. Never invented locally: when it declines to answer —
                no indexed volume, or an order book with no pool behind it —
                this reads "—" rather than a plausible-looking number, which on
                the screen where someone commits capital is the one thing that
                must not happen. */}
            <div className="mt-3 flex items-center justify-between rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3 py-2.5 font-mono text-[12px]">
              <span className="text-[var(--m-text-secondary)]">Est. APR</span>
              {depositApr.loading ? (
                <span className="text-[var(--m-text-secondary-2)]">estimating…</span>
              ) : depositApr.data === null || depositApr.data.aprPct === null ? (
                <span
                  className="text-[var(--m-text-secondary-2)]"
                  title="No estimate available: this market has no indexed volume yet, has an order book but no pool, or is a band pool — whose fee inputs are not recorded yet."
                >
                  —
                </span>
              ) : (
                <span className="font-semibold text-[var(--m-logo)]">
                  ~{formatPct(depositApr.data.aprPct)}
                  {depositApr.data.proRataPct !== null && (
                    <span
                      className="ml-2 font-normal text-[var(--m-text-secondary-2)]"
                      title="What a flat pro-rata share of pool fees would pay. The estimate above weights by band tier and position age instead."
                    >
                      pro-rata ~{depositApr.data.proRataPct.toFixed(2)}%
                    </span>
                  )}
                </span>
              )}
            </div>

            <BandFollowHint className="mt-3" />

            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="mt-3 w-full rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--m-primary-hover)]"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — CONFIRM */}
      {step === "confirm" && (
        <ConfirmFlow
          mode={mode}
          networkSlug={networkSlug}
          base={base}
          quote={quote}
          fee={fee}
          rate={anchor}
          low={low}
          high={high}
          isFullRange={isFullRange}
          side={side}
          band={openBands[0] ?? 0}
          bandTolerance={band.tolerance}
          bands={bandDeposits}
          maturitySec={bandSet.maturitySec}
          converted={
            depositMode === "one"
              ? { from: oneIsBase ? base : quote, to: oneIsBase ? quote : base }
              : undefined
          }
          amtBase={amtBase}
          amtQuote={amtQuote}
          isConnected={isConnected}
          onConnect={() => open()}
          onBack={() => setStep("range")}
          onDone={() => setStep("pair")}
        />
      )}

      <TokenModal
        chainName={displayNetworkName}
        open={modal.open}
        which={modal.which}
        disabledSym={modal.which === "base" ? quote : base}
        onSelect={pickToken}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}

/** `chainName` is required, not optional: a token mark without its network chip
 *  is the one thing every OTHER token surface on the site draws, and leaving it
 *  off here is what made this picker look like a different product. Making it a
 *  required prop means a new call site cannot quietly drop it again. */
function TokenSelect({
  role,
  sym,
  chainName,
  onClick,
}: {
  role: string;
  sym: string;
  chainName: string;
  onClick: () => void;
}) {
  const t = liqToken(sym);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-2.5 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3 text-left hover:border-[var(--m-primary)]"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">{role}</span>
      <TokenImageIcon symbol={sym} color={t.color} chainName={chainName} size="md" className="h-7 w-7 text-[8px]" />
      <span className="flex flex-col leading-tight">
        <b className="text-[15px] font-semibold">{sym}</b>
        <span className="text-[10.5px] text-[var(--m-text-secondary-2)]">{t.name}</span>
      </span>
      <span className="ml-auto text-xs text-[var(--m-text-secondary-2)]">▾</span>
    </button>
  );
}

function RangeCell({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--m-text-secondary-2)]">{k}</div>
      <div className="mt-[3px] font-mono text-[15px] font-semibold tabular-nums">{v}</div>
      <div className="mt-px text-[10px] text-[var(--m-text-secondary)]">{s}</div>
    </div>
  );
}
