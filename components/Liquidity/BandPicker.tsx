"use client";

import { cn } from "@/lib/utils";
import {
  bandBounds,
  bandFeeRate,
  bandFeeShares,
  bandReachable,
  stepIntoBandBps,
  type Band,
  type BandSet,
} from "@/lib/liquidity/bands";

const pct = (n: number) => `±${(n * 100).toFixed(n < 0.01 ? 1 : 0)}%`;
const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

/**
 * The bands a deposit joins — the choice that replaces picking a tolerance.
 *
 * Multi-select, because a pair creator seeding a new market wants depth at every
 * price rather than a bet on one, and `addLiquidityAcross` places all of them in a
 * single transaction. Each selected band still becomes its OWN position: a band is a
 * separate share pool with its own accumulator, so they cannot be one token.
 *
 * Bands do NOT nest. Selecting the wide band does not also cover the tight ones —
 * liquidity offered at ±1% filling at ±0.1% would hand the better price to whoever
 * asked for the worse one. Selecting all three is three positions, not one wide one.
 *
 * Ordered tightest-first because that IS the fill order: a swap walks bands from
 * the tightest outward, taking each at its own bound. The order is information,
 * so the list is never sorted by anything else.
 *
 * Closed bands render greyed and disabled rather than hidden. A creator closing a
 * band is a fact about the pool; omitting it turns "you cannot deposit here" into
 * "this does not exist", and an LP with liquidity already in that band would find
 * their position referring to something the page denies.
 */
/**
 * The venue's default slippage tolerance. A band whose entry step exceeds this does
 * not catch overflow from a default-slippage taker: they revert instead of filling.
 */
const DEFAULT_SLIPPAGE_BPS = 50;

export function BandPicker({
  set,
  bands,
  anchor,
  selected,
  onToggle,
  quoteSym,
  baseSym,
}: {
  set: BandSet;
  bands: Band[];
  anchor: number;
  /** Indices currently chosen, in any order. */
  selected: number[];
  onToggle: (index: number) => void;
  baseSym: string;
  quoteSym: string;
}) {
  const openCount = bands.filter((b) => b.open && bandReachable(set, b)).length;

  // Which band actually earned, and how much of the pool's fees it took. Ranked
  // on the quote-denominated total, because a band earns in both currencies and
  // neither side orders them alone.
  const shares = bandFeeShares(bands, anchor);
  const leader = shares.reduce<number | null>(
    (best, value, index) =>
      value !== null && (best === null || value > (shares[best] ?? 0)) ? index : best,
    null,
  );

  if (openCount === 0) {
    return (
      <div className="rounded-[13px] border border-[var(--m-error)] bg-[var(--m-error)]/10 p-3 text-[13px]">
        <b className="block">No band can take liquidity right now.</b>
        <span className="text-[var(--m-text-secondary)]">
          Every band is either closed by the creator or reaches further than this pair&apos;s
          ±{(set.spreadReach * 100).toFixed(2)}% spread. Positions already here still earn
          and can still be withdrawn — only new deposits are refused.
        </span>
      </div>
    );
  }

  // A menu of one is noise: say where the liquidity goes instead of asking.
  if (openCount === 1) {
    const only = bands.find((b) => b.open)!;
    return (
      <div className="rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-3 text-[13px]">
        <b className="block">This pool has one open band, {pct(only.tolerance)}.</b>
        <span className="text-[var(--m-text-secondary)]">Your liquidity goes there.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {bands.map((band) => {
        const [lo, hi] = bandBounds(anchor, band.tolerance);
        const share = shares[band.index] ?? null;
        const topEarner = share !== null && band.index === leader;
        const reachable = bandReachable(set, band);
        // Two different facts, kept apart: the creator shut this band, or the pair's
        // spread does not reach it. Only the first is somebody's decision, and only
        // the second fixes itself when the spread widens.
        const usable = band.open && reachable;
        const active = selected.includes(band.index) && usable;
        // What a taker must tolerate to be pushed here from the band before it. A
        // band only catches overflow from takers whose tolerance covers its step.
        const stepBps = stepIntoBandBps(bands, band.index);
        const outOfReach = stepBps > DEFAULT_SLIPPAGE_BPS;
        return (
          <button
            key={band.index}
            type="button"
            role="checkbox"
            disabled={!usable}
            aria-checked={active}
            onClick={() => onToggle(band.index)}
            className={cn(
              "grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-[13px] border-[1.5px] p-2.5 text-left transition-colors",
              usable
                ? "cursor-pointer bg-[var(--m-surface-2)]"
                : "cursor-not-allowed bg-[var(--m-surface-2)] opacity-60",
              active
                ? "border-[var(--m-primary)] bg-[var(--m-surface)]"
                : "border-transparent hover:border-[var(--m-border)]",
            )}
          >
            {/* A real checkbox mark, not just a border colour: multi-select has to
                read as multi-select before the user has clicked anything. */}
            <span
              aria-hidden
              className={cn(
                "row-span-2 grid h-[18px] w-[18px] place-items-center rounded-[5px] border-[1.5px]",
                usable
                  ? active
                    ? "border-[var(--m-primary)] bg-[var(--m-primary)] text-[var(--m-on-primary)]"
                    : "border-[var(--m-border)]"
                  : "border-[var(--m-border)] opacity-50",
              )}
            >
              {active && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M2.5 6.4 L5 8.9 L9.5 3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="font-mono text-[13px] font-semibold">
              {pct(band.tolerance)}
              {/* The multiplier is the reason to pick a wide band at all: it fills
                  less often and charges more per fill. It was in the data from the
                  start and rendered nowhere, so every band looked like the same
                  trade at a different distance. */}
              <span
                className="ml-1.5 rounded-[3px] bg-[var(--m-surface)] px-1.5 py-px font-mono text-[10px] font-semibold text-[var(--m-logo)]"
                title={`Takers filling here pay ${band.feeMultiplier}x the engine's base taker fee — ${(bandFeeRate(band) * 100).toFixed(2)}% — and that fee is what this band's LPs earn.`}
              >
                {band.feeMultiplier}x fee · {(bandFeeRate(band) * 100).toFixed(2)}%
              </span>
              {band.index === 0 && band.open && (
                <span className="ml-1.5 rounded-[3px] bg-[var(--m-primary)] px-1 py-px font-mono text-[9px] uppercase tracking-wide text-[var(--m-on-primary)]">
                  fills first
                </span>
              )}
              {topEarner && (
                <span className="ml-1.5 rounded-[3px] bg-[var(--m-logo)] px-1 py-px font-mono text-[9px] uppercase tracking-wide text-[var(--m-background)]">
                  most fees
                </span>
              )}
              {!band.open && (
                <span className="ml-1.5 rounded-[3px] bg-[var(--m-border)] px-1 py-px font-mono text-[9px] uppercase tracking-wide text-[var(--m-text-secondary)]">
                  closed
                </span>
              )}
              {band.open && !reachable && (
                <span className="ml-1.5 rounded-[3px] bg-[var(--m-border)] px-1 py-px font-mono text-[9px] uppercase tracking-wide text-[var(--m-text-secondary)]">
                  out of reach
                </span>
              )}
            </span>
            <span className="row-span-2 text-right font-mono text-[11px] text-[var(--m-text-secondary)]">
              {usd(band.liquidityUSD)}
            </span>
            {/* Both currencies, always. A band accrues feeGrowthBase AND
                feeGrowthQuote, so a single "fees earned" figure is wrong. */}
            <span className="col-start-2 font-mono text-[11px] text-[var(--m-text-secondary)]">
              {band.open
                ? `earned ${band.feesBase} ${baseSym} · ${band.feesQuote} ${quoteSym}` +
                  (share === null ? " · no fills yet" : ` · ${(share * 100).toFixed(0)}% of pool fees`)
                : `${lo.toFixed(0)}–${hi.toFixed(0)} ${quoteSym}`}
            </span>
            {/* Reach, not depth. This band's liquidity is only offered to takers whose
                slippage tolerance covers the jump into it — the price step plus the
                fee step. Under that, they revert rather than fill here, so the flow
                never arrives however deep the band is. */}
            {band.open && !reachable && (
              /* Not a warning about returns — a statement that the pool will REFUSE
                 this deposit. BandPool reverts BandBeyondSpread, so offering the band
                 as selectable would be offering a transaction that cannot land. */
              <span className="col-start-2 font-mono text-[11px] text-[var(--m-text-secondary)]">
                reaches past this pair&apos;s ±{(set.spreadReach * 100).toFixed(2)}% spread · takes no liquidity
              </span>
            )}
            {/* Only when it CHANGES something. This used to render on every band
                past the first as "needs 0.30% taker slippage to catch overflow" —
                jargon describing the mechanism, on rows where the answer was
                "yes, fine", which is noise dressed as a warning.

                An LP's question is whether the band fills. It only stops filling
                when the step past the previous band exceeds what a normal taker
                tolerates, so that is the only case worth a line, and it leads
                with the consequence rather than the mechanism. */}
            {usable && outOfReach && (
              <span
                className="col-start-2 font-mono text-[11px] text-[var(--m-warning,#b4690e)]"
                title={
                  `A taker filling in ±${(bands[band.index - 1]!.tolerance * 100).toFixed(2)}% who gets pushed ` +
                  `into this band pays ${stepBps.toFixed(1)} bps more, all at once — bands step, they do not drift. ` +
                  `Below that tolerance their swap reverts instead of filling here.`
                }
              >
                ⚠ rarely fills · takers need {(stepBps / 100).toFixed(2)}% slippage to reach it, over the{" "}
                {DEFAULT_SLIPPAGE_BPS / 100}% default
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
