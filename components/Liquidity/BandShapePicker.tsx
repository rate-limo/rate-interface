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
  const { active, autoReady, verdict, bands, amounts } = resolved;
  // One band is not a distribution. The whole step goes away rather than sitting
  // there inert, so the flow reads Amount -> Confirm instead of keeping a dead rung.
  if (bands.length < 2) return null;

  const show = (v: bigint) => formatDepositUnits(v, decimals);
  const maxAmount = amounts.reduce((a, b) => (b > a ? b : a), BigInt(0));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
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
          <div key={index} className="grid grid-cols-[62px_1fr_auto] items-center gap-2.5 text-xs">
            <span className="font-mono font-semibold">{pct(set.bands[index]!.tolerance)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: maxAmount > BigInt(0)
                    ? `${(Number((amounts[i]! * BigInt(1000)) / maxAmount) / 10).toFixed(1)}%`
                    : "0%",
                }}
              />
            </span>
            <span className="whitespace-nowrap font-mono tabular-nums">
              {show(amounts[i]!)} {symbol}
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
        "flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors",
        on ? "border-primary bg-background" : "border-border bg-muted/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex h-6 items-end gap-[3px]" aria-hidden="true">
        {glyph.map((w, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-t-sm", on ? "bg-primary" : "bg-border")}
            style={{ height: `${30 + 70 * (w / max)}%` }}
          />
        ))}
      </span>
      <span className={cn("text-[11.5px] font-semibold leading-tight", on && "text-primary")}>{name}</span>
      <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2">{blurb}</span>
    </button>
  );
}
