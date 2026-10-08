"use client";

/**
 * Step 1 — the pair, and how it will be funded.
 *
 * Split out of `LiquidityFlow`, which held all four steps in one 1,180-line
 * file. The steps were already independent screens with their own headings and
 * their own Continue button; what they shared was a parent holding every piece
 * of state, which is still where it lives. Each step takes what it renders and
 * reports what the user did, exactly as `components/Launch/*` already does.
 *
 * Two things on this screen are here rather than later, and both were moved
 * deliberately:
 *
 *   "Deposit with" — whether one token or two are going in changes what a range
 *   choice MEANS, since a single-sided deposit sits entirely off the current
 *   rate. It is on the pair step and not the fee step because `provide` mode
 *   never renders a fee step at all, so hosting it there would hide it from the
 *   flow most people use.
 *
 *   "Which token you bring" — choosing "One token" used to name no token. The
 *   side was changeable, but only on the NEXT step, behind a swap affordance
 *   inside the amount field, so the step that asks "one or both?" left "which
 *   one?" unanswered and the default silently decided it. The side IS the
 *   directional call: bringing base converts to quote as price rises through
 *   the band, bringing quote converts to base as it falls.
 */

import type { DepositMode } from "../BandDeposit";
import { DepositModeToggle } from "../BandDeposit";
import { cn } from "@/lib/utils";
// One compact-USD formatter across the app; a second would drift from the
// figures the Creator tab and the Pool overview print for the same numbers.
import { usdCompact } from "@/lib/portfolio/creator";
import type { UnlistedMatch } from "@/lib/liquidity/unlisted";
import { formatRate } from "@/lib/liquidity/rate";
import { TokenSelect } from "./parts";
import { canLaunch, type MarketState } from "@/lib/liquidity/marketExists";

export function PairStep({
  launch,
  base,
  quote,
  baseLogoURI,
  quoteLogoURI,
  chainName,
  /** Set only when the selected pair really is a pre-graduation market. */
  unlisted,
  /** The launch starting price, as typed. Empty is a real state, not an error. */
  initStr,
  onInitChange,
  /** Parsed starting price, which is what gates Continue in launch mode. */
  startPrice,
  /** The indexed rate, 0 until the pair query resolves. */
  rate,
  depositMode,
  onDepositMode,
  oneIsBase,
  onOneIsBase,
  onPick,
  onSwap,
  onContinue,
  /** Whether this pair already has a book and a pool. See lib/liquidity/marketExists. */
  market,
  /** Switch to "Provide liquidity", keeping the pair already chosen. */
  onProvideInstead,
}: {
  launch: boolean;
  base: string;
  quote: string;
  baseLogoURI?: string;
  quoteLogoURI?: string;
  chainName: string;
  unlisted: UnlistedMatch | null;
  initStr: string;
  onInitChange: (value: string) => void;
  startPrice: number;
  rate: number;
  depositMode: DepositMode;
  onDepositMode: (mode: DepositMode) => void;
  oneIsBase: boolean;
  onOneIsBase: (isBase: boolean) => void;
  onPick: (which: "base" | "quote") => void;
  onSwap: () => void;
  onContinue: () => void;
  market: MarketState;
  onProvideInstead: () => void;
}) {
  return (
        <div className="mx-auto max-w-[520px] rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-sm">
          <div className="flex items-stretch gap-2.5">
            <TokenSelect testId="liq-pick-base" role="Base" sym={base} logoURI={baseLogoURI} chainName={chainName} onClick={() => onPick("base")} />
            <button
              type="button"
              aria-label="Swap order"
              onClick={onSwap}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center self-center rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface)] text-[15px] text-[var(--m-primary-fg)]"
            >
              ⇅
            </button>
            <TokenSelect testId="liq-pick-quote" role="Quote" sym={quote} logoURI={quoteLogoURI} chainName={chainName} onClick={() => onPick("quote")} />
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
                  quote liquidity it needs to list across Rate. Your {quote} deposit counts
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
            </div>
          )}

          {/* ONLY where it can be used. `addPair` is skipped for a pair that
              already exists, so on a live market this field collected a number
              and ConfirmFlow threw it away without a word. */}
          {launch && market.kind === "none" && (
            <>
              <div className="mb-[7px] mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
                Starting price
              </div>
              <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-2.5">
                <input
                  data-testid="liq-start-price"
                  value={initStr}
                  placeholder={`${quote} per ${base}`}
                  inputMode="decimal"
                  onChange={(e) => onInitChange(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[19px] font-semibold tabular-nums text-[var(--m-text-primary)] outline-none"
                />
                <span className="font-mono text-xs text-[var(--m-text-secondary-2)]">{quote} per {base}</span>
              </div>
            </>
          )}

          {/*
            AN ANSWER, NOT A CLAIM.
            This row read `launch ? "This pair has no pool" : "Current rate"` — a
            constant. On a live market it therefore announced that the pair had
            no pool, next to a price field whose value would be discarded.
            `market` is the read; see lib/liquidity/marketExists for the states.
          */}
          <div
            data-testid="liq-market-state"
            data-state={launch ? market.kind : "rate"}
            className={cn(
              "mt-3.5 flex items-center justify-between gap-3 rounded-[11px] border px-3.5 py-3 text-[13px]",
              !launch || market.kind === "checking"
                ? "border-[var(--m-border)] bg-[var(--m-surface-2)]"
                : market.kind === "none"
                  ? "border-[color-mix(in_srgb,var(--m-accent)_34%,transparent)] bg-[color-mix(in_srgb,var(--m-accent)_10%,transparent)]"
                  : market.kind === "exists"
                    ? "border-[color-mix(in_srgb,var(--m-success)_34%,transparent)] bg-[color-mix(in_srgb,var(--m-success)_10%,transparent)]"
                    : "border-[var(--m-error)] bg-[color-mix(in_srgb,var(--m-error)_10%,transparent)]",
            )}
          >
            <span className="text-[var(--m-text-secondary)]">
              {!launch
                ? "Current rate"
                : market.kind === "checking"
                  ? "Checking this pair…"
                  : market.kind === "none"
                    ? "New market"
                    : market.kind === "exists"
                      ? `${base}/${quote} already trades`
                      : "No pool is possible here"}
            </span>
            <span data-testid="liq-pair-rate" className="font-mono font-semibold tabular-nums">
              {!launch
                ? rate > 0
                  ? `1 ${base} = ${formatRate(rate)} ${quote}`
                  : "—"
                : market.kind === "checking"
                  ? "—"
                  : market.kind === "none"
                    ? "You set the price →"
                    : market.kind === "exists"
                      ? rate > 0
                        ? `1 ${base} = ${formatRate(rate)} ${quote}`
                        : "live"
                      : /* Not "ETH leg": the read knows a pool is absent, not WHY,
                           and the wrapped leg is only the reason it is absent
                           today. Naming a cause the code did not establish is how
                           a label comes to be confidently wrong. */
                        "book only"}
            </span>
          </div>

          {/* The dead end, said once and plainly. `addPair` opens no pool for a
              wrapped-native leg and `createPool` is engine-gated, so this can
              never be added later — retrying or changing the tier will not help. */}
          {launch && market.kind === "bookOnly" && (
            <p className="mt-2 text-[12px] leading-snug text-[var(--m-text-secondary)]">
              This pair trades on the order book, but a band pool cannot be opened for
              it: settlement unwraps the native leg, which the pool&apos;s accounting
              cannot see. That will not change by retrying.
            </p>
          )}

          {/* HOW the position is funded, asked before the range rather than
              beside it. Whether one token or two are going in changes what a
              range choice means — a single-sided deposit sits entirely off the
              current rate — so it belongs upstream of that decision.

              On the PAIR step, not the fee step: `provide` mode goes straight
              from pair to range and never renders a fee step at all, so hosting
              it there would hide it from the flow most people use. */}
          <div className="mt-3 rounded-[11px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3">
            <div className="mb-2 text-[13px] text-[var(--m-text-primary)]">Deposit with</div>
            <DepositModeToggle mode={depositMode} onMode={onDepositMode} />

            {/*
              * WHICH token, asked where the question is raised.
              *
              * Choosing "One token" named no token. The side was changeable, but
              * only on the NEXT step, behind a swap affordance inside the amount
              * field — so the step that asks "one or both?" left "which one?"
              * unanswered and unanswerable, and the default silently decided it.
              *
              * It matters more here than it looks: the side IS the directional
              * call. Bringing base converts to quote as price rises through the
              * band; bringing quote converts to base as it falls. Picking it by
              * accident picks a direction by accident.
              *
              * Still changeable on the range step — this is the same state, not a
              * second copy of it.
              */}
            {depositMode === "one" && (
              <div className="mt-2.5">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)]">
                  Which token you bring
                </span>
                <div className="flex gap-1 rounded-full bg-[var(--m-surface)] p-[3px]">
                  {[
                    { isBase: true, label: base },
                    { isBase: false, label: quote },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={oneIsBase === option.isBase}
                      onClick={() => onOneIsBase(option.isBase)}
                      className={cn(
                        "flex-1 rounded-full px-2 py-1.5 text-[13px] transition-colors",
                        oneIsBase === option.isBase
                          ? "bg-[var(--m-primary)] font-semibold text-[var(--m-on-primary)]"
                          : "text-[var(--m-text-secondary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--m-text-secondary-2)]">
              {depositMode === "both"
                ? "Both sides go in at the band's ratio. Anything over that ratio is refunded, not kept."
                : `You bring ${oneIsBase ? base : quote}. It converts to ${oneIsBase ? quote : base} as the price crosses your range.`}
            </p>
          </div>

          <button
            type="button"
            data-testid="liq-pair-continue"
            onClick={onContinue}
            /* Every later step is drawn around the anchor — the chart axis, the
               band bounds, the deposit split. Leaving here without a positive
               price is what made a fabricated default necessary in the first
               place. */
            /* In launch mode the read gates it too: `checking` has not earned a
               launch, and `exists`/`bookOnly` cannot have one. */
            disabled={launch && (!canLaunch(market) || !(startPrice > 0))}
            className="mt-3 w-full rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue
          </button>

          {/*
            THE WAY OUT, and it is the point of the whole check.
            Launching is impossible here and what the person wants is one click
            away with the pair they already chose. Offered rather than taken: the
            mode is NOT switched automatically, because a tab that changes itself
            under a click reads as a bug even when it guesses right.
          */}
          {launch && market.kind === "exists" && (
            <button
              type="button"
              data-testid="liq-provide-instead"
              onClick={onProvideInstead}
              className="mt-2 w-full rounded-[13px] border border-[var(--m-primary)] py-3 text-[14px] font-semibold text-[var(--m-primary-fg)]"
            >
              Provide liquidity instead
            </button>
          )}
        </div>
  );
}
