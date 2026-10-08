"use client";

/**
 * Rate liquidity + pool-launch flow. Three steps with a stepper:
 *   1 · Pair  — base/quote selectors (order swappable), fee tier, current RATE
 *               (1 base = X quote, never USD); Launch adds a starting-price input.
 *   2 · Range — the interactive v3 chart + deposit inputs + range/status summary.
 *   3 · Confirm — review → approval queue → add-liquidity tx → result.
 *
 * Market price, candles and orderbook depth come from the indexed backend.
 */

import { chartTicker } from "@/lib/chart/ticker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import type { DepositMode } from "./BandDeposit";
import { pairStatsFrom } from "@/lib/liquidity/auto";
import {
  DEPOSIT_SHAPES,
  allocateByShape,
  depositUnits,
  formatDepositUnits,
  reallocate,
  resolveDepositShape,
  type DepositShape,
} from "@/lib/liquidity/shape";
import { bandBounds, mockBandSet, selectableBands, usableBands } from "@/lib/liquidity/bands";
import { checkDepositBalance, hasDepositAmount, maxFieldAmount } from "@/lib/liquidity/balance";
import { maxSpendable, spendsGas } from "@/lib/wallet/gasReserve";
import { useFeeToken } from "@/lib/wallet/feeToken";
import { hasDistinctNativeAsset } from "@/lib/wallet/depositAssets";
import { useDepositBalances } from "@/hooks/useDepositBalances";
import { findChain } from "@iter/deployments";
import { TokenModal } from "./TokenModal";
import { Stepper } from "@components/Atoms/Stepper";
import { ConfirmFlow } from "./ConfirmFlow";
import { PairStep } from "./steps/PairStep";
import { FeeStep } from "./steps/FeeStep";
import { RangeStep } from "./steps/RangeStep";
import { DEPOSIT_DECIMALS } from "./steps/parts";
import { resolveRate } from "@/lib/liquidity/rate";
import { defaultPair, healPair, nativeSymbolFor } from "@/lib/liquidity/defaultPair";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { tokenLogoURI } from "@/lib/tokens/logo";
import { findUnlisted, type UnlistedMarket } from "@/lib/liquidity/unlisted";
import { useMarketExists } from "@/hooks/useMarketExists";
import { useListBounds } from "@/hooks/useListBounds";
import { DEFAULT_LIST_FEE, DEFAULT_LIST_VOLATILITY_BPS } from "@/lib/liquidity/launchPolicy";
import { singleSide } from "@/lib/liquidity/chart";
import type { ChartPeriod, FeeTier, LiqMode } from "@/lib/liquidity/types";
import { suggestedFeeClassForPair } from "@/lib/fees/registry";
import { deploymentConfig } from "@/lib/deployments";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useBandSet } from "@/hooks/useBandSet";
import { poolRiskLevel } from "@/lib/liquidity/poolRisk";
import { useDepositApr } from "@/hooks/useDepositApr";
import { usePairCandles } from "@/hooks/usePairCandles";
import { useUngatedPair } from "@/hooks/useUngatedPair";
import { flowUrl } from "@/lib/liquidity/flowUrl";
import { buildPageUrl } from "@/lib/routing/chainParams";

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

export function LiquidityFlow({
  networkSlug,
  unlistedMarkets = [],
  thresholdUsd = 0,
  initialBase,
  initialShape,
  initialAmount,
  initialOne,
  initialQuote,
  initialMode = "provide",
  depositOnly = false,
}: {
  networkSlug?: string;
  /** Real pre-graduation markets, read server-side by the page. */
  unlistedMarkets?: UnlistedMarket[];
  /** Operator-set USD of quote liquidity needed to list. */
  thresholdUsd?: number;
  initialBase?: string;
  /** From `?shape=` — the dock's LP tab, which asks before linking here. */
  initialShape?: string;
  /** From `?amount=` — likewise, so the form opens on what was typed there. */
  initialAmount?: string;
  /** From `?one=` — which side a one-token deposit brings, as the dock chose. */
  initialOne?: string;
  initialQuote?: string;
  /** `?mode=launch` on `/pool/new`. Ignored by the deposit-only surface. */
  initialMode?: LiqMode;
  depositOnly?: boolean;
}) {
  const { displayNetworkName, defaultSpotPairData } = useMarketPageContext();
  const { isConnected, address: account } = useAccount();
  const { open } = useWalletConnect();
  const router = useRouter();

  const [mode, setMode] = useState<LiqMode>(depositOnly ? "provide" : initialMode);
  const [step, setStep] = useState<Step>(depositOnly ? "range" : "pair");
  const [base, setBase] = useState(initialBase ?? "");
  const [quote, setQuote] = useState(initialQuote ?? "");

  /**
   * The chain's real tokens. Same query key as the picker and the swap card, so
   * this is a cache hit rather than a third fetch of one list.
   */
  const { data: chainTokens } = useLiveSwapTokens(displayNetworkName, true);

  /** Symbol -> its listed artwork, so a selected token wears its own mark. */
  const logoBySymbol = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const token of chainTokens ?? []) {
      if (!map.has(token.symbol)) map.set(token.symbol, tokenLogoURI(token.logoURI));
    }
    return map;
  }, [chainTokens]);

  /**
   * Replace any symbol this chain does not list with the derived default.
   *
   * Self-healing rather than a one-shot initialiser, and that is what makes it
   * correct in three situations at once: the first paint (nothing chosen yet), a
   * CHAIN SWITCH (the old chain's tokens are not on the new one), and a
   * deep-linked pair that does not exist here. A symbol the user actually picked
   * is by construction in the list, so their choice survives.
   *
   * The prior behaviour was `initialBase = "ETH"`, which on Arc named a token
   * the chain has never had — and produced three separate symptoms: a picker
   * showing a market that cannot exist, "Current rate —", and a blank APR.
   */
  /**
   * What the URL asked for and did not get.
   *
   * Healing SILENTLY is how RISE looked broken for a day. `?base=TITER&quote=TUSD`
   * rewrote itself to ETH/USDC, and every layer reported success: the pair was
   * real, the contracts were byte-identical to the chain where the same link
   * worked, and the only visible symptom was a URL that changed on its own. The
   * actual cause was three hops away — an unlisted quote token prices at 0, and
   * `app/api/gateway/[...path]/route.ts` builds this list from PRICED pairs only,
   * so both symbols were missing from `known` here. See contracts/CLAUDE.md,
   * "`LAUNCH_QUOTE` / `SETTLEMENT_TOKEN` must be a LISTED stablecoin".
   *
   * The substitution is still right — there is nothing to show for a symbol this
   * chain does not list. Doing it without saying so is what cost the day.
   */
  const [healed, setHealed] = useState<{ asked: string; got: string }[]>([]);

  /**
   * The freshest pair, readable from the effect below WITHOUT joining its
   * dependency list. The effect must run on a chain switch and a token-list
   * load, not on every keystroke of a pair the user is picking — and it has to
   * compare against current values to know whether it replaced anything.
   */
  const pairRef = useRef({ base, quote });
  pairRef.current = { base, quote };

  useEffect(() => {
    const listed = chainTokens ?? [];
    if (listed.length === 0) return;
    const known = new Set(listed.map((t) => t.symbol));
    const fallback = defaultPair(listed, nativeSymbolFor(displayNetworkName));
    if (!fallback) return;

    const resolved = healPair(known, pairRef.current, fallback);
    setBase(resolved.base);
    setQuote(resolved.quote);
    setHealed(resolved.healed);
  }, [chainTokens, displayNetworkName]);

  /**
   * Keep the address on the pair and mode being shown — see `flowUrl` for the
   * three ways it used to be wrong. `replaceState`, not the router: this is the
   * same page describing itself more accurately, not a navigation, and a history
   * entry per token pick would make Back walk through every pair tried.
   */
  useEffect(() => {
    const next = flowUrl(window.location.href, { base, quote, mode });
    if (next) window.history.replaceState(null, "", next);
  }, [base, quote, mode]);
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
  // What `listPair` writes when this flow creates the market. Bounded by the
  // generator's own limits (`useListBounds`), which FeeStep reads before it
  // offers anything.
  const [fee, setFee] = useState<FeeTier>(DEFAULT_LIST_FEE);
  const [volatilityBps, setVolatilityBps] = useState(DEFAULT_LIST_VOLATILITY_BPS);
  const verifiedSuggestion = suggestedFeeClassForPair(displayNetworkName, base, quote);

  /**
   * The LP/protocol split, READ from the deployment registry rather than stated.
   *
   * This sentence used to read "75% of fees reward executed liquidity, 20% goes
   * to Rate and 5% to the market creator". None of the three numbers were true:
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
    return `; ${lpPct}% of each taker fee rewards executed liquidity and the rest goes to Rate`;
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

  const [isFullRange, setIsFullRange] = useState(false);

  /**
   * The creator's tolerance set — READ FROM THE POOL when one exists.
   *
   * This was `mockBandSet()` unconditionally, which `apps/web/CLAUDE.md` carried
   * as an open item ("matches a stock three-band pool by coincidence"). It does
   * not. Measured on Arc's ITRA/USDC pool on 2026-09-24: the chain's ladder is
   * 0.020% / 0.060% / 0.100% against a `spreadReach` of 0.100%, while the mock
   * is 0.1% / 0.3% / 0.5% (plus a closed 1%) against a reach of 1%.
   *
   * That is not a display difference. `usableBands` compares each tolerance
   * against the reach, so the mock offers bands `_requireWithinSpread` reverts
   * on — after the deposit's two approvals.
   *
   * The mock remains the fallback and is CORRECT where it now applies: in
   * `launch` mode no pool exists yet, so an illustrative ladder is the honest
   * thing to plan against, and `useBandSet` answers null for exactly that case.
   * It is also what renders while the read is in flight.
   */
  const baseAddress = useMemo(
    () => chainTokens?.find((t) => t.symbol === base)?.address,
    [chainTokens, base],
  );
  const quoteAddress = useMemo(
    () => chainTokens?.find((t) => t.symbol === quote)?.address,
    [chainTokens, quote],
  );
  const { data: chainBandSet } = useBandSet(displayNetworkName, baseAddress, quoteAddress);
  const bandSet = useMemo(() => chainBandSet ?? mockBandSet(), [chainBandSet]);
  /**
   * Bands are multi-select: a deposit may seed several in one transaction, and each
   * becomes its own position. Held sorted so it always reads in fill order, which is
   * the order the pool walks and the order the amounts are split in.
   */
  /*
   * Opens on EVERY usable band, not just the tightest.
   *
   * It opened on one, which quietly disabled the control beneath it: a shape is
   * a distribution, one band has nothing to distribute across, and so Spot,
   * Curve and Wide all produced the same deposit while looking like three
   * choices. `BandShapePicker` even hides itself below two usable bands, so the
   * default state removed the only way to select more.
   */
  const [selectedBands, setSelectedBands] = useState<number[]>(() => {
    const usable = usableBands(bandSet);
    return usable.length > 0 ? usable : [bandSet.bands.find((b) => b.open)?.index ?? 0];
  });
  /*
   * Re-open the selection when the LADDER changes under it.
   *
   * `selectedBands` is seeded once, at mount, from whatever `bandSet` was then
   * — which is the mock, because the pool read has not landed. When the chain's
   * ladder arrives it can have fewer bands (3 against the mock's 4) and
   * different tolerances, so the seeded selection may name bands that no longer
   * exist. `selectableBands` filters those out rather than crashing, which is
   * worse than crashing: the deposit silently plans across fewer bands than the
   * LP ticked, or across none.
   *
   * Keyed on the ladder's SHAPE, not on the query object's identity — a refetch
   * that returns an equal ladder must not reset a selection the LP is editing.
   */
  const ladderKey = chainBandSet
    ? chainBandSet.bands.map((b) => `${b.index}:${b.tolerance}:${b.open}`).join("|")
    : "";
  useEffect(() => {
    if (!ladderKey) return;
    setSelectedBands(usableBands(bandSet));
    // `bandSet` is derived from the same data `ladderKey` summarises, so keying
    // on the summary is what keeps this from firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladderKey]);

  const openBands = useMemo(() => selectableBands(bandSet, selectedBands), [bandSet, selectedBands]);
  /**
   * How the amount is spread over those bands. **Auto is the default.**
   *
   * It was "curve", on the reasoning that auto "depends on measurements that may
   * not exist for this pair, and a default that silently degrades would make the
   * flow's behaviour depend on data the LP cannot see". The degrade is real; the
   * word that was wrong is SILENTLY. `resolveDepositShape` falls back to `curve`
   * and reports it as `active`, `BandShapePicker` highlights `active` rather than
   * the request, and the Auto card renders disabled with `verdict.reason` beside
   * it — so an LP with no measurable pair sees Curve selected and is told why Auto
   * is not available. When the measurement DOES land, Auto lights up, the split
   * changes, and `verdict.summary` says what was measured.
   *
   * Which leaves the actual question: shaped by the pair's own trading, or shaped
   * by a fixed curve that knows nothing about it? The first is better wherever it
   * is available, and it is the one an LP would have to know this pair to choose.
   *
   * `launch` keeps "curve": that mode has no pool and no trading history, so
   * `showAuto` is false there and Auto could only ever render disabled.
   */
  /**
   * `initialShape` is what the dock's LP tab chose before sending the LP here.
   * Validated rather than trusted: it arrives from a URL, and an unrecognised
   * value must fall back to the default rather than reaching `resolveDepositShape`
   * as a shape nothing can weight.
   */
  const [shape, setShape] = useState<DepositShape>(() => {
    const fallback: DepositShape = mode === "launch" ? "curve" : "auto";
    return initialShape && DEPOSIT_SHAPES.includes(initialShape as DepositShape)
      ? (initialShape as DepositShape)
      : fallback;
  });

  /**
   * Choosing a preset selects the bands as well as weighting them.
   *
   * This is the whole fix. `setShape` alone wrote a weight vector over whatever
   * was already ticked, so on the default selection every preset produced an
   * identical deposit and nothing on screen moved — the control that looks
   * primary was downstream of the one that actually decides. A preset now
   * restores the full usable set, which is the only set its weights are
   * meaningful over.
   *
   * It does not REMOVE bands the LP ticked by hand: the manual control is an
   * override, and a preset is how you go back to the default. Widening the
   * selection is the direction that cannot lose someone's work.
   */
  /**
   * The LP's own split, when they have dragged one. Null means a preset is in
   * charge, which is the state a preset click returns to.
   */
  const [customWeights, setCustomWeights] = useState<number[] | null>(null);

  const pickShape = useCallback(
    (next: DepositShape) => {
      setShape(next);
      // A preset is how you go back to preset control; leaving the hand-dragged
      // vector in place would let it keep winning over the card just clicked.
      setCustomWeights(null);
      setSelectedBands((current) => {
        const usable = usableBands(bandSet);
        return usable.length > 0 ? usable : current;
      });
    },
    [bandSet],
  );
  // The tightest selected band drives anything that needs a single one to point at.
  const band = bandSet.bands[openBands[0] ?? 0];
  /**
   * ONE TOKEN, CONVERTED GRADUALLY — the whole default path.
   *
   * `wall` below has defaulted to true for a while, and it made no difference
   * on a fresh visit: the mode defaulted to "both", so the conversion choice
   * never rendered at all and nobody ever saw "Convert gradually". A default
   * that is correct but unreachable is not a default.
   *
   * One token is also the cheaper and simpler path to land on — nothing is
   * swapped, no fee is paid, and it is what someone arriving from Uniswap V3
   * expects, where depositing a single side is the ordinary case. Bringing both
   * is one click away for anyone who wants to be balanced immediately.
   */
  const [depositMode, setDepositMode] = useState<DepositMode>("one");
  /* Seeded from the dock, which has already asked for an amount. */
  const [amtOne, setAmtOne] = useState(initialAmount || "1.0");
  /**
   * Which token a one-token deposit brings. `?one=quote` is the token profile's
   * LP tab saying the LP already picked; anything else keeps the base default.
   */
  const [oneIsBase, setOneIsBase] = useState(initialOne !== "quote");
  /**
   * One token, and whether it is converted on the way in.
   *
   * **True — not converting — is the default**, and it is the cheaper option in
   * every respect: no swap fee, no price moved against the depositor, and about
   * 300,000 less gas. It is also what someone arriving from Uniswap V3 expects,
   * where depositing one token is the ordinary case and nothing is swapped first.
   *
   * Defaulting to the option that CHARGES, immediately after the LP has said they
   * want to bring one token, is the wrong way round. It was that way because the
   * wall could not run on every band; `_price` prices one side by value now, so
   * both work everywhere and the free one leads.
   */
  const [wall, setWall] = useState(true);
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  /**
   * Deposit amounts start EMPTY.
   *
   * These were `"1.0"` and `"1,635"` — and 1,635 is not a neutral placeholder,
   * it is mock.ts's ETH price, the same literal `startPrice` was called out for
   * on line 162. It rendered as a filled-in deposit of 1,635 USDC with a
   * "1,634.01 USDC back" refund line under it, on a pair where the number means
   * nothing. A prefilled amount on a form that moves money is a number the user
   * did not choose and might not notice.
   */
  const [amtBase, setAmtBase] = useState("");
  const [amtQuote, setAmtQuote] = useState("");

  /**
   * Warn only in PROVIDE mode. "Launch a pool" creates a market that is
   * unlisted by definition, where the same banner would be noise — and the
   * pair does not exist yet, so there is nothing to match against.
   */
  const unlisted =
    mode === "provide" ? findUnlisted(base, quote, unlistedMarkets, thresholdUsd) : null;

  /**
   * The selected market when the listed page does not carry it.
   *
   * `defaultSpotPairData` is the first twenty LISTED pairs, and a pair nobody has
   * provided to yet is unlisted by construction — so the rate resolved to 0 on
   * exactly the markets that most need a deposit. The card read "1 VFCBER : 0
   * USDC", and since `pairedAmount` clears the other side without an anchor, a
   * two-sided deposit into a new pair could not be typed at all. Asked only when
   * the listed page has no answer, in either order; see `useUngatedPair`.
   */
  const listedHasPair = useMemo(
    () => resolveRate(defaultSpotPairData.pairs, base, quote) > 0,
    [defaultSpotPairData.pairs, base, quote],
  );
  const { data: ungatedPair } = useUngatedPair(displayNetworkName, base, quote, !listedHasPair);
  const markets = useMemo(
    () => (ungatedPair ? [...defaultSpotPairData.pairs, ungatedPair] : defaultSpotPairData.pairs),
    [defaultSpotPairData.pairs, ungatedPair],
  );

  const marketPair = useMemo(
    () => markets.find((pair) => pair.base.symbol === base && pair.quote.symbol === quote),
    [base, markets, quote],
  );
  // Resolution lives in lib/liquidity/rate.ts so the inversion rule is testable
  // without rendering this component — same split as derive/unlisted.
  const rateFor = useCallback(
    (b: string, q: string) => resolveRate(markets, b, q),
    [markets],
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

  /**
   * Whether the chosen pair already has a book and a pool.
   *
   * Read HERE rather than in `PairStep` so the answer is available before the
   * form is filled in. `ConfirmFlow` keeps its own read — it is the backstop for
   * a pair listed by somebody else between this check and the signature, and it
   * is the one that has to be right when money moves.
   */
  const listBounds = useListBounds(displayNetworkName);
  const marketExists = useMarketExists(
    displayNetworkName,
    chainTokens?.find((t) => t.symbol === base)?.address,
    chainTokens?.find((t) => t.symbol === quote)?.address,
  );
  const anchor = launch ? initNum : cur;

  const candleQuery = usePairCandles(
    displayNetworkName,
    launch || !marketPair ? "" : chartTicker(marketPair),
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
    () =>
      resolveDepositShape(
        bandSet,
        openBands,
        depositTotal,
        shape,
        pairStats,
        customWeights ?? undefined,
      ),
    [bandSet, openBands, depositTotal, shape, pairStats, customWeights],
  );

  /*
   * THE WALL IS ALWAYS AVAILABLE, and this is where a table used to be.
   *
   * `wallVerdict` decided, per band, whether a one-sided deposit could land —
   * empty or same-side yes, otherwise no — and then the flow restricted the plan
   * to the bands that said yes. All of it is gone because `BandPool._price`
   * prices a one-sided deposit BY VALUE now, so every band takes one token and
   * there is nothing left to check or to skip. See lib/liquidity/wall.ts.
   *
   * The deposit therefore uses the shape exactly as resolved, in both modes.
   */
  const activeShape = resolvedShape;

  /**
   * Set one band's share and spread the remainder over the others in their
   * existing proportions.
   *
   * Proportionally, so dragging one band never silently rewrites the balance of
   * the ones the LP was happy with. When the others are all at zero there is no
   * proportion to preserve, and the remainder goes to the band that fills first
   * — the tightest — because that is where liquidity does the most work by
   * default.
   *
   * `position` indexes `resolvedShape.bands`, not `set.bands`: every caller is
   * drawn from the resolved split, and refused bands are not in it.
   */
  const allocate = useCallback(
    (position: number, share: number) => {
      const next = reallocate(resolvedShape.weights, position, share);
      // Null means the move would leave the deposit with nowhere to go; the
      // gesture is refused rather than applied as an empty split.
      if (!next) return;
      setCustomWeights(next);
      setShape("custom");
    },
    [resolvedShape.weights],
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
        ? allocateByShape(depositQuoteTotal, bandSet, activeShape.bands, activeShape.weights)
        : null;
    return activeShape.bands.map((index, i) => {
      const parts = [
        `${formatDepositUnits(activeShape.amounts[i] ?? BigInt(0), DEPOSIT_DECIMALS)} ${primarySymbol}`,
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
  }, [bandSet, depositQuoteTotal, activeShape, primarySymbol, quote]);

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
    setFee(DEFAULT_LIST_FEE);
    setVolatilityBps(DEFAULT_LIST_VOLATILITY_BPS);
    resetRange(launch ? initNum : rateFor(nextBase, nextQuote));
    setModal((m) => ({ ...m, open: false }));
  };

  const swapOrder = () => {
    setBase(quote);
    setQuote(base);
    setFee(DEFAULT_LIST_FEE);
    setVolatilityBps(DEFAULT_LIST_VOLATILITY_BPS);
    resetRange(launch ? initNum : rateFor(quote, base));
  };

  const changeMode = (m: LiqMode) => {
    setMode(m);
    resetRange(m === "launch" ? initNum : cur);
    setStep("pair");
    /*
     * The default shape follows the mode, because `showAuto` does. Leaving `auto`
     * selected on the way into launch would hide the card that is highlighted --
     * `pairStats` can survive the switch, so `active` stays `auto` while the Auto
     * card is not rendered, and the picker then shows nothing selected at all.
     */
    setShape(m === "launch" ? "curve" : "auto");
    setCustomWeights(null);
  };

  const changeInit = (v: string) => {
    setInitStr(v);
    const n = parseFloat(v.replace(/,/g, ""));
    if (n > 0) resetRange(n);
  };

  /*
   * `side` is the only one of these three still read: it tells ConfirmFlow which
   * tokens the LP is bringing, which decides both the approvals and the amount
   * arrays. `inRange` and the concentration multiplier went with the v3 range
   * panel — a band always straddles the anchor, so "in range" is true by
   * construction, and concentration is measured against a full-range position,
   * which BandPool has no concept of. They were computed and rendered nowhere.
   */
  const side = singleSide(anchor, low, high, isFullRange);

  /**
   * What this deposit would earn. `/pool/deposit` carried no APR at all — the
   * gateway's estimator had no reader anywhere in the app.
   *
   * Addresses come from `defaultSpotPairData`, which is listing-gated, so an
   * unlisted market resolves to undefined and the row reads "—". That degrades
   * the right way: the estimator 404s for a market with no pool regardless, and
   * an unlisted launch is exactly that case.
   */
  /**
   * Addresses for the APR estimator, resolved from THIS CHAIN'S token list.
   *
   * They used to come from `defaultSpotPairData` — `useMultichainPairs(20, …)`,
   * which is listing-gated AND cross-chain. Two ways that failed, both silent:
   * the selected pair was usually not among twenty listed markets, so the row
   * read "—" for a market that has a pool; and a symbol match across chains
   * could resolve Arc's pair to another chain's addresses, estimating the wrong
   * pool entirely.
   *
   * `chainTokens` is the deployment's own list for the displayed chain and is
   * already fetched for the picker, so this is both correct and free. An
   * unlisted market still resolves — the estimator answers or 404s, which is its
   * decision to make rather than ours to pre-empt.
   */
  const addressBySymbol = useMemo(() => {
    const map = new Map<string, string>();
    for (const token of chainTokens ?? []) {
      if (!map.has(token.symbol)) map.set(token.symbol, token.address);
    }
    return map;
  }, [chainTokens]);

  /**
   * The two sides of a two-sided deposit, kept at the band's ratio.
   *
   * They were independent inputs. A band accepts `1 base : anchor quote` and
   * REFUNDS anything over that ratio, so an unbalanced pair is not a different
   * position — it is the same position plus a pointless round trip of the
   * excess. The form already computed the mismatch and printed it as a "you get
   * N back" line; it reported the problem on every keystroke and never fixed
   * it, which left the LP to do the multiplication that produced it.
   *
   * Typing either side now sets the other. Clearing one clears both, because a
   * half-filled pair deposits nothing and leaving a stale figure on the other
   * side reads as an amount that is still going in.
   *
   * Single-sided deposits are untouched: there is no second side to balance,
   * and the pool converts half of what arrives at the band's own price.
   */
  const pairedAmount = useCallback(
    (raw: string, side: "base" | "quote") => {
      const setThis = side === "base" ? setAmtBase : setAmtQuote;
      const setOther = side === "base" ? setAmtQuote : setAmtBase;
      setThis(raw);
      if (depositMode !== "both") return;

      const value = Number(String(raw).replace(/,/g, ""));
      if (!(value > 0) || !(anchor > 0)) {
        setOther("");
        return;
      }
      const other = side === "base" ? value * anchor : value / anchor;
      // No grouping: this string goes straight back into a field whose own
      // parser strips commas, and a separator it inserted would be re-parsed on
      // the next keystroke.
      setOther(
        other.toLocaleString(undefined, {
          maximumFractionDigits: DEPOSIT_DECIMALS,
          useGrouping: false,
        }),
      );
    },
    [depositMode, anchor],
  );

  /**
   * The deposit valued in QUOTE units — what fees are paid in, and what the
   * estimated APY is a percentage of.
   *
   * Quote rather than USD deliberately: this spec keeps every figure on the
   * liquidity surface in quote-per-base, and a dollar amount here would be a
   * second currency on a screen that has spent four steps avoiding one.
   */
  const depositQuote = useMemo(() => {
    const b = Number(String(amtBase).replace(/,/g, "")) || 0;
    const q = Number(String(amtQuote).replace(/,/g, "")) || 0;
    const one = Number(String(amtOne).replace(/,/g, "")) || 0;
    if (depositMode === "one") return oneIsBase ? one * anchor : one;
    return b * anchor + q;
  }, [amtBase, amtQuote, amtOne, depositMode, oneIsBase, anchor]);

  /**
   * What the wallet can spend, read as ERC-20 for exactly the two tokens this
   * deposit touches.
   *
   * NOT `tokenListWithBalance`: that substitutes the native balance onto a
   * chain's `iter_native` row, which on every chain but Arc is the WRAPPED
   * token — so it would report native ETH for a deposit that moves WETH. See
   * `useDepositBalances`.
   */
  const heldBySymbol = useDepositBalances(
    useMemo(() => {
      const of = (symbol: string) => {
        const token = (chainTokens ?? []).find((t) => t.symbol === symbol);
        return { symbol, address: token?.address, decimals: token?.decimals };
      };
      return [of(base), of(quote)];
    }, [chainTokens, base, quote]),
  );

  const gasChain = findChain(displayNetworkName);
  /*
   * On Tempo gas is a TIP-20 (the account's FeeManager choice, else PathUSD), and
   * the registry's "USD" placeholder matches no row -- so Max kept nothing back
   * and spent the very balance the approval and the add are charged in.
   */
  const feeToken = useFeeToken(gasChain?.chainId, account);
  const gasSymbol = feeToken?.symbol ?? gasChain?.nativeCurrency?.symbol;
  /**
   * Whether this chain keeps gas in a balance of its own.
   *
   * `hasDistinctNativeAsset` already answers exactly this, from the same
   * `iter_native` signal, for the deposit asset list — so it is reused rather
   * than re-derived. Present on RISE, where the native row is the WETH contract
   * and native ETH pays for gas separately; deliberately empty on Arc, where
   * the gas asset and the USDC ERC-20 are one pool behind two interfaces.
   */
  const hasSeparateNativeRow = hasDistinctNativeAsset(displayNetworkName);

  const balanceNeeds = useMemo(() => {
    const num = (raw: string) => Number(String(raw).replace(/,/g, "")) || 0;
    if (depositMode === "one") {
      return [{ symbol: oneIsBase ? base : quote, amount: num(amtOne) }];
    }
    return [
      { symbol: base, amount: num(amtBase) },
      { symbol: quote, amount: num(amtQuote) },
    ];
  }, [depositMode, oneIsBase, base, quote, amtOne, amtBase, amtQuote]);

  /** See `hasDepositAmount` for why this is not part of the balance verdict. */
  const depositHasAmount = useMemo(() => hasDepositAmount(balanceNeeds), [balanceNeeds]);

  const balanceVerdict = useMemo(
    () => checkDepositBalance(balanceNeeds, heldBySymbol),
    [balanceNeeds, heldBySymbol],
  );

  const balanceOf = useCallback(
    (symbol: string) => heldBySymbol?.get(symbol),
    [heldBySymbol],
  );

  const fillMax = useCallback(
    (symbol: string, side: "base" | "quote" | "one") => {
      const balance = heldBySymbol?.get(symbol);
      if (balance === undefined) return;
      const spendable = maxSpendable(
        balance,
        spendsGas({ symbol, gasSymbol, hasSeparateNativeRow }),
      );
      /*
       * Floored to the field's precision BEFORE formatting.
       *
       * `maximumFractionDigits` rounds to nearest, so it rounds UP whenever the
       * first dropped digit is 5 or more: a held 3.91705 was written as
       * "3.9171", and the balance check immediately called Max's own number
       * more than the wallet holds. `maxFieldAmount` only ever rounds down —
       * see its note for why that asymmetry is the only safe one here.
       *
       * Still through the same formatter afterwards, so a Max click and a typed
       * amount cannot be parsed differently on the next keystroke.
       */
      const text = maxFieldAmount(spendable, DEPOSIT_DECIMALS).toLocaleString(undefined, {
        maximumFractionDigits: DEPOSIT_DECIMALS,
        useGrouping: false,
      });
      if (side === "one") setAmtOne(text);
      else pairedAmount(text, side);
    },
    [heldBySymbol, gasSymbol, hasSeparateNativeRow, pairedAmount],
  );

  const depositApr = useDepositApr({
    networkName: displayNetworkName,
    base: addressBySymbol.get(base),
    quote: addressBySymbol.get(quote),
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
        {/* The "Rate · liquidity" eyebrow is gone. The shell already says which
            app this is, and a breadcrumb to the page you are standing on is a
            line of chrome above the only heading that carries information. */}
        {/* No subtitle: it narrated the stepper directly beneath it, and still
            described a v3 range chart after positions became band ladders. */}
        <h1 className="mb-5 text-[clamp(26px,3.4vw,38px)] font-medium leading-[1.06] tracking-[-0.02em]">
          {depositOnly ? "Deposit liquidity" : "Provide liquidity & launch pools"}
        </h1>
      </header>

      {/* mode + stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        {!depositOnly && <div className="inline-flex rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] p-[3px]">
          {(["provide", "launch"] as LiqMode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`liq-mode-${m}`}
              /* The active tab was signalled by background colour alone, so
                 nothing announced which mode was selected — the same gap the
                 back buttons had. */
              aria-pressed={m === mode}
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

      {/*
        The pair this chain could not show. Dismissible, because it is a note
        about how you arrived rather than a problem with what you are looking
        at now — the pair on screen is real and ready to deposit into.
      */}
      {healed.length > 0 && (
        <div
          data-testid="liq-pair-healed"
          data-asked={healed.map((h) => h.asked).join(",")}
          className="mb-5 flex items-start gap-3 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5 text-[12.5px]"
        >
          <span className="text-[var(--m-text-secondary)]">
            <b className="text-[var(--m-text-primary)]">
              {healed.map((h) => h.asked).join(" and ")}{" "}
              {healed.length > 1 ? "are not" : "is not"} on {displayNetworkName}.
            </b>{" "}
            Showing {base}/{quote} instead.
          </span>
          <button
            type="button"
            onClick={() => setHealed([])}
            aria-label="Dismiss"
            className="ml-auto shrink-0 rounded-[7px] px-2 py-0.5 text-[var(--m-text-secondary-2)] hover:text-[var(--m-text-primary)]"
          >
            ✕
          </button>
        </div>
      )}

      {/* The four steps live in ./steps. They were inline until this file hit
          1,180 lines holding all of them; each was already an independent
          screen with its own heading and its own Continue, sharing only the
          state that still lives here. */}
      {step === "pair" && (
        <PairStep
          launch={launch}
          base={base}
          quote={quote}
          baseLogoURI={logoBySymbol.get(base)}
          quoteLogoURI={logoBySymbol.get(quote)}
          chainName={displayNetworkName}
          unlisted={unlisted}
          initStr={initStr}
          onInitChange={changeInit}
          startPrice={initNum}
          rate={cur}
          depositMode={depositMode}
          onDepositMode={setDepositMode}
          oneIsBase={oneIsBase}
          onOneIsBase={setOneIsBase}
          onPick={(which) => setModal({ open: true, which })}
          onSwap={swapOrder}
          market={marketExists}
          /* Keeps the pair, drops the launch. `changeMode` already resets the
             range and the shape when the tab itself is clicked. */
          onProvideInstead={() => changeMode("provide")}
          onContinue={() => setStep(launch ? "fee" : "range")}
        />
      )}

      {/* Launch only: an existing pair's tier is a fact, not a choice, so
          DEPOSIT_STEPS omits this step rather than showing a read-only screen
          the LP must click past. */}
      {step === "fee" && (
        <FeeStep
          launch={launch}
          base={base}
          quote={quote}
          fee={fee}
          onFee={setFee}
          volatilityBps={volatilityBps}
          onVolatility={setVolatilityBps}
          bounds={listBounds}
          suggestion={verifiedSuggestion}
          lpFeeCopy={lpFeeCopy}
          onBack={() => setStep("pair")}
          onContinue={() => setStep("range")}
        />
      )}

      {step === "range" && (
        <RangeStep
          /* The pair step owns this question; `/pool/deposit` never renders one. */
          askMode={depositOnly}
          set={bandSet}
          anchor={anchor}
          selected={openBands}
          onAllocate={allocate}
          base={base}
          quote={quote}
          launch={launch}
          /*
           * FROM THE RESERVES, not from `liquidityUSD`.
           *
           * `toBandSet` leaves `liquidityUSD` at zero on purpose -- pricing reserves
           * to USD needs per-token prices it does not take, and this repo does not
           * write a figure nobody measured. So `liquidityUSD === 0` was true for
           * EVERY band, and the panel told the LP "this band is empty, your deposit
           * defines its ratio" directly above a notice saying the same bands already
           * hold both tokens. Two statements about one band, contradicting, on the
           * screen where the money is committed.
           *
           * The reserves are exact and are now carried. Undefined is NOT empty --
           * the illustrative ladder and a read in flight both land there, and
           * claiming an empty band would be the same false statement in a new place.
           */
          bandIsEmpty={
            bandSet.bands[openBands[0] ?? 0]?.baseReserve === BigInt(0) &&
            bandSet.bands[openBands[0] ?? 0]?.quoteReserve === BigInt(0)
          }
          period={period}
          onPeriod={setPeriod}
          candles={candleQuery.data}
          candlesLoading={candleQuery.isLoading}
          depositMode={depositMode}
          onDepositMode={setDepositMode}
          amtBase={amtBase}
          onAmtBase={(v) => pairedAmount(v, "base")}
          amtQuote={amtQuote}
          onAmtQuote={(v) => pairedAmount(v, "quote")}
          amtOne={amtOne}
          onAmtOne={setAmtOne}
          oneIsBase={oneIsBase}
          onOneIsBase={setOneIsBase}
          wall={wall}
          onWall={setWall}
          maturitySec={bandSet.maturitySec}
          resolved={resolvedShape}
          onShape={pickShape}
          stats={pairStats}
          primarySymbol={primarySymbol}
          depositApr={depositApr}
          depositQuote={depositQuote}
          balanceOf={balanceOf}
          onMax={fillMax}
          balanceVerdict={balanceVerdict}
          hasDepositAmount={depositHasAmount}
          onBack={() => setStep(launch ? "fee" : "pair")}
          onContinue={() => setStep("confirm")}
        />
      )}


      {/* STEP 4 — CONFIRM */}
      {/*
        Three props carry the shape, and they are not interchangeable.
        `band` is the first USABLE band — `selectableBands` drops any the pool
        would refuse, so the first SELECTED one can name a band the deposit never
        touches. `bands` is the split formatted for the receipt at display
        precision. `plan` is the one the transaction reads, because those display
        units are 10^14 short of what an 18-decimal ERC-20 takes.
      */}
      {step === "confirm" && (
        <ConfirmFlow
          mode={mode}
          networkSlug={networkSlug}
          base={base}
          quote={quote}
          fee={fee}
          volatilityBps={volatilityBps}
          rate={anchor}
          low={low}
          high={high}
          isFullRange={isFullRange}
          /*
            `side` here is the DEPOSIT's, not the range's.

            It used to be `singleSide(anchor, low, high, isFullRange)` — a v3
            out-of-range notion — while the amount lived in `amtOne` and the two
            fields below were still "". So a single-sided deposit arrived at the
            confirm step claiming both tokens and carrying neither: it asked for two
            approvals, spent gas on both, and then refused itself with "Enter an
            amount to deposit" because `baseTotal` and `quoteTotal` were both zero.
            `depositMode` is the only thing that knows which token the LP brought, so
            it is what decides the approvals and the amounts.
          */
          side={depositMode === "one" ? (oneIsBase ? -1 : 1) : side}
          band={activeShape.bands[0] ?? openBands[0] ?? 0}
          bandTolerance={band.tolerance}
          bands={bandDeposits}
          /* `activeShape`, not `resolvedShape`: a wall goes only into the bands
             that can take one token, so this is the plan the transaction is
             actually built from. See activeShape. */
          plan={{ bands: activeShape.bands, weights: activeShape.weights }}
          maturitySec={bandSet.maturitySec}
          /*
           * `converted` is what tells ConfirmFlow to send `mintSingleSided`. In wall
           * mode nothing is converted, so it goes UNSET and the confirm step takes the
           * ordinary two-sided `mint` path with the other side already at zero — which
           * is exactly the no-conversion deposit, with no second code path to keep in
           * step. See lib/liquidity/wall.ts.
           */
          converted={
            depositMode === "one" && !wall
              ? { from: oneIsBase ? base : quote, to: oneIsBase ? quote : base }
              : undefined
          }
          /* Routed from `amtOne` in single-sided mode, into the slot for the token
             actually brought — the same amount `depositTotal` splits across bands, so
             the receipt and the transaction cannot name different numbers. */
          amtBase={depositMode === "one" ? (oneIsBase ? amtOne : "") : amtBase}
          amtQuote={depositMode === "one" ? (oneIsBase ? "" : amtOne) : amtQuote}
          isConnected={isConnected}
          onConnect={() => open()}
          onBack={() => setStep("range")}
          // The button says "View in portfolio". It used to `setStep("pair")`:
          // the label named a destination and the click reset the form, which
          // on /pool/deposit is a step that surface never otherwise shows.
          // Onto the LP tab: the position just opened is what the reader came to
          // see, and the portfolio otherwise opens on Open orders.
          onDone={() => router.push(`${buildPageUrl("portfolio")}?tab=lps`)}
          // Read from the pool's own reserves; a launch has no pool yet, and the
          // mock ladder that stands in for it holds nothing to judge.
          poolRisk={chainBandSet ? poolRiskLevel(chainBandSet.bands) : undefined}
          onAddQuoteSide={() => {
            setDepositMode("both");
            setStep("range");
          }}
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

