/**
 * Pure helpers for the Creator tab. Kept out of the component so the rules that
 * are easy to get wrong — how a rate is written,
 * how a change with no prior price renders — are testable without a DOM.
 *
 * See apps/web/CLAUDE.md ("Portfolio page → Creator tab").
 */

import type { CreatorToken } from "./types";

/**
 * Market caps are formatted the same way everywhere — the token tables print
 * `$4.1m` and so does this one. Re-exported rather than reimplemented so the two
 * cannot drift.
 */
export { formatMarketCap } from "@/utils/number";

export interface CreatorSummary {
  launched: number;
  seededUsd: number;
  feesEarnedUsd: number;
  holders: number;
}

/** The four numbers in the panel's header strip. */
export function creatorSummary(tokens: CreatorToken[]): CreatorSummary {
  return {
    launched: tokens.length,
    seededUsd: tokens.reduce((s, t) => s + t.seededUsd, 0),
    feesEarnedUsd: tokens.reduce((s, t) => s + t.feesEarnedUsd, 0),
    holders: tokens.reduce((s, t) => s + t.holders, 0),
  };
}

/**
 * `1 NOVA = 0.0412 USDC`. A rate, never a `$` price — the launch and liquidity
 * specs both require this, and the quote is frequently not a dollar.
 */
export function formatRate(t: Pick<CreatorToken, "symbol" | "quote" | "rate">): string {
  return `1 ${t.symbol} = ${t.rate} ${t.quote}`;
}

/**
 * A fresh launch has no prior price, so there is no change to show. An em-dash
 * says that; `0.0%` would claim the price held flat.
 */
export function formatChange(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function changeTone(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

/** Supply split for the detail bar. Creator share is the remainder, so the two always sum to 100. */
export function supplySplit(t: Pick<CreatorToken, "poolPct">): { pool: number; creator: number } {
  const pool = Math.min(100, Math.max(0, t.poolPct));
  return { pool, creator: 100 - pool };
}

/**
 * Whether this wallet may edit the token's name/logo/description.
 *
 * Always false today: `admin.adminTokenMeta` has no `ownerAddress` column, so
 * the server cannot tell a creator from anyone else and only accepts the
 * operator key. The control is rendered disabled rather than hidden — a row
 * that silently disappears reads as a bug, the same call the launch approval
 * queue makes about its struck-through approval step.
 */
export function canEditMetadata(t: Pick<CreatorToken, "metaClaimed">): boolean {
  return t.metaClaimed;
}

/* ─────────────────────────── graduation ─────────────────────────── */

/**
 * Graduation, as the creator's row sees it.
 *
 * A launched token is hidden from every ranked list in the app until its market
 * holds `thresholdUsd` of QUOTE liquidity — the base side is the creator's own
 * seeded mint, so counting it would let anyone list anything. Three states, and
 * the control is rendered in all three: disabled below the threshold rather than
 * hidden, the same call the flow already makes for the struck-through approval
 * row and `Edit logo & description`. A control that quietly disappears reads as
 * a bug; a disabled one with the shortfall named reads as a rule.
 */
export type GraduationState = "below" | "eligible" | "graduated";

export interface GraduationInfo {
  /** Quote-side liquidity in the launch market, USD. */
  quoteTvlUsd: number;
  thresholdUsd: number;
  /**
   * Which rule the server actually grades this market by: `"quote"` (an amount
   * of the quote asset itself) or `"usd"` (the global threshold).
   *
   * Optional, and absent means USD — which is what an admin-service deployed
   * before per-quote amounts existed genuinely grades on, so reading it that
   * way is correct rather than a guess.
   *
   * This matters more here than anywhere else in the app: the button below is
   * enabled exactly when the server would act, so a bar drawn from the USD
   * figures on a quote-graded market would offer a creator a button the server
   * then refuses — or, worse, sit at 40% while the sweep lists them.
   */
  basis?: "quote" | "usd";
  /** The unit `amount` and `required` are in: a quote symbol, or "USD". */
  unit?: string;
  amount?: number;
  required?: number;
  /** Set once the market has graduated; unix seconds. */
  graduatedAt: number | null;
  /** What it was worth at the moment it crossed — not what it is worth now. */
  graduatedAtQuoteTvlUsd: number | null;
  /** What it graduated ON, in its own unit. Null when the row predates the basis. */
  graduatedAtAmount?: number | null;
  graduatedAtUnit?: string | null;
}

/** The figures that actually decide, whichever basis is in force. The single
 * place the two are collapsed — every function below reads through it. */
export function graduationMeasure(info: GraduationInfo): {
  unit: string;
  amount: number;
  required: number;
  met: boolean;
} {
  const quote = info.basis === "quote" && info.amount != null && info.required != null;
  const amount = quote ? (info.amount as number) : info.quoteTvlUsd;
  const required = quote ? (info.required as number) : info.thresholdUsd;
  return {
    unit: quote ? (info.unit ?? "quote") : "USD",
    amount: Number.isFinite(amount) ? amount : 0,
    required,
    met: (Number.isFinite(amount) ? amount : 0) >= required,
  };
}

export function graduationState(info: GraduationInfo): GraduationState {
  if (info.graduatedAt !== null) return "graduated";
  return graduationMeasure(info).met ? "eligible" : "below";
}

/**
 * The button is live only when the server would actually act.
 *
 * Below the threshold the endpoint refuses and writes nothing, so an enabled
 * control would offer a capability the server declines — exactly the reasoning
 * that keeps `Edit logo & description` disabled. Once graduated there is nothing
 * left to ask for.
 */
export function canGraduate(info: GraduationInfo): boolean {
  return graduationState(info) === "eligible";
}

/** 0–100, clamped. Mirrors admin-service's `progressPct`: a zero threshold reads
 * as met rather than dividing to Infinity, and an over-funded market cannot
 * render a bar wider than its track. */
export function graduationProgressPct(info: GraduationInfo): number {
  const { amount, required } = graduationMeasure(info);
  if (!Number.isFinite(required) || required <= 0) return 100;
  return Math.max(0, Math.min(100, (amount / required) * 100));
}

/**
 * The sentence under the control.
 *
 * A graduated market reports what it graduated AT, never where it is now: quote
 * TVL routinely falls afterwards (makers pull, the level drops) and showing a
 * shrinking figure beside a "Listed" badge reads as a pending de-listing, which
 * never happens — graduation latches.
 */
export function graduationHelp(symbol: string, info: GraduationInfo): string {
  const m = graduationMeasure(info);
  switch (graduationState(info)) {
    case "graduated": {
      // Reported in the unit it graduated in. A market that crossed on 100,000
      // USDC did not "graduate at $99,997" — that is a price feed's opinion of
      // the moment, and the creator is reading a fact about their market.
      if (info.graduatedAtAmount != null && info.graduatedAtUnit) {
        return `Graduated at ${amountCompact(info.graduatedAtAmount, info.graduatedAtUnit)} of quote liquidity. ${symbol} stays listed even if liquidity falls — only an Iter operator can hide it.`;
      }
      const at = info.graduatedAtQuoteTvlUsd;
      return at !== null
        ? `Graduated at ${usdCompact(at)} of quote liquidity. ${symbol} stays listed even if liquidity falls — only an Iter operator can hide it.`
        : `${symbol} stays listed even if liquidity falls — only an Iter operator can hide it.`;
    }
    case "eligible":
      return `Threshold met. Graduating lists ${symbol} and its market across the app — it happens on its own within a minute either way.`;
    case "below":
      return `${symbol} lists across the app once its book holds ${amountCompact(
        m.required,
        m.unit,
      )} of quote liquidity. ${amountCompact(
        Math.max(0, m.required - m.amount),
        m.unit,
      )} to go.`;
  }
}

/**
 * A compact amount with its unit.
 *
 * A quote amount never takes a `$`: it is a count of tokens, and "$30" for 30
 * WETH is off by four orders of magnitude and reads as a price. It also keeps
 * more digits than the USD form, because 0.5 and 0.05 of a quote asset are a
 * factor of ten apart and both compact to "0.1k".
 */
export function amountCompact(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "USD") return usdCompact(value);
  const digits = Math.abs(value) >= 1_000 ? 0 : Math.abs(value) >= 1 ? 2 : 6;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ${unit}`;
}

/** Compact USD for the progress line. Kept here rather than in the component so
 * the copy above and the figures below the bar cannot drift apart. */
export function usdCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  // Billions, which this had no branch for: 2.5e9 rendered as `$2500.00M`. A
  // graduation threshold will not reach it, but `amountCompact` routes every USD
  // figure through here and a market cap certainly can.
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/* ──────────────── fee tier: the contract's graduation ──────────────── */

/**
 * The SECOND graduation, and the one that is a transaction.
 *
 * `graduationState` above is the listing one: quote TVL, a POST to admin-service that
 * carries no authority. This one is `CoinGenerator` — market cap clearing
 * `graduationUsd` on chain — and its effect is the taker fee dropping from the quote's
 * starting rate to `postGraduationTakerFee`, plus the creator gaining control of it.
 *
 * Kept in separate helpers with separate vocabulary on purpose. They are not stages of
 * one process, and a UI that blurs them will tell a creator their coin "graduated" while
 * the thing they wanted did not happen.
 */
export interface FeeTierInfo {
  contractMarketCapUsd: number | null;
  graduationUsd: number;
  feeGraduated: boolean;
  takerFeeNum: number;
  maxCreatorTakerFeeNum: number;
  creatorFeeLocked: boolean;
}

/** The contract's fee denominator (`FEE_DENOM`). 1e8: 1% is 1_000_000. */
export const FEE_DENOM = 100_000_000;

/** `1_000_000` → `"1.00%"`. The scale is the contract's, the reader's is percent. */
export function formatTakerFee(feeNum: number): string {
  if (!Number.isFinite(feeNum)) return "—";
  return `${((feeNum / FEE_DENOM) * 100).toFixed(2)}%`;
}

export type FeeTierState = "starting" | "eligible" | "graduated";

export function feeTierState(info: FeeTierInfo): FeeTierState {
  if (info.feeGraduated) return "graduated";
  if (info.graduationUsd <= 0) return "starting";
  if (info.contractMarketCapUsd === null) return "starting";
  return info.contractMarketCapUsd >= info.graduationUsd ? "eligible" : "starting";
}

/**
 * Whether `graduate()` would succeed right now.
 *
 * A zero `graduationUsd` means the requirement is unset and the contract reverts
 * `GraduationRequirementNotSet` — deliberate upstream, so the button must stay dead
 * rather than offering a call that cannot work.
 */
export function canGraduateFeeTier(info: FeeTierInfo): boolean {
  return feeTierState(info) === "eligible";
}

/** Why the creator cannot move the fee, or null when they can. */
export type FeeControlBlock = "not-graduated" | "locked" | "no-headroom" | null;

export function feeControlBlockedBy(info: FeeTierInfo): FeeControlBlock {
  if (!info.feeGraduated) return "not-graduated";
  if (info.creatorFeeLocked) return "locked";
  // A zero cap is how an admin disables the feature venue-wide. The only reachable
  // value is 0, so a slider would be a lie — the UI collapses to a single action.
  if (info.maxCreatorTakerFeeNum === 0 && info.takerFeeNum === 0) return "no-headroom";
  return null;
}

export function canSetTakerFee(info: FeeTierInfo): boolean {
  return feeControlBlockedBy(info) === null;
}

/** The sentence under the fee control. Says what is true now and what changes it. */
export function feeControlHelp(symbol: string, info: FeeTierInfo): string {
  switch (feeControlBlockedBy(info)) {
    case "not-graduated": {
      const cap = info.contractMarketCapUsd;
      const at = usdCompact(info.graduationUsd);
      if (info.graduationUsd <= 0) {
        return `Set by Iter per quote token while a coin is new. Iter has not set a graduation requirement yet, so ${symbol} stays on its starting rate.`;
      }
      return cap === null
        ? `Set by Iter per quote token while a coin is new. Yours to adjust once ${symbol} graduates at ${at} market cap — unpriced until its book has a trade.`
        : `Set by Iter per quote token while a coin is new. Yours to adjust once ${symbol} graduates at ${at} market cap — currently ${usdCompact(cap)}.`;
    }
    case "locked":
      return `An Iter operator has paused fee control for ${symbol}. The fee stays where it is until they restore it.`;
    case "no-headroom":
      return `Iter has set the creator ceiling to 0%, so ${symbol} trades fee-free and there is nothing to adjust.`;
    default:
      return `Traders pay this on every fill, from the next trade — there is no delay and no notice. Requires a signature.`;
  }
}

/** 0–100 for the fee-tier progress bar. Same clamping rules as the listing bar. */
export function feeTierProgressPct(info: FeeTierInfo): number {
  if (!Number.isFinite(info.graduationUsd) || info.graduationUsd <= 0) return 0;
  const cap = info.contractMarketCapUsd;
  if (cap === null || !Number.isFinite(cap)) return 0;
  return Math.max(0, Math.min(100, (cap / info.graduationUsd) * 100));
}
