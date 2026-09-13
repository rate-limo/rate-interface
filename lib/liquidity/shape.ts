/**
 * Resolving a deposit shape into the amounts that are actually deposited.
 *
 * The bars under the shape picker and the receipt on the review screen have to be
 * the same numbers, and before this module they were not even the same computation:
 * `BandShapePicker` allocated internally for its own display, while `LiquidityFlow`
 * handed `ConfirmFlow` a list of band indices with no amounts at all. So the shape
 * was a control whose output was discarded one step before it mattered — the picker
 * showed a curve and the deposit was whatever the confirm step decided on its own.
 *
 * Everything that needs an allocation now calls `resolveDepositShape` once and reads
 * the result. Two surfaces cannot disagree about where the money went if only one of
 * them does the arithmetic.
 *
 * @see ./bands.ts for `allocateShaped`, which is exact on bigint
 * @see ./auto.ts for what makes `auto` different from the three presets
 */

import { allocateShaped, selectableBands, shapeWeights, type BandSet, type BandShape } from "./bands";
import { autoWeights, describeAuto, type AutoVerdict, type PairStats } from "./auto";

/**
 * `auto` is not a `BandShape`: the three presets are fixed weight vectors, and auto
 * is a measurement of the pair, so it is computed per pair and can be UNAVAILABLE.
 */
export type DepositShape = BandShape | "auto";

export interface ResolvedShape {
  /**
   * The shape actually applied. Not always the one asked for: `auto` degrades to
   * `curve` when the pair has nothing to measure, and every consumer must render
   * THIS rather than the request, or the picker highlights a card the deposit did
   * not use.
   */
  active: DepositShape;
  /** False means the Auto card is offered but disabled, with `verdict.reason` shown. */
  autoReady: boolean;
  /** Null while the candles are still loading — "measuring", not "nothing found". */
  verdict: AutoVerdict | null;
  /** Usable band indices, tightest first, which is also fill order. */
  bands: number[];
  /** Relative weights, aligned with `bands`. */
  weights: number[];
  /** Amounts aligned with `bands`. Sums to `total` exactly. */
  amounts: bigint[];
}

/**
 * Split one side of a deposit across the resolved bands.
 *
 * A two-sided deposit calls this twice with the same `ResolvedShape`, so both sides
 * land in the same proportions — a band takes the same slice of the base as it does
 * of the quote. Deriving the second side from its own shape lookup would let the two
 * halves of one position disagree about their own shape.
 *
 * Always goes through the weight VECTOR, including for the three presets. The two
 * branches of `allocateShaped` agree exactly — scaling a weight vector by a constant
 * cannot move a floored share — so the single path costs nothing and removes the
 * question of which branch a given caller took.
 */
export function allocateByShape(
  total: bigint,
  set: BandSet,
  selected: number[],
  weights: number[],
): bigint[] {
  return allocateShaped(total, set, selected, weights).amounts;
}

/**
 * What a shape means for this pair, this selection and this amount.
 *
 * `stats` is undefined while the candles are still loading rather than zeroed:
 * `describeAuto` cannot tell "no trading" from "not measured yet", and a zeroed
 * default would report the first as the second — a measurement that happened to say
 * "stay tight" is the worst answer available here.
 */
export function resolveDepositShape(
  set: BandSet,
  selected: number[],
  total: bigint,
  shape: DepositShape,
  stats?: PairStats,
): ResolvedShape {
  const bands = selectableBands(set, selected);
  const verdict = stats ? describeAuto(set, selected, stats) : null;
  const autoReady = Boolean(stats && verdict?.available);
  const active: DepositShape = shape === "auto" && !autoReady ? "curve" : shape;

  const weights =
    active === "auto" && stats
      ? autoWeights(set, selected, stats)
      : shapeWeights(active as BandShape, bands.length);

  return {
    active,
    autoReady,
    verdict,
    bands,
    weights,
    amounts: allocateByShape(total, set, selected, weights),
  };
}

/**
 * Integer units → a display string, at the precision the amount was captured in.
 *
 * Deliberately not `Number(v) / unit`: a deposit large enough to matter and a unit
 * of 1e4 stay well inside float range here, but splitting the whole and fractional
 * parts costs nothing and keeps the rule the allocator follows — the money is
 * bigint, and only the last step is allowed to be a float.
 */
export function formatDepositUnits(v: bigint, decimals: number): string {
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = Number(v / unit);
  const frac = Number(v % unit) / Number(unit);
  return (whole + frac).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse an amount field into the integer units the allocator takes.
 *
 * The inputs carry grouped strings ("1,635"), and a failed parse is 0 rather than
 * NaN — a half-typed amount must leave the split empty, not fill it with NaN bars.
 */
export function depositUnits(raw: string, decimals: number): bigint {
  const value = Number.parseFloat(String(raw).replace(/,/g, "")) || 0;
  if (!Number.isFinite(value) || value <= 0) return BigInt(0);
  return BigInt(Math.round(value * 10 ** decimals));
}
