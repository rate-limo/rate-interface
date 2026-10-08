"use client";

/**
 * Step 3 — which bands, how much, and how it is spread across them.
 *
 * THE CONTROLS GET THE WIDTH, not the chart. This grid was `1fr_340px`: the
 * chart took everything and every control — the band picker, both amount
 * fields, the ratio and refund rows — was squeezed into a fixed 340px rail. On
 * a 2000px window that is 17% of the screen for the entire form, so badges
 * wrapped onto three lines and the rail scrolled past the bottom of the chart
 * beside it. The split was backwards on its own terms: the chart is `readOnly`
 * and its own prop doc says so, because a band position has no range to drag,
 * so the largest thing on the screen collected no input at all.
 *
 * The band picker leads the left column for the same reason. Bands are ±0.02%
 * to ±0.5%, which on an axis spanning 0.987–1.04 is a hairline — the chart was
 * at its least informative exactly where the decision is made. Each picker row
 * now draws its own band at TOLERANCE scale, where ±0.02% against ±0.5% reads
 * as the 25× difference it is. That was `BandRings`, a SECOND picker in the
 * other column over the same state; it is folded in rather than kept beside.
 *
 * Nothing here greys an input by side any more: a banded deposit is two-sided
 * by construction, or converted into one.
 */

import { formatPct } from "@/lib/pair/derive";
import { BackButton } from "../BackButton";
import { BandChart } from "../BandChart";
import { BandDeposit, VestingNotice, type DepositMode } from "../BandDeposit";
import { BandShapePicker } from "../BandShapePicker";
import type { BandSet } from "@/lib/liquidity/bands";
import type { DepositShape, ResolvedShape } from "@/lib/liquidity/shape";
import type { PairStats } from "@/lib/liquidity/auto";
import type { BalanceVerdict } from "@/lib/liquidity/balance";
import type { ChartPeriod } from "@/lib/liquidity/types";
import type { useDepositApr } from "@/hooks/useDepositApr";
import type { PairCandle } from "@/hooks/usePairCandles";
import { formatRate } from "@/lib/liquidity/rate";
import { AprHeadline, DEPOSIT_DECIMALS } from "./parts";

export function RangeStep({
  set,
  anchor,
  selected,
  onAllocate,
  askMode = false,
  base,
  quote,
  launch,
  /** True when the tightest selected band holds nothing yet. */
  bandIsEmpty,
  period,
  onPeriod,
  candles,
  candlesLoading,
  depositMode,
  onDepositMode,
  amtBase,
  onAmtBase,
  amtQuote,
  onAmtQuote,
  amtOne,
  onAmtOne,
  oneIsBase,
  onOneIsBase,
  wall,
  onWall,
  maturitySec,
  /** The allocation, resolved by the parent so this and the receipt agree. */
  resolved,
  onShape,
  /** Undefined while the candles load — Auto renders disabled, not wrong. */
  stats,
  primarySymbol,
  depositApr,
  depositQuote,
  balanceOf,
  onMax,
  balanceVerdict,
  hasDepositAmount,
  onBack,
  onContinue,
}: {
  set: BandSet;
  anchor: number;
  selected: number[];
  /** A band's new share of the deposit, 0–1, by position in `resolved.bands`. */
  onAllocate: (position: number, share: number) => void;
  base: string;
  quote: string;
  /**
   * True when no earlier step asked how the LP wants to deposit — i.e. the
   * `/pool/deposit` route, which opens on this step. The pair step owns the
   * question everywhere else.
   */
  askMode?: boolean;
  launch: boolean;
  bandIsEmpty: boolean;
  period: ChartPeriod;
  onPeriod: (next: ChartPeriod) => void;
  candles: PairCandle[] | undefined;
  candlesLoading: boolean;
  depositMode: DepositMode;
  onDepositMode: (mode: DepositMode) => void;
  amtBase: string;
  onAmtBase: (value: string) => void;
  amtQuote: string;
  onAmtQuote: (value: string) => void;
  amtOne: string;
  onAmtOne: (value: string) => void;
  oneIsBase: boolean;
  onOneIsBase: (isBase: boolean) => void;
  /** One token, and whether it is converted on the way in. See lib/liquidity/wall. */
  wall: boolean;
  onWall: (next: boolean) => void;
  /** Seconds until fees fully vest. Undefined while the pool read is in flight. */
  maturitySec?: number;
  resolved: ResolvedShape;
  onShape: (shape: DepositShape) => void;
  stats?: PairStats;
  primarySymbol: string;
  depositApr: ReturnType<typeof useDepositApr>;
  /** The deposit valued in quote units — what the estimated return is paid in. */
  depositQuote: number;
  balanceOf: (symbol: string) => number | undefined;
  onMax: (symbol: string, side: "base" | "quote" | "one") => void;
  /** Whether the wallet covers this deposit. `unknown` never blocks. */
  balanceVerdict: BalanceVerdict;
  /** False while every amount field is empty — see LiquidityFlow. */
  hasDepositAmount: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
        /*
         * THE CONTROLS GET THE WIDTH, not the chart.
         *
         * This was `1fr_340px`: the chart took everything and every control —
         * the band picker, both amount fields, the ratio and refund rows —
         * was squeezed into a fixed 340px rail. On a 2000px window that is 17%
         * of the screen for the entire form, so badges wrapped onto three
         * lines and the rail scrolled past the bottom of the chart beside it.
         *
         * The split was backwards on its own terms. This chart is `readOnly`
         * and its own prop doc says so — it collects NO input, because a band
         * position has no range to drag. It is context for a choice made
         * entirely in the rail. Giving the reading surface the room and the
         * working surface the remainder is the same mistake the portfolio's
         * 322px assets sidebar made.
         *
         * Bands are also ±0.02–0.5%, which is a hairline on an axis spanning
         * 0.987–1.04 — so the chart is at its least informative exactly here,
         * and least deserving of the majority of the viewport.
         */
        <div className="grid items-start gap-[18px] [grid-template-columns:1fr] min-[860px]:[grid-template-columns:minmax(0,1fr)_minmax(360px,0.85fr)] min-[1400px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[18px] min-w-0">
            {/*
              * THE CHART IS THE CONTROL.
              *
              * `CLPriceChart` owned this column and was `readOnly` here — its
              * own prop doc says why: a band position has no range to drag, so
              * the largest element on the screen collected no input. It stays
              * where a range is still real, in `LaunchLiquidityStep`.
              *
              * `BandChart` takes the decision instead. History runs to the
              * centre; everything right of it is price space, where the deposit
              * is waiting, so each band's share is dragged out from the last
              * close on both sides at once.
              */}
            <BandChart
              set={set}
              anchor={anchor}
              bands={resolved.bands}
              weights={resolved.weights}
              onAllocate={onAllocate}
              bringing={depositMode === "both" ? "both" : oneIsBase ? "base" : "quote"}
              quoteSym={quote}
              candles={candles}
              candlesLoading={candlesLoading}
              period={period}
              onPeriod={onPeriod}
            />

            {maturitySec !== undefined && (
              <VestingNotice maturitySec={maturitySec} bandIndex={selected[0] ?? 0} />
            )}
          </div>

          <div className="rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-[18px] shadow-sm">
            <div className="mb-3 flex items-center gap-2.5">
              {/* The destination depends on the mode -- `onBack` is `setStep(launch ? "fee"
                  : "pair")` -- and a label that names the wrong screen is worse
                  than none for anyone navigating by control list. */}
              <BackButton onClick={onBack} label={launch ? "Back to the fee tier" : "Back to the pair"} />
              <h3 className="text-[15px] font-semibold">Deposit</h3>
            </div>

            {/* The yield leads. See the APY section of apps/web/CLAUDE.md for
                why it is never a row at the bottom and never removed. */}
            <AprHeadline
              apr={depositApr}
              depositQuote={depositQuote}
              quoteSym={quote}
            />

            <div className="mt-3.5" />

            <BandDeposit
              set={set}
              bandIndex={selected[0] ?? 0}
              selectedBands={selected}
              baseSym={base}
              quoteSym={quote}
              anchor={anchor}
              bandIsEmpty={bandIsEmpty}
              mode={depositMode}
              onMode={onDepositMode}
              /*
               * Shown here ONLY when nothing earlier asked.
               *
               * The question lives on the PAIR step, which `/pool/deposit`
               * skips — it opens straight on this one. So with `showMode`
               * hardcoded false the control existed on no screen that route
               * renders, and the deposit was locked to whatever the default
               * happened to be. That was survivable while the default was
               * "both" and merely hid one-token deposits; when the default
               * became "one" it took TWO-TOKEN deposits off that page
               * altogether, which is how `add-liquidity.spec.ts` started
               * failing at `liq-band-ratio`.
               */
              showMode={askMode}
              amtBase={amtBase}
              amtQuote={amtQuote}
              onAmtBase={onAmtBase}
              onAmtQuote={onAmtQuote}
              amtOne={amtOne}
              onAmtOne={onAmtOne}
              oneIsBase={oneIsBase}
              onOneIsBase={onOneIsBase}
              /* Only a one-token deposit has a conversion to choose about; passing
                 `onWall` is what makes the control render at all. */
              wall={wall}
              onWall={depositMode === "one" ? onWall : undefined}
              balanceOf={balanceOf}
              onMax={onMax}
              shortSymbol={balanceVerdict.state === "short" ? balanceVerdict.symbol : undefined}
            />

            {/*
              THE SPLIT LIVES WITH THE DEPOSIT.
              It was moved under the chart when the rail was 977px tall and the
              Review button sat 462px below the fold -- it was the tallest block
              and the chart draws the same decision. Shortening the mode copy from
              116 words to 24 bought that height back, and a deposit reads better
              as one card: amount, how it converts, how it spreads, confirm. The
              presets are compact for the same reason the mode rows are.
            */}
            {/*
              Renders nothing when fewer than two bands can take liquidity, which is
              the common case at a stock 0.10% spread -- there is no distribution to
              choose and the step removes itself rather than sitting inert.
            */}
            <BandShapePicker
              set={set}
              selected={selected}
              resolved={resolved}
              onShape={onShape}
              onAllocate={onAllocate}
              stats={stats}
              symbol={primarySymbol}
              decimals={DEPOSIT_DECIMALS}
              /* Hidden when launching: Auto reads the pair's own trading, and a
                 pair being launched has never traded, so it could only ever
                 render permanently disabled. See BandShapePicker's showAuto. */
              showAuto={!launch}
            />

            {/*
              A band re-anchors to the pair's TWAP on every swap, so it moves
              with the market and there is no out-of-range. This used to be a
              four-second SVG loop: a band rect and a price line drifting
              TOGETHER against an empty field, with nothing static to move
              against, so every frame looked identical and it read as a loading
              skeleton. The claim is true and worth making; the animation was
              not making it.
            */}
            <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--m-text-secondary-2)]">
              Your band is anchored to the pair&apos;s TWAP, so it moves with the market.
              There is no out-of-range.
            </p>



            {/*
              Blocked only on a KNOWN shortfall. `unknown` — a disconnected
              wallet, a read in flight, a token the list does not carry — leaves
              the button live: refusing a deposit because a balance has not
              arrived would be the same mistake as printing a zero for it.
            */}
            {balanceVerdict.state === "short" && (
              <p data-testid="liq-balance-short" className="mt-3 rounded-[11px] border border-[var(--m-error)] bg-[color:color-mix(in_srgb,var(--m-error)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--m-error-fg)]">
                You hold {formatRate(balanceVerdict.held)} {balanceVerdict.symbol} and this deposit
                spends {formatRate(balanceVerdict.needed)}. Lower the amount, or use Max.
              </p>
            )}

            {/*
              The button SAYS what is missing rather than sitting greyed out
              with no reason. An empty form is the first state every LP sees, so
              "Review" disabled there reads as a broken page; "Enter an amount"
              is the same control answering the question it just raised.
            */}
            {/*
              Pinned to the bottom of the card. After moving the band controls out
              it already fits at 900px, so this is insurance rather than the fix:
              at a shorter viewport, or once a split grows past three bands, the
              CTA stays reachable instead of sinking off screen again. Sticky
              INSIDE the card, never a bar floating over the page.
            */}
            <button
              type="button"
              data-testid="liq-review"
              disabled={!hasDepositAmount || balanceVerdict.state === "short"}
              onClick={onContinue}
              className="sticky bottom-3 mt-3 w-full rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-white shadow-lg hover:bg-[var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {!hasDepositAmount ? "Enter an amount" : "Review"}
            </button>
          </div>
        </div>
  );
}
