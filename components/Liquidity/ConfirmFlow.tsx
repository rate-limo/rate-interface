"use client";

/**
 * Step 3 — the confirm / approval state machine. Review → an approval queue (one
 * row per token actually transferred; permit-gasless where supported, else
 * on-chain, run sequentially) → the add-liquidity tx → Pending → Result.
 *
 * On a BANDED pool the count follows what the depositor brought, not the shape of
 * the range: bring both tokens and it is two, bring one and it is one, because the
 * other side is converted rather than transferred. `side` still describes a v3
 * out-of-range position and must not be read as "this deposit is single-sided" —
 * see `band`/`converted` below, which is what a banded caller passes. Execution is mocked behind an injectable `schedule` so it can be driven
 * synchronously in tests; the default advances with timers and is
 * prefers-reduced-motion aware.
 */

import { useEffect, useRef, useState } from "react";
import { AssetGeneratorABI, BandPoolABI, BandPoolFactoryABI, ERC20ABI } from "@iter/abis";
import { formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { playSound } from "@/lib/sound";
import { awaitReceipt } from "@/lib/tx/awaitReceipt";
import { useSearchParams } from "next/navigation";
import { slugToNetworkName } from "@/consts";
import { contractAddress, poolFactoryAddress, positionManagerAddress } from "@/lib/deployments";
import { feeTierNum } from "@/lib/liquidity/launchPolicy";
import { MIN_LISTING_PRICE } from "@/lib/launch/devBuy";

const LIST_MIN_PRICE = Number(MIN_LISTING_PRICE);
import { resolveBandPool } from "@/lib/swap/bandPool";
import { useLiveSwapTokens } from "@/lib/swap/useLiveSwapTokens";
import { cn } from "@/lib/utils";
import { launchIsCoinOnly, type PoolRiskLevel } from "@/lib/liquidity/poolRisk";
import { PoolRiskNote } from "./PoolRiskNote";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { BackButton } from "./BackButton";
import { liqToken } from "@/lib/liquidity/mock";
import type { FeeTier, LiqMode } from "@/lib/liquidity/types";
import { toastContractError } from "@/lib/errors/toastContractError";
import { dropEmptyBands, splitByWeights } from "@/lib/liquidity/bands";
import { canSeedEmptyBand, minSharesFromProbe } from "@/lib/liquidity/minShares";
import { bandDepositAbi } from "@/components/abis/bandDeposit";

/** `0x9a3f…4b21` — enough of a hash to recognise, short enough for the card. */
function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** Cancellable timer. Default caps the delay under prefers-reduced-motion. */
export type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion:reduce)").matches;
  const id = setTimeout(fn, reduce ? Math.min(ms, 120) : ms);
  return () => clearTimeout(id);
};

/**
 * `checking` is the reads BEFORE any prompt — resolving the pool, its band count.
 * It was folded into `confirming`, which then meant both "about to look" and
 * "the deposit prompt is up"; e2e answers the wallet on the second meaning.
 */
type Phase = "review" | "approving" | "checking" | "creating" | "confirming" | "pending" | "done";

/** The engine's price scale: quote-per-base × 1e8. Decimals are the book's job. */
const ENGINE_PRICE_SCALE = 1e8;
/** Reads after `listPair`: the RPC is a pool, and the next node may be a block behind. */
const POOL_VISIBLE_ATTEMPTS = 10;
const POOL_VISIBLE_DELAY_MS = 1_000;

export interface ConfirmFlowProps {
  mode: LiqMode;
  networkSlug?: string;
  base: string;
  quote: string;
  fee: FeeTier;
  /** The slippage limit `listPair` records when this flow creates the market. Ignored otherwise. */
  volatilityBps: number;
  rate: number;
  low: number;
  high: number;
  isFullRange: boolean;
  /** -1 base only · 0 both · 1 quote only */
  side: -1 | 0 | 1;
  /** Band index, when the pool aggregates. Absent for a per-position pool. */
  band?: number;
  /** Tolerance of that band, as a fraction (0.02 = ±2%). */
  bandTolerance?: number;
  /**
   * Every band being seeded, in fill order. A deposit may cover several, and each
   * one opens a SEPARATE position — a band is its own share pool with its own
   * accumulator, so they cannot be a single token.
   *
   * `deposit` is what this band receives, already formatted ("0.5000 ETH + 817.50
   * USDC"). It arrives as a string for the same reason `amtBase`/`amtQuote` do: the
   * caller knows which tokens are being transferred and which side is converted, and
   * a receipt that re-derived the split would be a second answer to a question the
   * shape picker has already answered — which is the exact failure this prop exists
   * to close. Absent means the caller did not shape the deposit; the row is then not
   * rendered rather than showing an even split nothing performed.
   */
  bands?: { index: number; tolerance: number; deposit?: string }[];
  /**
   * What the deposit actually sends: the usable band indices and the weight
   * vector the shape resolved to, aligned.
   *
   * `bands` above is the same split FORMATTED for the receipt, at a fixed
   * 4-decimal display precision. It cannot be reused here — those units are
   * 10^14 short of what an 18-decimal ERC-20 takes — so this carries the shape
   * rather than the amounts, and the split is redone at the token's own
   * decimals through the same `splitByWeights` the picker used.
   *
   * Absent means one band and the whole amount, which is what every caller got
   * before this existed.
   */
  plan?: { bands: number[]; weights: number[] };
  /** Seconds until fees vest fully. Absent means no vesting to disclose. */
  maturitySec?: number;
  /** Set when one token was brought and half of it is converted on the way in. */
  converted?: { from: string; to: string };
  amtBase: string;
  amtQuote: string;
  isConnected: boolean;
  onConnect: () => void;
  onBack: () => void;
  onDone: () => void;
  schedule?: Schedule;
  /**
   * Pool-pricing risk for the pool being deposited into (`provide` mode), from
   * its reserves. Absent means unknown, which shows the standard line.
   */
  poolRisk?: PoolRiskLevel;
  /** Launch only: switch the deposit to two-sided, for the coin-only warning. */
  onAddQuoteSide?: () => void;
}

function fmt(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString();
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(3);
}

export function ConfirmFlow(props: ConfirmFlowProps) {
  const {
    mode,
    networkSlug,
    base,
    quote,
    fee,
    volatilityBps,
    rate,
    low,
    high,
    isFullRange,
    band,
    bandTolerance,
    bands,
    plan,
    maturitySec,
    converted,
    side,
    amtBase,
    amtQuote,
    isConnected,
    onConnect,
    onBack,
    onDone,
    schedule = defaultSchedule,
    poolRisk,
    onAddQuoteSide,
  } = props;

  const launch = mode === "launch";
  /**
   * The LP token a deposit tops up, from `/pool/deposit?position=<tokenId>` -- the
   * position card's "Add" link. Present means `increaseLiquidity` into that token;
   * absent means a new position. A launch never tops anything up.
   */
  const positionParam = useSearchParams().get("position");
  const topUpId = !launch && positionParam && /^\d+$/.test(positionParam) ? positionParam : null;
  const networkName = slugToNetworkName[networkSlug ?? ""] ?? networkSlug ?? "";
  const tokenQuery = useLiveSwapTokens(networkName, isConnected);
  const { address: account, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [phase, setPhase] = useState<Phase>("review");
  const [approvingTok, setApprovingTok] = useState<string | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  /**
   * The deposit's own hash. The pending and result cards printed a hardcoded
   * `0x9a3f…4b21` left over from when this step was two timers — a transaction
   * that does not exist, under a real one. Held here so what the card names is
   * what was sent, and so e2e can read back the receipt of THIS deposit rather
   * than inferring it from a block range.
   */
  const [depositHash, setDepositHash] = useState<`0x${string}` | null>(null);
  /** False when the deposit was sent and its receipt was never observed. */
  const [depositConfirmed, setDepositConfirmed] = useState(true);
  const cancelRef = useRef<null | (() => void)>(null);

  const cancelTimer = () => {
    cancelRef.current?.();
    cancelRef.current = null;
  };
  const after = (ms: number, fn: () => void) => {
    cancelTimer();
    cancelRef.current = schedule(fn, ms);
  };
  // Cancel any in-flight timer when the component unmounts.
  useEffect(() => () => cancelTimer(), []);

  const banded = band !== undefined;
  /*
   * WHAT THE WALLET ACTUALLY SENDS — the approvals and the amount arrays both
   * read this, so they cannot disagree about which tokens move.
   *
   * `isFullRange` used to short-circuit to both tokens, which is right for a v3
   * range and wrong for a band: a banded deposit has no range to be full, and
   * `converted` is set exactly when the LP brought one token and the pool swaps
   * half of it on the way in. Under the old line a single-sided banded deposit
   * asked for two approvals and then had nothing to send on the second side.
   * See the header: on a banded pool the count follows what the depositor
   * BROUGHT, not the shape of the range.
   */
  const broughtOne = converted !== undefined;
  const deposited: string[] = broughtOne
    ? [converted.from]
    : isFullRange && !banded
      ? [base, quote]
      : [...(side !== 1 ? [base] : []), ...(side !== -1 ? [quote] : [])];
  // Native ETH is transferred as transaction value, never through ERC-20 allowance.
  const needed = deposited.filter((token) => token.toUpperCase() !== "ETH");

  /**
   * What this deposit must be allowed to move, per token.
   *
   * Mirrors `shortfall`'s parse deliberately: if the two disagreed about the
   * amount, this would either show an approval the deposit does not need or
   * skip one it does.
   */
  const requiredFor = (symbol: string): bigint => {
    const token = tokenQuery.data?.find((candidate) => candidate.symbol === symbol);
    const raw = symbol === base ? amtBase : amtQuote;
    try {
      return parseUnits((raw || "0").replace(/,/g, ""), token?.decimals ?? 18);
    } catch {
      return BigInt(0);
    }
  };

  const approvalSpender = positionManagerAddress(networkName);
  const approvalTokens = needed
    .map((symbol) => tokenQuery.data?.find((candidate) => candidate.symbol === symbol))
    .filter((token): token is NonNullable<typeof token> => Boolean(token?.address));

  /**
   * THE LIVE ALLOWANCE — so an approval is asked for once, not once per visit.
   *
   * The approve below has ALWAYS been `maxUint256`, but `approved` is component
   * state that starts empty on every mount, so the step came back for a token
   * whose allowance was already unlimited: a prompt, real gas, and a grant of
   * something already granted. `ActivityTabs`/`add-liquidity.spec.ts` records the
   * old shape — "the approvals are asked for again".
   *
   * Read rather than assumed, because the allowance moves in the other direction
   * too: spent down by another spender, or revoked from outside this app. Then
   * the step must come back, and only a live read knows that.
   */
  const {
    data: allowances,
    isLoading: allowancesLoading,
    refetch: refetchAllowances,
  } = useReadContracts({
    contracts: approvalTokens.map((token) => ({
      abi: ERC20ABI,
      address: token.address as `0x${string}`,
      functionName: "allowance" as const,
      args: [account as `0x${string}`, approvalSpender as `0x${string}`],
      chainId: token.chainId,
    })),
    query: { enabled: Boolean(account && approvalSpender && approvalTokens.length > 0) },
  });

  /**
   * Covered on chain. An unreadable allowance is NOT coverage — the same degrade
   * `shortfall` takes, one step more cautious: it leaves the approval step in
   * place rather than skipping it into a revert.
   */
  const onChainApproved = new Set(
    approvalTokens
      .filter((token, index) => {
        const allowance = allowances?.[index]?.result;
        const required = requiredFor(token.symbol);
        return typeof allowance === "bigint" && required > BigInt(0) && allowance >= required;
      })
      .map((token) => token.symbol),
  );

  const nextUnapproved = needed.find((t) => !approved.includes(t) && !onChainApproved.has(t));
  /**
   * The allowance has not answered yet. Until it does, `nextUnapproved` names a
   * token merely because nothing is known about it, and a click in that window
   * sent an approval the chain already covered. The button waits instead.
   */
  const checkingAllowance = isConnected && approvalTokens.length > 0 && allowancesLoading;

  const baseText = side === 1 ? "" : `${amtBase} ${base}`;
  const quoteText = side === -1 ? "" : `${amtQuote} ${quote}`;
  const depositText = [baseText, quoteText].filter(Boolean).join(" + ");
  const rangeText = isFullRange ? "Full" : `${fmt(low)} – ${fmt(high)}`;
  const inRange = isFullRange || (rate >= low && rate <= high);
  const seeded = bands ?? (bandTolerance !== undefined && band !== undefined
    ? [{ index: band, tolerance: bandTolerance }]
    : []);
  /**
   * A banded pool has no in/out of range to report — a band re-anchors to the TWAP
   * on every swap, so liquidity in it is never outside anything. Saying "in range"
   * would borrow a v3 status that cannot be false here, which is the same false
   * comfort a green badge that never turns red always gives.
   */
  /**
   * A banded deposit has bands, not a range. Printing a price range here would put
   * a number on the receipt that no position stores and no swap reads — the same
   * promise the pool stopped making when per-position ranges were removed.
   */
  /**
   * Per-band amounts for the RECEIPT, split by the same `splitByWeights` the
   * deposit used — so the card reports the ladder the user chose rather than one
   * aggregate that hides it.
   *
   * Not computed for a single-sided deposit. There, `amtBase`/`amtQuote` are what
   * was BROUGHT, and the manager converts half on the way in: splitting them would
   * print a confident zero down the side the position actually holds. That case
   * gets the conversion line instead.
   */
  const bandBreakdown = (() => {
    if (!banded || converted || !plan?.bands?.length || plan.bands.length < 2) return null;
    const weights = plan.weights?.length ? plan.weights : plan.bands.map(() => 1);
    const baseTok = tokenQuery.data?.find((t) => t.symbol === base);
    const quoteTok = tokenQuery.data?.find((t) => t.symbol === quote);
    const dBase = baseTok?.decimals ?? 18;
    const dQuote = quoteTok?.decimals ?? 18;
    let baseTotal: bigint;
    let quoteTotal: bigint;
    try {
      baseTotal = parseUnits((side !== 1 ? amtBase || "0" : "0").replace(/,/g, ""), dBase);
      quoteTotal = parseUnits((side !== -1 ? amtQuote || "0" : "0").replace(/,/g, ""), dQuote);
    } catch {
      return null;
    }
    const bases = splitByWeights(baseTotal, weights);
    const quotes = splitByWeights(quoteTotal, weights);
    const trim = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);
    return plan.bands.map((index, i) => ({
      index,
      base: trim(formatUnits(bases[i] ?? BigInt(0), dBase)),
      quote: trim(formatUnits(quotes[i] ?? BigInt(0), dQuote)),
    }));
  })();

  const bandsText =
    seeded.length > 0 ? seeded.map((b) => `±${(b.tolerance * 100).toFixed(2)}%`).join(" · ") : rangeText;
  const statusText = banded
    ? seeded.length > 1
      ? `${seeded.length} bands · ${seeded.map((b) => `±${(b.tolerance * 100).toFixed(2)}%`).join(", ")}`
      : `Band ${band} · ±${((bandTolerance ?? 0) * 100).toFixed(2)}%`
    : inRange
      ? "In range · earning"
      : "Out of range";

  const back = () => {
    cancelTimer();
    onBack();
  };

  /**
   * What the wallet actually holds, read on chain, before anything is spent.
   *
   * The range step already blocks a deposit it can see is short, but that reads
   * an indexed balance list and this is the step that moves money: the two can
   * disagree, the list can be absent, and an approval is a real transaction
   * with real gas. Checking here is what stops one being spent on a deposit
   * that cannot land — which is what happened, and the revert then reported
   * "The deposit reverted on chain", naming the wrong cause.
   *
   * Unreadable is NOT short. An RPC that refuses leaves the deposit to the
   * chain's own accounting, which is the honest degrade: refusing on a failed
   * read would block a wallet that has the funds.
   */
  const shortfall = async (): Promise<string | null> => {
    if (!publicClient || !account) return null;
    for (const symbol of deposited) {
      const token = tokenQuery.data?.find((candidate) => candidate.symbol === symbol);
      if (!token?.address) continue;
      const raw = symbol === base ? amtBase : amtQuote;
      let needed: bigint;
      try {
        needed = parseUnits((raw || "0").replace(/,/g, ""), token.decimals ?? 18);
      } catch {
        continue;
      }
      if (needed <= BigInt(0)) continue;
      try {
        const held = (await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20ABI,
          functionName: "balanceOf",
          args: [account as `0x${string}`],
        })) as bigint;
        if (held < needed) return symbol;
      } catch {
        // See the docstring: an unreadable balance is not a shortfall.
        continue;
      }
    }
    return null;
  };

  /**
   * A band this single-sided deposit cannot open, named BEFORE anything is signed.
   *
   * The first deposit into a band defines its ratio and mints `shares = baseAmount`,
   * so a quote-only one mints nothing and the pool reverts `ZeroLiquidity()`.
   *
   * This lives beside `shortfall` for the reason that docstring gives: an approval
   * is a real transaction with real gas, and a deposit that cannot land must be
   * refused before one is spent. It was briefly inside the deposit branch, which
   * put it AFTER the approval — the same "approve, then refuse itself" shape this
   * whole change exists to remove, and on a pool whose ladder is only partly seeded
   * it would have fired on the common path rather than the rare one.
   *
   * Reads only. No pool (a launch creating one) is not a blocked band: the deposit
   * branch creates the pool and every band is empty by definition, which the base
   * side opens legitimately.
   */
  const blockedBand = async (): Promise<string | null> => {
    if (!converted || !publicClient) return null;
    const factory = poolFactoryAddress(networkName);
    const baseTok = tokenQuery.data?.find((t) => t.symbol === base);
    const quoteTok = tokenQuery.data?.find((t) => t.symbol === quote);
    if (!factory || !baseTok || !quoteTok) return null;
    try {
      const read = (a: string, b: string) =>
        publicClient.readContract({
          abi: BandPoolFactoryABI,
          address: factory as `0x${string}`,
          functionName: "getPool",
          args: [a as `0x${string}`, b as `0x${string}`],
        }) as Promise<`0x${string}`>;
      const resolved = resolveBandPool(
        await read(baseTok.address, quoteTok.address),
        await read(quoteTok.address, baseTok.address),
      );
      if (!resolved) return null;

      const inputIsFormBase = converted.from === base;
      const inputIsPoolBase = resolved.quoteToBase ? !inputIsFormBase : inputIsFormBase;
      if (canSeedEmptyBand(inputIsPoolBase)) return null;

      const opener = resolved.quoteToBase ? quote : base;
      const planned = plan?.bands.length ? plan.bands : [band ?? 0];
      for (const index of planned) {
        const info = (await publicClient.readContract({
          abi: BandPoolABI,
          address: resolved.pool,
          functionName: "bands",
          args: [index],
        })) as readonly [number, bigint, bigint, bigint, boolean];
        if (info[1] === BigInt(0)) {
          return `Band ${index} has no liquidity yet, and an empty band can only be opened with ${opener}. Deposit both tokens, or pick a band that already has liquidity.`;
        }
      }
      return null;
    } catch {
      // An unreadable pool is not a blocked band — the same degrade `shortfall`
      // takes. The chain still gets the final say.
      return null;
    }
  };

  const go = async () => {
    if (!isConnected) {
      onConnect();
      return;
    }
    // A retry must not carry the hash of the attempt that reverted.
    setDepositHash(null);

    const short = await shortfall();
    if (short) {
      toast.error(`Not enough ${short}`, {
        description: `Your wallet holds less ${short} than this deposit spends. Nothing was sent.`,
      });
      return;
    }

    const blocked = await blockedBand();
    if (blocked) {
      toast.error("This band cannot be opened with one token", { description: blocked });
      return;
    }

    if (checkingAllowance) return;
    const t = nextUnapproved;
    if (t) {
      setApprovingTok(t);
      setPhase("approving");
      // Resolved outside the try so the catch can name the chain: a gas shortfall
      // has to say WHICH asset is short, and this flow is per-network.
      const token = tokenQuery.data?.find((candidate) => candidate.symbol === t);
      try {
        const spender = positionManagerAddress(networkName);
        if (!token || !spender || !publicClient) throw new Error(`Approval unavailable for ${t}`);
        if (connectedChainId !== token.chainId) await switchChainAsync({ chainId: token.chainId });
        const hash = await writeContractAsync({
          address: token.address as `0x${string}`,
          abi: ERC20ABI,
          functionName: "approve",
          args: [spender, maxUint256],
          chainId: token.chainId,
        });
        /*
         * Bounded, and answered by a direct poll when the block watcher stalls
         * — see lib/tx/awaitReceipt. Unbounded, this step could wait forever on
         * an approval that had already mined.
         */
        const grant = await awaitReceipt(publicClient, hash);
        if (grant.status === "reverted") throw new Error(`Approving ${token.symbol} reverted on chain.`);
        if (grant.status === "unknown") {
          // Re-approving is idempotent and the allowance read below is what
          // actually gates the next step, so asking for a retry costs nothing
          // and beats proceeding on a grant nobody has seen.
          throw new Error(`Approving ${token.symbol} was sent but not confirmed yet — try again in a moment.`);
        }
        // The grant is live now, so the read that gates this step has to see it —
        // otherwise the next render still believes the token is unapproved.
        void refetchAllowances();
        setApproved((prev) => [...prev, t]);
        setApprovingTok(null);
        setPhase("review");
      } catch (error) {
        setApprovingTok(null);
        setPhase("review");
        toastContractError(error, `Could not approve ${t}`, { chainId: token?.chainId });
      }
    } else {
      /*
       * THE DEPOSIT. This used to be two `setTimeout`s.
       *
       * The approval above was a real transaction — it spent gas and granted a
       * live allowance — and then this branch waited 1.4s, waited another 1.7s,
       * and raised "Position opened". Nothing was ever sent. Measured on Arc:
       * zero `BandLiquidityAdded` events naming the wallet across 60,000
       * blocks, while the deployer's six positions indexed and served fine, so
       * every surface that said "no LP positions" — /portfolio, /pool, /home's
       * onboarding step — was telling the truth about a deposit that did not
       * exist. A flow that claims money moved when it did not is the worst
       * failure this app can have, which is why this is a transaction now.
       *
       * `addLiquiditySingleSided(pool, band, amount, isBase, minShares)`, the
       * same call `components/Swap/execution.ts` already makes for an LP
       * remainder — one definition of "open a band position", not two.
       */
      setPhase("checking");
      try {
        const manager = positionManagerAddress(networkName);
        const factory = poolFactoryAddress(networkName);
        const baseTok = tokenQuery.data?.find((t) => t.symbol === base);
        const quoteTok = tokenQuery.data?.find((t) => t.symbol === quote);
        if (!manager || !factory || !publicClient) {
          throw new Error("This network is not configured for band liquidity.");
        }
        if (!baseTok || !quoteTok) throw new Error("Could not resolve this market's tokens.");
        if (connectedChainId !== baseTok.chainId) await switchChainAsync({ chainId: baseTok.chainId });

        // `getPool` is order-sensitive (its CREATE2 salt is keyed on argument
        // position) and has no "either order" entry point, so both are read and
        // whichever answered wins — the same shape the swap card uses.
        const read = (a: string, b: string) =>
          publicClient.readContract({
            abi: BandPoolFactoryABI,
            address: factory as `0x${string}`,
            functionName: "getPool",
            args: [a as `0x${string}`, b as `0x${string}`],
          }) as Promise<`0x${string}`>;
        const resolve = async () =>
          resolveBandPool(
            await read(baseTok.address, quoteTok.address),
            await read(quoteTok.address, baseTok.address),
          );
        let resolved = await resolve();

        /*
         * LAUNCH: create the market, with the lister's fee and volatility.
         *
         * Through `AssetGenerator.listPair`, not `MatchingEngine.addPair`. Both
         * create the book AND its band pool; only `listPair` also records the fee
         * and volatility the previous step chose — written to the engine, so they
         * are what takers actually pay — and hands the pool's band configuration
         * and the right to retune both to the lister. `addPair` took a price and
         * nothing else, which is why the fee tier this flow used to collect never
         * reached the chain.
         *
         * Its own transaction: there is no "list and deposit" entry point, so the
         * button is two prompts, and the waiting card says which one is up. Only
         * when there is genuinely no pool — a pair somebody else created first is
         * deposited into, and re-sending would revert `PairAlreadyListed`.
         */
        if (!resolved && launch) {
          const generator = contractAddress(networkName, "assetGenerator");
          if (!generator) throw new Error("Listing a pair isn't available on this network yet.");
          if (!(rate > 0)) throw new Error("Set a starting price before creating the pool.");
          // `rate > 0` is not enough: anything under 5e-9 ROUNDS to zero and the
          // book reverts `PriceIsZero`, and a huge or non-finite rate is a
          // RangeError out of BigInt() that names nothing.
          const scaled = Math.round(rate * ENGINE_PRICE_SCALE);
          if (!Number.isSafeInteger(scaled) || scaled <= 0) {
            throw new Error("That starting price is outside what the engine can list (1e-8 to 9e7 quote per base).");
          }
          // `listPair` refuses a price under `MIN_LISTING_PRICE` (100 on the 1e8
          // grid) with `ListingPriceTooLow`: below it one grid step is over 1% of
          // the price. Said here, before the prompt, rather than after it.
          if (scaled < LIST_MIN_PRICE) {
            throw new Error("That starting price is too small to list (at least 0.000001 quote per base). Swap the pair's order or raise it.");
          }
          setPhase("creating");
          const created = await writeContractAsync({
            abi: AssetGeneratorABI,
            address: generator,
            functionName: "listPair",
            args: [
              baseTok.address as `0x${string}`,
              quoteTok.address as `0x${string}`,
              BigInt(scaled),
              volatilityBps,
              feeTierNum(fee),
            ],
            chainId: baseTok.chainId,
          });
          const listing = await awaitReceipt(publicClient, created);
          if (listing.status === "reverted") throw new Error("Creating the pair reverted on chain.");
          if (listing.status === "unknown") {
            // `listPair` is guarded by PairAlreadyListed and the poll below
            // re-resolves the pool, so a retry is safe where a false failure
            // here would strand a listed pair with no deposit.
            throw new Error("Creating the pair was sent but not confirmed yet — try again in a moment.");
          }
          // Polled: a receipt is not a read barrier on a load-balanced RPC, and
          // giving up on the first miss would blame the pair for the node's lag
          // — then a retry re-sends `listPair` and reverts `PairAlreadyListed`.
          for (let attempt = 0; attempt < POOL_VISIBLE_ATTEMPTS && !resolved; attempt += 1) {
            resolved = await resolve();
            if (!resolved) await new Promise((r) => setTimeout(r, POOL_VISIBLE_DELAY_MS));
          }
          // The engine lists a wrapped-native pair WITHOUT a pool (its settlement
          // unwraps, which the pool's balance accounting cannot see). The book
          // exists and trades; there is just nothing here to deposit into.
          if (!resolved) {
            throw new Error(`${base}/${quote} was listed, but the engine opens no band pool for this pair.`);
          }
        }
        if (!resolved) throw new Error(`No band pool is listed for ${base}/${quote} yet.`);

        /*
         * EVERY band, and every side the LP brought.
         *
         * This sent `addLiquiditySingleSided(pool, band ?? 0, amount, …)` — the
         * FIRST band and the WHOLE amount — while the range step let the LP pick
         * several bands and a shape to spread across them, and the review screen
         * printed that spread row by row. Three bands under a Curve showed a
         * split on screen and put all of it in the tightest one. The approvals
         * above already covered both tokens for a two-sided deposit, so the LP
         * granted two allowances and only one token ever moved.
         *
         * `lib/liquidity/shape.ts` was written because "the shape was a control
         * whose output was discarded one step before it mattered". That got
         * fixed for the DISPLAY — picker bars and receipt agree — and the write
         * kept discarding it. This is the same fix, finished.
         *
         * `side` is -1 base-only, 0 both, 1 quote-only, matching `deposited`
         * above, so approvals and transfers cannot disagree about which tokens
         * are involved.
         */
        /*
         * The plan comes from `mockBandSet()`, which knows nothing about THIS
         * pool. A band index past `bandCount()` is an unnamed panic (0x32) raised
         * before any named error, so it surfaces as an undecodable revert. Clamp
         * to what the pool has; the seeder guards the same way.
         */
        const bandCount = Number(
          await publicClient.readContract({
            abi: BandPoolABI,
            address: resolved.pool,
            functionName: "bandCount",
          }),
        );
        const planned = plan?.bands.length ? plan.bands : [band ?? 0];
        const plannedWeights = plan?.weights.length ? plan.weights : planned.map(() => 1);
        const usable = planned.map((index, i) => ({ index, weight: plannedWeights[i] ?? 0 })).filter((b) => b.index < bandCount);
        if (usable.length === 0) throw new Error("This pool has none of the bands this deposit selected.");
        let bandList = usable.map((b) => b.index);
        const weights = usable.map((b) => b.weight);
        const baseTotal =
          side !== 1 ? parseUnits(amtBase || "0", baseTok.decimals ?? 18) : BigInt(0);
        const quoteTotal =
          side !== -1 ? parseUnits(amtQuote || "0", quoteTok.decimals ?? 18) : BigInt(0);
        if (baseTotal <= BigInt(0) && quoteTotal <= BigInt(0)) {
          throw new Error("Enter an amount to deposit.");
        }
        // Both sides take the SAME weight vector: a position is one share count
        // over both reserves, so a band holding 40% of the base and 30% of the
        // quote would not be a shape, it would be two.
        const splitBase = splitByWeights(baseTotal, weights);
        const splitQuote = splitByWeights(quoteTotal, weights);

        /*
         * A BAND THAT GETS NOTHING TAKES THE WHOLE DEPOSIT DOWN WITH IT.
         *
         * `BandPool` mints `min(byBase, byQuote)` and refuses a zero with
         * `ZeroLiquidity()`, which reverts the entire multi-band call rather than
         * skipping that band. So a shape leaving one band at 0%, or a deposit small
         * enough that one slice rounds away at the token's decimals, failed
         * ENTIRELY -- and, until `bandDepositAbi`, failed as a bare selector.
         *
         * Dropping the empty ones sends what the LP actually asked for. Reproduced
         * on Arc against pool `0x8a7cCE9e...`: `mintSingleSided` with a zero in the
         * amounts array reverts `0x10074548`; the same call without it succeeds.
         */
        const trimmed = dropEmptyBands(bandList, [splitBase, splitQuote]);
        if (trimmed.bands.length === 0) {
          throw new Error(
            "This deposit is too small to split across the bands you picked. Increase the amount, or pick fewer bands.",
          );
        }
        bandList = trimmed.bands;
        const [baseAmounts, quoteAmounts] = trimmed.amounts as [bigint[], bigint[]];

        /*
         * The POOL's base, not the form's. `getPool` is keyed on argument
         * position, so a pool that answered on the second read was created with
         * this form's QUOTE as its base — and `addLiquidityAcross` pulls
         * `totalBase` of `pool.base()`. `quoteToBase` was computed for exactly
         * this and never read here, so a flipped pair sent each amount as the
         * other token. The arrays are already at the right scale: each was
         * parsed with the decimals of the token it is an amount OF.
         */
        const [poolBaseAmounts, poolQuoteAmounts] = resolved.quoteToBase
          ? [quoteAmounts, baseAmounts]
          : [baseAmounts, quoteAmounts];

        /*
         * ONE TOKEN, EVERY BAND, ONE SIGNATURE (LP v2).
         *
         * A deposit across several bands mints ONE ERC-1155 token holding all of them
         * -- `mint` / `mintSingleSided` -- and a deposit from a position's "Add" button
         * (`?position=<tokenId>`) tops up THAT token with `increaseLiquidity`; it never
         * mints another. apps/web/CLAUDE.md, LP section.
         *
         * `minShares` comes from a STATIC CALL, per band, never from arithmetic -- see
         * `lib/liquidity/minShares.ts` for the two closed forms that were tried and
         * were wrong. The simulation is sent with zero floors; the real call carries
         * the floors it measured.
         *
         * `inputIsBase` and the amount arrays are in the POOL's orientation:
         * `resolved.quoteToBase` says the pool was created with this form's quote as
         * its base, and the arrays above are already flipped for that.
         */
        setPhase("confirming");
        const zeros = bandList.map(() => BigInt(0));
        const recipient = account as `0x${string}`;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
        let hash: `0x${string}`;
        if (converted) {
          if (topUpId) {
            throw new Error(
              "Adding a single token to an existing position is not supported. Deposit both tokens, or open a new position.",
            );
          }
          // `converted.from` is the token the LP brought, in FORM terms; the pool may
          // have been created with the form's quote as its base.
          const inputIsFormBase = converted.from === base;
          const inputIsPoolBase = resolved.quoteToBase ? !inputIsFormBase : inputIsFormBase;
          const amounts = inputIsPoolBase ? poolBaseAmounts : poolQuoteAmounts;

          /*
           * BACKSTOP. `blockedBand` already refused this before the approval, which
           * is where the LP needs to hear it. This catches a pool created moments ago
           * by THIS launch, and a band emptied between that check and here.
           */
          for (const index of bandList) {
            const info = (await publicClient.readContract({
              abi: BandPoolABI,
              address: resolved.pool,
              functionName: "bands",
              args: [index],
            })) as readonly [number, bigint, bigint, bigint, boolean];
            if (info[1] === BigInt(0) && !canSeedEmptyBand(inputIsPoolBase)) {
              const opener = resolved.quoteToBase ? quote : base;
              throw new Error(
                `Band ${index} has no liquidity yet, and an empty band can only be opened with ${opener}. Deposit both tokens, or pick a band that already has liquidity.`,
              );
            }
          }

          const probed = (
            await publicClient.simulateContract({
              abi: bandDepositAbi,
              address: manager as `0x${string}`,
              functionName: "mintSingleSided",
              args: [resolved.pool, bandList, amounts, inputIsPoolBase, zeros, recipient, deadline],
              account: recipient,
            })
          ).result as readonly [bigint, readonly bigint[]];
          const mins = bandList.map((_, i) => minSharesFromProbe(probed[1][i] ?? BigInt(0)));

          hash = await writeContractAsync({
            abi: bandDepositAbi,
            address: manager as `0x${string}`,
            functionName: "mintSingleSided",
            args: [resolved.pool, bandList, amounts, inputIsPoolBase, mins, recipient, deadline],
            chainId: baseTok.chainId,
          });
        } else if (topUpId) {
          const tokenId = BigInt(topUpId);
          const probed = (
            await publicClient.simulateContract({
              abi: bandDepositAbi,
              address: manager as `0x${string}`,
              functionName: "increaseLiquidity",
              args: [tokenId, bandList, poolBaseAmounts, poolQuoteAmounts, zeros, deadline],
              account: recipient,
            })
          ).result as readonly bigint[];
          const mins = bandList.map((_, i) => minSharesFromProbe(probed[i] ?? BigInt(0)));
          hash = await writeContractAsync({
            abi: bandDepositAbi,
            address: manager as `0x${string}`,
            functionName: "increaseLiquidity",
            args: [tokenId, bandList, poolBaseAmounts, poolQuoteAmounts, mins, deadline],
            chainId: baseTok.chainId,
          });
        } else {
          const params = {
            pool: resolved.pool,
            bands: bandList,
            baseAmounts: poolBaseAmounts,
            quoteAmounts: poolQuoteAmounts,
            minShares: zeros,
            recipient,
            deadline,
          };
          const probed = (
            await publicClient.simulateContract({
              abi: bandDepositAbi,
              address: manager as `0x${string}`,
              functionName: "mint",
              args: [params],
              account: recipient,
            })
          ).result as readonly [bigint, readonly bigint[]];
          const mins = bandList.map((_, i) => minSharesFromProbe(probed[1][i] ?? BigInt(0)));
          hash = await writeContractAsync({
            abi: bandDepositAbi,
            address: manager as `0x${string}`,
            functionName: "mint",
            args: [{ ...params, minShares: mins }],
            chainId: baseTok.chainId,
          });
        }
        setDepositHash(hash);
        setPhase("pending");
        /*
         * A reverted transaction HAS a receipt — only `status` separates the two
         * outcomes. And a receipt that never arrives is a THIRD outcome: this
         * wait was unbounded, and measured against Arc on 2026-09-28 a deposit
         * that MINED — pair created, position token on chain with all three
         * bands — left this screen at "pending" until the run gave up 180s
         * later. The money had moved and the page never said so.
         */
        const settled = await awaitReceipt(publicClient, hash);
        if (settled.status === "reverted") throw new Error("The deposit reverted on chain.");
        setDepositConfirmed(settled.status === "success");
        setPhase("done");
        if (settled.status === "success") {
          // The deposit joins the pool — its own cue, which also tells the
          // toast observer this news has been sounded.
          playSound("pool", { key: `deposit:${hash}` });
          toast.success(launch ? "Pool created & position opened" : topUpId ? `Added to position #${topUpId}` : "Position opened");
        } else {
          toast.message("Deposit sent — still confirming on chain", {
            description: "It may take a moment to appear. Do not send it again.",
          });
        }
      } catch (error) {
        setPhase("review");
        toastContractError(error, "Could not open the position", {
          chainId: tokenQuery.data?.find((t) => t.symbol === base)?.chainId,
        });
      }
    }
  };

  const goLabel = !isConnected
    ? "Connect wallet"
    : checkingAllowance
      ? "Checking allowance…"
      : nextUnapproved
      ? `Approve ${nextUnapproved}`
      : launch
        ? "Create pool & add liquidity"
        : topUpId
          ? `Add to position #${topUpId}`
          : "Add liquidity";

  const panel = "rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] shadow-sm";

  // ---- waiting / result sub-views ----
  if (phase === "approving" && approvingTok) {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">Approve {approvingTok}</h3>
        <Waiting
          phase={phase}
          title="Confirm in your wallet"
          body={`Send the ${approvingTok} approval transaction.`}
        />
      </div>
    );
  }
  if (phase === "checking") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">{launch ? "Create pool" : "Add liquidity"}</h3>
        <Waiting phase={phase} title="Checking the pool" body="Reading this market on chain. Nothing to sign yet." />
      </div>
    );
  }
  if (phase === "creating") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">Create pool</h3>
        <Waiting
          phase={phase}
          title="Confirm in your wallet"
          body={`List ${base}/${quote} at your starting price. The deposit is the next prompt.`}
        />
      </div>
    );
  }
  if (phase === "confirming") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">{launch ? "Create pool" : "Add liquidity"}</h3>
        <Waiting
          phase={phase}
          title="Confirm in your wallet"
          body={launch ? "Create the pool and mint your position." : "Add your liquidity in one transaction."}
        />
      </div>
    );
  }
  if (phase === "pending") {
    return (
      <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
        <h3 className="mb-3.5 text-base font-semibold">Submitted</h3>
        <Waiting
          phase={phase}
          title="Confirming on-chain"
          body="Your position is being minted."
          tx={depositHash ? `${shortHash(depositHash)} ↗` : undefined}
        />
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div
        data-testid="liq-result"
        data-tx-hash={depositHash ?? undefined}
        className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}
      >
        <div className="flex flex-1 flex-col items-center text-center">
          <div
            className="mb-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-full text-[26px] font-bold text-[var(--m-success)]"
            style={{ background: "color-mix(in srgb,var(--m-success) 16%,transparent)" }}
          >
            ✓
          </div>
          <h4 className="mb-1 text-[17px] font-semibold">
            {/* Never claim a position was opened on a receipt nobody saw. */}
            {!depositConfirmed
              ? "Deposit sent"
              : launch
                ? "Pool created & position opened"
                : "Position opened"}
          </h4>
          {!depositConfirmed && (
            <p className="mb-2 text-[12.5px] text-[var(--m-warning)]">
              Still confirming on chain — it may take a moment to appear. Do not send it again.
            </p>
          )}
          <p className="mb-2.5 text-[12.5px] text-[var(--m-text-secondary)]">
            {base}/{quote}{banded ? "" : ` · ${fee}%`} · {banded ? bandsText : rangeText}
          </p>
          <div className="mt-1.5 w-full self-stretch rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-1 text-left">
            <ReviewRow k="Deposited"><b className="font-mono tabular-nums text-[var(--m-text-primary)]">{depositText}</b></ReviewRow>
            {/* THE CONVERSION, said on the receipt and not only on the review.
                A single-sided deposit ends two-sided: the manager swaps half the
                input through the pool on the way in. Without this line the user
                brought one token, the position holds two, and nothing on the card
                accounts for the difference — the amounts simply look wrong. */}
            {converted && (
              <ReviewRow k="Converted on deposit">
                <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
                  half your {converted.from} → {converted.to}
                </b>
              </ReviewRow>
            )}
            {/* The ladder is the product, so the receipt itemises it. One
                aggregate row hides the distribution the user just spent a screen
                choosing, and it is the only place an uneven split shows up. */}
            {bandBreakdown?.map((row) => (
              <ReviewRow key={row.index} k={`Band ${row.index}`}>
                <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
                  {row.base} {base} + {row.quote} {quote}
                </b>
              </ReviewRow>
            ))}
            <ReviewRow k="Status"><b className="font-mono text-[var(--m-logo)]">{statusText}</b></ReviewRow>
            <ReviewRow k="Transaction">
              <b className="font-mono text-[var(--m-primary-fg)]">
                {depositHash ? `${shortHash(depositHash)} ↗` : "—"}
              </b>
            </ReviewRow>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={onDone} className="mt-3 w-full rounded-[13px] bg-[color:var(--m-primary)] py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)]">
            View in portfolio
          </button>
        </div>
      </div>
    );
  }

  // ---- review ----
  return (
    <div className={cn(panel, "mx-auto flex min-h-[360px] max-w-[460px] flex-col p-5")}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <BackButton onClick={back} label="Back to the deposit" />
        <h3 className="text-base font-semibold">{launch ? "Create pool" : "Add liquidity"}</h3>
      </div>

      <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-1">
        <ReviewRow k="Pool">
          <span className="flex items-center gap-1.5 font-mono text-[var(--m-text-primary)]">
            <TokenImageIcon symbol={base} color={liqToken(base).color} size="sm" className="h-[18px] w-[18px] text-[6px]" />
            {base}/{quote}
            {banded ? null : ` · ${fee}%`}
          </span>
        </ReviewRow>
        <ReviewRow k={launch ? "Starting price" : "Current price"}>
          <b className="font-mono tabular-nums text-[var(--m-text-primary)]">1 {base} = {fmt(rate)} {quote}</b>
        </ReviewRow>
        <ReviewRow k={banded ? (seeded.length > 1 ? "Bands" : "Band") : "Range"}>
          <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
            {banded ? bandsText : rangeText}
          </b>
        </ReviewRow>
        {converted && (
          <ReviewRow k="Converted on deposit">
            <b className="font-mono tabular-nums text-[var(--m-text-primary)]">
              half your {converted.from} → {converted.to}
            </b>
          </ReviewRow>
        )}
        <ReviewRow k="Deposit">
          <b data-testid="liq-review-deposit" className="font-mono tabular-nums text-[var(--m-text-primary)]">{depositText}</b>
        </ReviewRow>
      </div>

      {/*
        What each band actually receives.

        Only when the deposit covers more than one band: with a single band the split
        IS the deposit line above, and repeating it would imply a division happened.
        It is ONE position either way — one token holds the whole ladder — so this
        lists where its capital sits, never a count of positions.
      */}
      {banded && seeded.length > 1 && seeded.some((b) => b.deposit) && (
        <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--m-text-secondary-2)]">
            Split across bands
          </div>
          <div className="flex flex-col gap-1">
            {seeded.map((b) => (
              <div key={b.index} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="font-mono tabular-nums text-[var(--m-text-secondary)]">
                  ±{(b.tolerance * 100).toFixed(2)}%
                  {b.index === 0 ? " · fills first" : ""}
                </span>
                <span className="font-mono tabular-nums text-[var(--m-text-primary)]">
                  {b.deposit ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {maturitySec !== undefined && (
        <div className="mb-1.5 mt-2 rounded-[13px] border border-[var(--m-primary)] bg-[color-mix(in_srgb,var(--m-primary)_9%,transparent)] px-3.5 py-2.5 text-[12.5px]">
          <b className="block">Fees vest over {Math.round(maturitySec / 60)} minutes</b>
          <span className="text-[var(--m-text-secondary)]">
            Withdraw sooner and the unvested fees go to the other LPs in{" "}
            {seeded.length > 1 ? "those bands" : "this band"}. Your deposit is never locked.
          </span>
        </div>
      )}
      {/*
        THE WALL'S ONE CAVEAT, on the screen where it matters.
        It used to sit on the deposit card, answering a question nobody had asked
        yet and costing 95px of the reason Review was off screen. Here it is
        beside what it qualifies, at the moment the LP is reading what they are
        about to agree to. `side !== 0 && !converted` IS the wall: one token
        brought, and nothing being swapped for it.
      */}
      {side !== 0 && !converted && banded && (
        <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5 text-[12.5px]">
          <b className="block">Traders convert this, not a price you set.</b>
          <span className="text-[var(--m-text-secondary)]">
            Traders swap your {side === -1 ? base : quote} into{" "}
            {side === -1 ? quote : base} bit by bit, and you earn a fee each time.{" "}
            <b>Not a limit order</b> — it converts at whatever the market is doing, not
            at a level you picked.
          </span>
        </div>
      )}

      {converted && (
        <div className="mb-1.5 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5 text-[12.5px]">
          <b className="block">
            You will end up holding both {converted.from} and {converted.to}
          </b>
          <span className="text-[var(--m-text-secondary)]">
            A band holds both tokens, so half your {converted.from} is swapped for{" "}
            {converted.to} on the way in. The mix then keeps shifting as people trade —
            you gain whichever token they are selling. Amounts above are estimates; the
            split depends on the price when the swap goes through.
          </span>
        </div>
      )}

      <div className="mb-1.5 mt-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
        Approvals ({needed.length})
      </div>
      {needed.map((t) => {
        // Covered either way: approved in this visit, or already on chain before
        // it. Reading only the first left a returning LP looking at two open
        // approval steps the button had already (correctly) skipped.
        const approvedHere = approved.includes(t);
        const done = approvedHere || onChainApproved.has(t);
        const method = "on-chain approve";
        return (
          <div
            key={t}
            data-testid={`liq-approval-${t}`}
            data-approved={done}
            className={cn(
              "mb-1.5 flex items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-[13px]",
              done ? "border-[color-mix(in_srgb,var(--m-success)_34%,transparent)]" : "border-[var(--m-border)]",
            )}
          >
            <span
              className={cn(
                "flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[13px]",
                done ? "bg-[color-mix(in_srgb,var(--m-success)_15%,transparent)] text-[var(--m-success)]" : "bg-[var(--m-surface-2)]",
              )}
            >
              {done ? "✓" : "○"}
            </span>
            Approve {t}
            <span className={cn("ml-auto font-mono text-[11px]", done ? "text-[var(--m-success)]" : "text-[var(--m-text-secondary-2)]")}>
              {approvedHere ? "approved" : done ? "already approved" : method}
            </span>
          </div>
        );
      })}

      <div className="flex-1" />
      <PoolRiskNote
        className="mt-3"
        quoteSymbol={quote}
        variant={
          launch
            ? launchIsCoinOnly(side, amtQuote)
              ? "launch-coin-only"
              : "standard"
            : poolRisk === "thin"
              ? "thin"
              : "standard"
        }
        onAddQuote={onAddQuoteSide}
      />
      <button type="button" data-testid="liq-confirm-go" disabled={checkingAllowance} onClick={() => void go()} className="mt-3 w-full rounded-[13px] bg-[color:var(--m-primary)] py-3.5 text-[15px] font-semibold text-[color:var(--m-on-primary)] hover:bg-[color:var(--m-primary-hover)] disabled:cursor-wait disabled:opacity-60">
        {goLabel}
      </button>
    </div>
  );
}

function ReviewRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--m-border)] py-2 text-[12.5px] text-[var(--m-text-secondary)] first:border-t-0">
      <span>{k}</span>
      {children}
    </div>
  );
}

function Waiting({ phase, title, body, tx }: { phase: Phase; title: string; body: string; tx?: string }) {
  return (
    // `data-phase` is for e2e: a launch raises two wallet prompts back to back,
    // and the second must not be answered until the app has actually asked.
    <div
      data-testid="liq-waiting"
      data-phase={phase}
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <span className="h-[42px] w-[42px] animate-spin rounded-full border-[3px] border-[var(--m-border)] border-t-[var(--m-primary)] motion-reduce:animate-none" />
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="max-w-[30ch] text-[12.5px] text-[var(--m-text-secondary)]">{body}</p>
      {tx && (
        <span className="rounded-[9px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--m-primary-fg)]">
          {tx}
        </span>
      )}
    </div>
  );
}
