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
 *
 * `custom` is not one either, and for the opposite reason: it carries no rule at
 * all. It is whatever the LP dragged, so the weights travel beside it rather
 * than being derivable from the name. Every other shape can be recomputed from
 * the band count; this one cannot, which is why `resolveDepositShape` takes the
 * vector as an argument instead of looking it up.
 */
export type DepositShape = BandShape | "auto" | "custom";

/**
 * Every shape a deposit can be ASKED for, as a value — so a caller reading one
 * out of a URL can check it against the type instead of re-listing the members
 * and drifting from them.
 *
 * `custom` is in it because a URL could legitimately carry one, and excluding it
 * here would silently downgrade a custom deposit to the default; what `custom`
 * cannot do is arrive WITHOUT its weight vector, which is `resolveDepositShape`'s
 * problem and not this list's.
 */
export const DEPOSIT_SHAPES: readonly DepositShape[] = [
  "auto",
  "spot",
  "curve",
  "wide",
  "custom",
];

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
  /**
   * The LP's own split, aligned with the USABLE bands. Only read when `shape`
   * is `custom`, and only when it lines up: a vector of the wrong length is a
   * stale drag from a different band set — most likely the pair changed under
   * it — and applying it would put someone's ±0.50% allocation on a band that
   * is now ±0.02%. Falling back to `curve` there loses a drag; using it would
   * lose money.
   */
  customWeights?: number[],
): ResolvedShape {
  const bands = selectableBands(set, selected);
  const verdict = stats ? describeAuto(set, selected, stats) : null;
  const autoReady = Boolean(stats && verdict?.available);
  const customUsable =
    shape === "custom" &&
    Array.isArray(customWeights) &&
    customWeights.length === bands.length &&
    customWeights.some((w) => w > 0);
  const active: DepositShape =
    shape === "auto" && !autoReady ? "curve" : shape === "custom" && !customUsable ? "curve" : shape;

  const weights =
    active === "custom" && customWeights
      ? customWeights.slice(0, bands.length)
      : active === "auto" && stats
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

/**
 * Set one band's share and spread the remainder over the others.
 *
 * Proportionally, in their existing balance, so moving one band never silently
 * rewrites the ones the LP was happy with — the failure a naive "even split of
 * the rest" produces, where nudging the tightest band quietly flattens a curve
 * into a spot.
 *
 * Returns null rather than an all-zero vector when the move would empty the
 * deposit. An empty split has no valid transaction, and the UI's only honest
 * response is to refuse the gesture: zeroing it would leave a Review button
 * that stops working with nothing on screen saying why.
 *
 * `position` indexes the USABLE bands — the same array `ResolvedShape.bands`
 * carries — because every caller is drawn from a resolved split and refused
 * bands are not in it.
 */
export function reallocate(
  weights: readonly number[],
  position: number,
  share: number,
): number[] | null {
  const n = weights.length;
  if (position < 0 || position >= n) return null;

  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  const norm = sum > 0 ? weights.map((w) => Math.max(0, w) / sum) : weights.map(() => 0);
  const target = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  const rest = 1 - target;
  const otherSum = norm.reduce((a, w, i) => (i === position ? a : a + w), 0);

  const next = new Array<number>(n).fill(0);
  next[position] = target;
  if (rest > 0) {
    if (otherSum > 0) {
      for (let i = 0; i < n; i++) if (i !== position) next[i] = (norm[i]! / otherSum) * rest;
    } else if (n > 1) {
      // Nothing to preserve a proportion of. The remainder goes to the band
      // that fills first, which is the tightest — where liquidity does the most
      // work when nobody has said otherwise.
      next[position === 0 ? 1 : 0] = rest;
    }
  }
  return next.some((w) => w > 0) ? next : null;
}
