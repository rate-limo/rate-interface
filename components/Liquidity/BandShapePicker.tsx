"use client";

import { cn } from "@/lib/utils";
import { shapeWeights, type BandSet, type BandShape } from "@/lib/liquidity/bands";
import { autoWeights, type PairStats } from "@/lib/liquidity/auto";
import { formatDepositUnits, type DepositShape, type ResolvedShape } from "@/lib/liquidity/shape";

// `DepositShape` used to be declared here, which made every non-rendering caller --
// LiquidityFlow, and the review screen behind it -- import a type from a component in
// order to talk about a deposit. It lives in lib/liquidity/shape.ts now, beside the
// function that resolves it. Re-exported so existing imports keep working.
export type { DepositShape };

const PRESETS: { key: BandShape; name: string; blurb: string }[] = [
  { key: "spot", name: "Spot", blurb: "Even across every band" },
  { key: "curve", name: "Curve", blurb: "Most in the tightest" },
  { key: "wide", name: "Wide", blurb: "Most in the outer" },
];

const pct = (n: number) => `±${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`;

/**
 * How a deposit is spread across the bands it is joining.
 *
 * Two halves of one control. The preset cards choose a rule; the rows beneath
 * are sliders that override it band by band, and both write the same state
 * `BandChart`'s drag writes. Dragging a slider to 0% leaves that band out
 * entirely, so the checkbox that used to say in-or-out is not a separate
 * control any more — one gesture answers both "which bands" and "how much in
 * each", which was always one question.
 *
 * The step only exists when there is something to distribute. At a pair's stock
 * 0.10% spread only the tightest band can take liquidity at all, every preset
 * produces a byte-identical deposit, and this renders nothing — offering three
 * buttons that do one thing teaches people the control does not matter.
 *
 * `auto` is the odd one and is deliberately not a `BandShape`. The others are fixed
 * weight vectors; auto is a measurement of the pair, so it can be UNAVAILABLE — a
 * pair with no recent trades has nothing to measure, and the card says why rather
 * than falling back to a default that would look like a measurement.
 *
 * Refused bands never appear here and never receive weight. That is not tidiness:
 * `addLiquidityAcross` rejects a band by INDEX before it reads the amount, so a zero
 * for an out-of-reach band does not deposit less — it reverts the whole batch.
 */
export function BandShapePicker({
  set,
  selected,
  resolved,
  onShape,
  onAllocate,
  stats,
  symbol,
  decimals = 4,
  showAuto = true,
}: {
  set: BandSet;
  /** Bands the LP picked; refused ones are filtered out by the resolver, not here. */
  selected: number[];
  /**
   * The allocation, already resolved. This component USED to compute its own from
   * `total` + `shape`, which is why the bars and the review screen were two answers
   * to one question — see lib/liquidity/shape.ts. It renders; it does not allocate.
   */
  resolved: ResolvedShape;
  onShape: (s: DepositShape) => void;
  /**
   * Set one band's share of the deposit, 0–1, by its position in
   * `resolved.bands`.
   *
   * These rows are the KEYBOARD half of `BandChart`'s drag, not a second
   * control: both write the same value through the same handler, and a canvas
   * cannot be operated without a pointer. Required rather than optional so a
   * new call site cannot quietly mount the picker with the sliders inert.
   */
  onAllocate: (position: number, share: number) => void;
  /** Absent while candles are still loading — Auto shows disabled, not wrong. */
  stats?: PairStats;
  symbol: string;
  decimals?: number;
  /**
   * Render the Auto card at all.
   *
   * False when LAUNCHING. Auto reads a pair's own trading — volatility from its
   * candles, mean trade size from its day buckets — and a pair being launched has
   * never traded, so `pairStats` is undefined by construction and Auto can NEVER
   * become ready on that screen. A permanently disabled control is a promise the
   * surface cannot keep; the three fixed shapes are the real choice there.
   *
   * Stays true for deposits into an existing pair, where "Measuring…" is a
   * genuine wait rather than a permanent state.
   */
  showAuto?: boolean;
}) {
  const { active, autoReady, verdict, bands, weights, amounts } = resolved;
  // One band is not a distribution. The whole step goes away rather than sitting
  // there inert, so the flow reads Amount -> Confirm instead of keeping a dead rung.
  if (bands.length < 2) return null;

  const show = (v: bigint) => formatDepositUnits(v, decimals);
  /*
   * Bars are a SHARE OF THE DEPOSIT, scaled against the total rather than
   * against the largest band.
   *
   * Max-scaling made the biggest band a full bar whatever it held, so 50/30/20
   * and 90/6/4 drew the same leading row — the one comparison the picture exists
   * to make, discarded at the last step. Against the total, a full bar means all
   * of it, which is the only reading that is true at every split.
   *
   * The percentage rides beside it because the number was nowhere on screen: the
   * row printed an amount and left the LP to divide by their own deposit to
   * recover the ratio the preset had just chosen for them.
   */
  /*
   * The split comes from the WEIGHTS, not from the amounts.
   *
   * Amounts are the weights times the deposit, so they are all zero until the
   * LP has typed one — and the sliders, which read this, therefore all sat at
   * 0% while the chart beside them drew 50/33/17 from the same `ResolvedShape`.
   * Two controls over one value, disagreeing, on the screen where the value is
   * chosen. A split exists as soon as a preset does; the amount only decides
   * what it is worth.
   *
   * `allocateShaped` returns zeros for a zero total by design, so this cannot
   * be fixed downstream of it — the ratio has to be read from the input that
   * still carries it.
   */
  const totalWeight = weights.reduce((a, w) => a + Math.max(0, w), 0);
  const sharePct = (i: number) =>
    totalWeight > 0 ? (Math.max(0, weights[i] ?? 0) / totalWeight) * 100 : 0;

  return (
    /*
     * The section carries its own top rule and spacing. It sits directly under
     * `BandDeposit`, whose last child is the vesting notice -- a bordered, tinted
     * box -- and with no separation the preset cards read as a fifth row of that
     * notice rather than as a new question. It cannot live in the parent either:
     * this component returns null below two bands, which would leave a rule with
     * nothing under it.
     */
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--m-border)] pt-4">
      <h4 className="text-[13px] font-semibold">Spread across bands</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <ShapeCard
            key={p.key}
            name={p.name}
            blurb={p.blurb}
            on={active === p.key}
            glyph={shapeWeights(p.key, bands.length)}
            onClick={() => onShape(p.key)}
          />
        ))}
        {showAuto && (
          <ShapeCard
            name="Auto"
            blurb={autoReady ? "From this pair's own trading" : (verdict?.reason ?? "Measuring…")}
            on={active === "auto"}
            disabled={!autoReady}
            glyph={stats && autoReady ? autoWeights(set, selected, stats) : shapeWeights("spot", bands.length)}
            onClick={() => autoReady && onShape("auto")}
          />
        )}
      </div>

      {showAuto && active === "auto" && verdict?.summary ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{verdict.summary}</p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {bands.map((index, i) => (
          <div
            key={index}
            className="grid grid-cols-[58px_1fr_38px_auto] items-center gap-2.5 text-xs"
          >
            <span className="font-mono font-semibold">{pct(set.bands[index]!.tolerance)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(sharePct(i))}
              onChange={(event) => onAllocate(i, Number(event.target.value) / 100)}
              aria-label={`Share of the deposit in the ${pct(set.bands[index]!.tolerance)} band`}
              className="h-2 w-full cursor-ew-resize accent-[var(--m-primary)]"
            />
            <span className="text-right font-mono tabular-nums">
              {Math.round(sharePct(i))}%
            </span>
            {/* An em-dash until an amount exists. The split is real as soon as a
                preset is picked, but the money in each band is not -- and a column
                of "0.0000 TITER" reads as a broken allocation rather than an
                empty form. Same rule the status-bar chips follow. */}
            <span className="whitespace-nowrap text-right font-mono tabular-nums text-[var(--m-text-secondary)]">
              {amounts[i]! > BigInt(0) ? `${show(amounts[i]!)} ${symbol}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The glyph is drawn from the weights the card APPLIES, at this pair's band count. */
function ShapeCard({
  name,
  blurb,
  glyph,
  on,
  disabled,
  onClick,
}: {
  name: string;
  blurb: string;
  glyph: number[];
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const max = Math.max(...glyph, Number.MIN_VALUE);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={blurb}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
        on ? "border-primary bg-background" : "border-border bg-muted/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex h-[18px] items-end gap-[3px]" aria-hidden="true">
        {glyph.map((w, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-t-sm", on ? "bg-primary" : "bg-border")}
            style={{ height: `${30 + 70 * (w / max)}%` }}
          />
        ))}
      </span>
      <span className={cn("text-[11.5px] font-semibold leading-tight", on && "text-primary")}>{name}</span>
      {/* One line, clipped. Three of these sat two lines deep and 93px tall in a
          rail that had no room; the glyph above already says what the shape is,
          and the full sentence stays reachable as the button's title. */}
      <span className="truncate text-[10px] leading-tight text-muted-foreground">{blurb}</span>
    </button>
  );
}
