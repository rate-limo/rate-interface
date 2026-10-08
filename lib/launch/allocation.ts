/**
 * Turning a supply split into something a donut can draw, honestly.
 *
 * Both review screens show "here is where the supply goes", and both get their
 * numbers from fields the creator typed. Typed numbers do not add up to the
 * supply — that is the normal case mid-draft, not an error — so the two states
 * this exists to handle are the two a naive `value / total` gets wrong:
 *
 *   under-allocated  some supply is spoken for by nothing. A chart that
 *                    normalises by the SUM instead of the SUPPLY silently
 *                    inflates every slice to cover the gap, so 60% of the
 *                    supply renders as a full ring.
 *   over-allocated   the split promises more coins than exist. Normalising
 *                    hides it completely; the ring looks perfect.
 *
 * So the total is always the SUPPLY, the shortfall becomes a real slice, and
 * an overflow is reported rather than scaled away. `AuctionFlow` already
 * refuses to continue past an overflow; the review is the screen where the
 * creator should be able to see why.
 */

export interface AllocationInput {
  label: string;
  /** Coins, not a percentage. Negative and non-finite values read as zero. */
  value: number;
}

export interface AllocationSlice extends AllocationInput {
  /** Share of SUPPLY, 0–1. Only meaningful when `overAllocated` is false. */
  fraction: number;
  /** 1-based, by size — what the legend prints as #1, #2, … */
  rank: number;
  /** True for the synthetic remainder, which is not something the creator entered. */
  remainder: boolean;
}

export interface Allocation {
  slices: AllocationSlice[];
  total: number;
  allocated: number;
  /** allocated − total when positive; zero otherwise. */
  overflow: number;
  overAllocated: boolean;
}

const UNALLOCATED = "Unallocated";

function clean(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Slices for a donut, ordered largest first.
 *
 * Zero-valued entries are dropped: a legend row reading `Treasury 0.00%` is a
 * line of noise, and an invisible arc with a visible label reads as a bug. The
 * remainder is appended rather than sorted in, so it always sits last no
 * matter how large it is — it is the absence of a decision, and ranking it
 * above the decisions would misdescribe the chart.
 */
export function allocate(inputs: readonly AllocationInput[], supply: number): Allocation {
  const total = clean(supply);
  const entries = inputs
    .map((i) => ({ label: i.label, value: clean(i.value) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const allocated = entries.reduce((sum, i) => sum + i.value, 0);
  const overflow = Math.max(0, allocated - total);
  const remainder = Math.max(0, total - allocated);

  const withRemainder = [...entries];
  if (remainder > 0 && total > 0) withRemainder.push({ label: UNALLOCATED, value: remainder });

  const slices: AllocationSlice[] = withRemainder.map((entry, index) => ({
    ...entry,
    // Divided by the SUPPLY, never by the sum — see this module's docstring.
    fraction: total > 0 ? entry.value / total : 0,
    rank: index + 1,
    remainder: entry.label === UNALLOCATED,
  }));

  return { slices, total, allocated, overflow, overAllocated: overflow > 0 };
}

export interface DonutDash {
  /** `stroke-dasharray` — the drawn run followed by the rest of the ring. */
  dash: string;
  /** `stroke-dashoffset`, already negated for a clockwise sweep. */
  offset: number;
}

/**
 * Dash geometry for a stroked-circle donut.
 *
 * Stroked circles rather than arc paths on purpose: an arc from 0 to 360°
 * starts and ends at the same point, so a single 100% slice — which is exactly
 * what a launch with no seeded liquidity produces — draws nothing at all. A
 * dash run of the full circumference draws the whole ring.
 *
 * Fractions past 1 are clamped so an over-allocated draft renders a full ring
 * instead of laps over itself; the overflow is reported in words beside it.
 */
export function donutDashes(
  slices: readonly Pick<AllocationSlice, "fraction">[],
  circumference: number,
): DonutDash[] {
  const c = Number.isFinite(circumference) && circumference > 0 ? circumference : 0;
  let travelled = 0;
  return slices.map((slice) => {
    const f = Math.min(1, Math.max(0, slice.fraction));
    const run = f * c;
    const dash: DonutDash = { dash: `${run} ${c}`, offset: -travelled * c };
    travelled = Math.min(1, travelled + f);
    return dash;
  });
}

/** `0.9` → `90.00%`. An absent or broken share is an em-dash, never `0.00%`. */
export function fmtShare(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(2)}%`;
}
