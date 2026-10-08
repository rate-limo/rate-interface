"use client";

/**
 * The review screen both launch flows end on.
 *
 * ## Why it is one component and not two
 *
 * Fair launch and presale ask for different things and deploy different
 * contracts, but the last screen answers the same question in both: *what am I
 * about to sign for?* Two implementations of that is how one of them quietly
 * stops matching — the argument this repo has already made about the stepper
 * (four copies, every value a notch apart), the USD formatter (three, and the
 * middle of the range fell through) and the referral handshake.
 *
 * What differs between the flows is the CONTENT — which four figures matter,
 * what the supply splits into, and what the warning is allowed to claim. All
 * three are props, so a flow cannot accidentally inherit the other's claims.
 *
 * ## The chart divides by the supply
 *
 * See `lib/launch/allocation.ts`. The short version: the numbers come from
 * fields the creator typed, so they do not add up, and normalising by their
 * sum turns 60% of the supply into a full ring. The unspoken-for remainder is
 * drawn as its own slice and an over-allocation is stated in words.
 *
 * ## The donut carries no information the legend lacks
 *
 * It is `aria-hidden`, and every slice has a legend row with its own
 * percentage. A ring whose only reading is by eye and by colour excludes the
 * readers most likely to be checking a number before signing.
 */

import type { ReactNode } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { cn } from "@/lib/utils";
import { donutDashes, fmtShare, type Allocation } from "@/lib/launch/allocation";

/**
 * Slice colours. Semantic tokens are deliberately absent: `--m-success` and
 * `--m-error` mean good and bad everywhere else in the app, and a treasury
 * allocation is neither. These are four distinguishable hues from the palette
 * plus one muted tone reserved for the remainder, which is not a decision the
 * creator made and should not look like one.
 */
const SLICE_COLORS = [
  "var(--m-primary)",
  "var(--m-logo)",
  "var(--m-accent)",
  "color-mix(in srgb, var(--m-primary) 45%, var(--m-text-secondary))",
  "color-mix(in srgb, var(--m-logo) 45%, var(--m-text-secondary))",
];
const REMAINDER_COLOR = "var(--m-border)";

export interface ReviewTile {
  label: string;
  value: string;
  /** A second line under the figure — units, a caveat, where it came from. */
  hint?: string;
}

export function ReviewSummary({
  title,
  lede,
  symbol,
  name,
  logoURI,
  chip,
  tiles,
  allocation,
  allocationTitle = "Token allocation",
  allocationLede = "Distribution of total token supply",
  allocationNote,
  children,
  className,
}: {
  title: string;
  lede: string;
  symbol: string;
  name: string;
  logoURI?: string;
  /** Which kind of launch this is — the reader's one-word orientation. */
  chip?: string;
  tiles: ReviewTile[];
  /** Null when the flow has no split worth drawing; the panel is then absent. */
  allocation?: Allocation | null;
  allocationTitle?: string;
  allocationLede?: string;
  allocationNote?: ReactNode;
  /** The warning, any gate, and the actions — everything flow-specific. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div>
        <h3 className="text-[21px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-1 text-[13px] text-[var(--m-text-secondary)]">{lede}</p>
      </div>

      <div className="flex items-center gap-3">
        <TokenImageIcon
          symbol={symbol}
          color="var(--m-logo)"
          logoURI={logoURI}
          size="lg"
          className="h-[46px] w-[46px] text-[13px]"
        />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold">
            {name}{" "}
            <span className="font-normal text-[var(--m-text-secondary)]">(${symbol})</span>
          </p>
          {chip && (
            <span className="mt-1 inline-block rounded-md bg-[var(--m-surface-2)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--m-text-secondary)]">
              {chip}
            </span>
          )}
        </div>
      </div>

      {/* Four, and four is the shape. The portfolio's summary strip carries the
          same rule and the same reason: grid-cols-2 md:grid-cols-4 has no good
          five-up, so a fifth figure belongs in the rows below, not here. */}
      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {tiles.slice(0, 4).map((tile) => (
          <div
            key={tile.label}
            className="rounded-[13px] border border-[var(--m-border)] px-3.5 py-3"
          >
            <dt className="text-[12px] text-[var(--m-text-secondary)]">{tile.label}</dt>
            <dd className="mt-1.5 truncate font-mono text-[19px] tabular-nums">{tile.value}</dd>
            {tile.hint && (
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--m-text-secondary-2)]">
                {tile.hint}
              </p>
            )}
          </div>
        ))}
      </dl>

      {allocation && allocation.slices.length > 0 && (
        <section className="rounded-[15px] border border-[var(--m-border)] p-4 sm:p-5">
          <h4 className="text-[15px] font-semibold">{allocationTitle}</h4>
          <p className="mt-0.5 text-[12.5px] text-[var(--m-text-secondary)]">{allocationLede}</p>

          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            <Donut allocation={allocation} />
            <ol className="w-full min-w-0 flex-1 space-y-2.5">
              {allocation.slices.map((slice, i) => (
                <li key={slice.label} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-[22px] shrink-0 font-mono text-[11.5px] text-[var(--m-text-secondary-2)]">
                    #{slice.rank}
                  </span>
                  <span
                    aria-hidden
                    className="h-[11px] w-[11px] shrink-0 rounded-[3px]"
                    style={{ background: colorFor(slice.remainder, i) }}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      slice.remainder && "text-[var(--m-text-secondary)]",
                    )}
                  >
                    {slice.label}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums">
                    {fmtShare(slice.fraction)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {allocation.overAllocated && (
            <p className="mt-4 rounded-[11px] border border-[var(--m-error)] bg-[color-mix(in_srgb,var(--m-error)_10%,transparent)] px-3.5 py-2.5 text-[12.5px] text-[var(--m-error-fg)]">
              This split promises {allocation.overflow.toLocaleString("en-US")} more coins than the
              supply holds. Go back and reduce one of the allocations — the percentages above are
              shares of the supply, so they add to more than 100%.
            </p>
          )}

          {allocationNote && (
            <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--m-text-secondary)]">
              {allocationNote}
            </p>
          )}
        </section>
      )}

      {children}
    </div>
  );
}

function colorFor(remainder: boolean, index: number): string {
  return remainder ? REMAINDER_COLOR : SLICE_COLORS[index % SLICE_COLORS.length]!;
}

/**
 * Stroked circles, not arc paths — a single 100% slice is a real case here and
 * an arc from 0 to 360 degrees draws nothing. `lib/launch/allocation.ts` owns
 * the dash arithmetic so it can be tested without a DOM.
 */
function Donut({ allocation }: { allocation: Allocation }) {
  const size = 168;
  const stroke = 34;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashes = donutDashes(allocation.slices, c);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--m-surface-2)"
        strokeWidth={stroke}
      />
      {allocation.slices.map((slice, i) => (
        <circle
          key={slice.label}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorFor(slice.remainder, i)}
          strokeWidth={stroke}
          strokeDasharray={dashes[i]!.dash}
          strokeDashoffset={dashes[i]!.offset}
          // Twelve o'clock is where a reader expects a pie to start.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ))}
    </svg>
  );
}
