"use client";

import { useMemo } from "react";
import {
  buildDepthModel,
  crossesMarket,
  fitWindow,
  priceToX,
  queueAhead,
  stepAreaPath,
  stopBand,
  type BookLevel,
  type DepthUnit,
  type PoolRange,
} from "@/lib/swap/depth";

/**
 * Depth for the swap card: the order book and the pool, on one price axis, with
 * the user's own order drawn on it.
 *
 * ## Colour is the SIDE; pattern is the VENUE
 *
 * Bid and ask keep the app's semantic green/red, and pool liquidity is drawn in
 * the same side colour with a hatch rather than a third hue. That is the one real
 * design decision here: pool depth is not a third kind of thing, it is the same
 * bid or ask depth sourced from `Pool.sol` instead of the book. Giving it its own
 * colour would read as a third asset class and break the only question the chart
 * answers — how much is available at each price. The accent is reserved for the
 * user's own order, the single element on the chart that belongs to them.
 *
 * ## It renders nothing rather than an empty frame
 *
 * `buildDepthModel` returns null when there is no book AND no pool. An empty
 * chart would claim we looked and found a flat market, which is a much stronger
 * statement than having no data — the same distinction every status-bar chip
 * makes by degrading to an em-dash instead of a zero.
 */

const PLOT_W = 560;
const PLOT_H = 120;
const X0 = 24;
const Y0 = 150;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 6 : 2,
  });
}

export interface SwapDepthChartProps {
  pairSymbol: string;
  bids: BookLevel[];
  asks: BookLevel[];
  ranges: PoolRange[];
  mid: number;
  /** The limit price the user typed. Undefined or 0 renders no marker. */
  limitPrice?: number;
  /** Stop-limit trigger. Present only in stop mode. */
  triggerPrice?: number;
  /** Which way the user's order goes — buying the base is a bid. */
  side: "bid" | "ask";
  /** Sizes are counted in this token; the footer says so. */
  unit: DepthUnit;
  unitSymbol: string;
  /** Depth is still being fetched — renders a skeleton rather than "no depth". */
  loading?: boolean;
  /**
   * Fraction either side of mid to show. Omit to fit the data.
   *
   * NOT the gateway's `window`, which is the FETCH radius for LP ranges (±50%,
   * wide on purpose so distant positions are not missed). Reusing it here draws
   * a tight book as a single spike in the middle of an empty plot.
   */
  window?: number;
}

export function SwapDepthChart({
  pairSymbol,
  bids,
  asks,
  ranges,
  mid,
  limitPrice,
  triggerPrice,
  side,
  unit,
  unitSymbol,
  loading = false,
  window,
}: SwapDepthChartProps) {
  const model = useMemo(() => {
    const w =
      window ??
      fitWindow({ bids, asks, mid, marks: [limitPrice ?? 0, triggerPrice ?? 0] });
    return buildDepthModel({ bids, asks, ranges, mid, window: w, unit, unitSymbol });
  }, [bids, asks, ranges, mid, window, unit, unitSymbol, limitPrice, triggerPrice]);

  /**
   * No model means no book AND no pool at this price — which on a young venue is
   * the ordinary case, not an error.
   *
   * It used to return null here, and that was wrong in a way the screenshot made
   * obvious: a user types a price, expects the chart they were promised, and gets
   * an unexplained gap. Absent data and an absent FEATURE look identical when
   * both render nothing. So the frame stays and says which — while staying silent
   * about it during the fetch, because "no depth" is a claim and we do not have
   * the answer yet.
   */
  if (!model) {
    return (
      <div className="rounded-md border border-[color:var(--m-border)] bg-[color:var(--m-surface)]">
        <div className="flex items-center gap-3 border-b border-[color:var(--m-border)] px-3 py-2">
          <span className="font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-primary)] uppercase">
            Depth · {pairSymbol}
          </span>
        </div>
        {loading ? (
          <div className="m-3 h-[92px] animate-pulse rounded bg-[color:var(--m-surface-2)]" aria-busy="true" />
        ) : (
          <div className="px-3 py-6 text-center text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
            No resting orders or pool liquidity indexed for this market yet.
            <br />
            Your order would be the first at this price.
          </div>
        )}
      </div>
    );
  }

  const x = (p: number) => priceToX(p, model, PLOT_W, X0);
  const areaOpts = { model, plotW: PLOT_W, plotH: PLOT_H, x0: X0, y0: Y0 } as const;

  // Total first, book on top: the pool region is what shows through beneath the
  // solid book fill, which is why it reads as "and also this much, from the pool"
  // rather than as a separate series.
  const bidTotal = stepAreaPath(model.bids, { ...areaOpts, layer: "total" });
  const askTotal = stepAreaPath(model.asks, { ...areaOpts, layer: "total" });
  const bidBook = stepAreaPath(model.bids, { ...areaOpts, layer: "book" });
  const askBook = stepAreaPath(model.asks, { ...areaOpts, layer: "book" });

  const hasLimit = typeof limitPrice === "number" && limitPrice > 0;
  const band = triggerPrice && hasLimit ? stopBand(triggerPrice, limitPrice, side) : null;
  const crosses = hasLimit ? crossesMarket(model, limitPrice, side) : false;
  const ahead = hasLimit ? queueAhead(model, limitPrice, side) : 0;

  const midX = x(model.mid);
  const orderX = hasLimit ? x(limitPrice) : null;
  const trigX = triggerPrice ? x(triggerPrice) : null;

  const caption = band
    ? band.valid
      ? `${band.verb} ${fmtPrice(band.to)} — arms at ${fmtPrice(triggerPrice!)}`
      : `Limit is the wrong side of the trigger — this order can arm but never fill`
    : hasLimit
      ? crosses
        ? `Crosses now at ${fmtPrice(limitPrice)} — fills immediately`
        : `Rests at ${fmtPrice(limitPrice)} — fills as market crosses · ${fmt(ahead)} ${unitSymbol} ahead of you`
      : "";

  return (
    <div className="rounded-md border border-[color:var(--m-border)] bg-[color:var(--m-surface)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--m-border)] px-3 py-2">
        <span className="font-dm-mono text-[10px] tracking-[0.1em] text-[color:var(--m-text-primary)] uppercase">
          Depth · {pairSymbol}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          <Key color="var(--m-success)" label="Bid" />
          <Key color="var(--m-error)" label="Ask" />
          <Key color="var(--m-text-secondary)" label="Pool" hatch />
          {/* The unit is part of the chart, not a footnote: depth in base and
              depth in quote are different numbers. */}
          <span className="font-dm-mono text-[10px] tracking-[0.06em] text-[color:var(--m-text-secondary)] uppercase">
            {unitSymbol}
          </span>
        </span>
      </div>

      <div className="px-1 py-2">
        <svg viewBox="0 0 608 186" className="block h-auto w-full" role="img"
             aria-label={`Depth for ${pairSymbol}. ${caption || "Bid and ask liquidity around the mid price."}`}>
          <defs>
            <pattern id="swapPoolBid" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--m-success)" strokeWidth="2" opacity="0.4" />
            </pattern>
            <pattern id="swapPoolAsk" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--m-error)" strokeWidth="2" opacity="0.4" />
            </pattern>
          </defs>

          {/* Stop band first, behind everything: it is context for the markers,
              not a value to read off the y-axis. */}
          {band && trigX !== null && orderX !== null && (
            <rect
              x={Math.min(trigX, orderX)}
              y={Y0 - PLOT_H}
              width={Math.abs(orderX - trigX)}
              height={PLOT_H}
              fill={band.valid ? "var(--m-primary)" : "var(--m-warning)"}
              opacity="0.10"
            />
          )}

          {bidTotal && <path d={bidTotal} fill="url(#swapPoolBid)" />}
          {askTotal && <path d={askTotal} fill="url(#swapPoolAsk)" />}
          {bidBook && <path d={bidBook} fill="var(--m-success)" opacity="0.22" />}
          {askBook && <path d={askBook} fill="var(--m-error)" opacity="0.22" />}
          {bidBook && <path d={bidBook} fill="none" stroke="var(--m-success)" strokeWidth="1.5" />}
          {askBook && <path d={askBook} fill="none" stroke="var(--m-error)" strokeWidth="1.5" />}

          <line x1={X0} y1={Y0} x2={X0 + PLOT_W} y2={Y0} stroke="var(--m-border)" />
          <line x1={midX} y1={Y0 - PLOT_H - 8} x2={midX} y2={Y0} stroke="var(--m-text-secondary)"
                strokeWidth="1" strokeDasharray="2 3" />

          {/* Trigger, in stop mode. Dashed, because it is a condition rather than
              a resting price — nothing sits at it. */}
          {trigX !== null && (
            <>
              <line x1={trigX} y1={Y0 - PLOT_H - 8} x2={trigX} y2={Y0}
                    stroke="var(--m-warning)" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x={trigX} y={Y0 - PLOT_H - 13} textAnchor="middle"
                    className="font-dm-mono" fontSize="9" fill="var(--m-warning)">
                TRIGGER
              </text>
            </>
          )}

          {/* The user's own order. Solid and in the accent — the one thing here
              that is theirs. */}
          {orderX !== null && (
            <>
              <line x1={orderX} y1={Y0 - PLOT_H - 8} x2={orderX} y2={Y0}
                    stroke="var(--m-primary)" strokeWidth="1.5" />
              <rect x={orderX - 34} y={Y0 - PLOT_H - 24} width="68" height="15" rx="2" fill="var(--m-primary)" />
              <text x={orderX} y={Y0 - PLOT_H - 13} textAnchor="middle"
                    className="font-dm-mono" fontSize="9" fill="var(--m-surface)">
                {band ? "LIMIT" : "YOUR ORDER"}
              </text>
            </>
          )}

          <text x={X0} y={Y0 + 14} className="font-dm-mono" fontSize="9" fill="var(--m-text-secondary)">
            {fmtPrice(model.lo)}
          </text>
          <text x={midX} y={Y0 + 14} textAnchor="middle" className="font-dm-mono" fontSize="9"
                fill="var(--m-text-secondary)">
            {fmtPrice(model.mid)}
          </text>
          <text x={X0 + PLOT_W} y={Y0 + 14} textAnchor="end" className="font-dm-mono" fontSize="9"
                fill="var(--m-text-secondary)">
            {fmtPrice(model.hi)}
          </text>
        </svg>
      </div>

      {caption && (
        <div
          className={`border-t border-[color:var(--m-border)] px-3 py-2 font-dm-mono text-[10px] tracking-[0.05em] uppercase ${
            band && !band.valid
              ? "text-[color:var(--m-warning)]"
              : "text-[color:var(--m-text-secondary)]"
          }`}
        >
          {caption}
        </div>
      )}
    </div>
  );
}

function Key({ color, label, hatch }: { color: string; label: string; hatch?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-dm-mono text-[10px] tracking-[0.06em] text-[color:var(--m-text-secondary)] uppercase">
      <span
        aria-hidden
        className="inline-block h-[10px] w-[10px] rounded-[2px] border border-[color:var(--m-border)]"
        style={
          hatch
            ? { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)` }
            : { backgroundColor: color, opacity: 0.55 }
        }
      />
      {label}
    </span>
  );
}
