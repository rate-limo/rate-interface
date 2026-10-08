"use client";

/**
 * Interactive v3-style concentrated-liquidity range chart. All geometry comes
 * from lib/liquidity/chart (bounds / priceToY / yToPrice / depthPath / genCandles);
 * this component is the thin React shell around it. Ported from the approved
 * liquidity artifact — candles + liquidity-depth overlay + two draggable handle
 * lines + ±% pills + current-rate line + zoom buttons + period tabs + presets.
 *
 * Everything is the pair RATE (quote-per-base), never a USD price.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import {
  bounds,
  liquidityDepthPath,
  priceToY,
  yToPrice,
  type Candle,
  type LiquidityLevel,
} from "@/lib/liquidity/chart";
import { liqToken } from "@/lib/liquidity/mock";
import type { ChartPeriod } from "@/lib/liquidity/types";

// viewBox is 520×340; the plot occupies the left 440 wide and the top 316 tall
// (the bottom 24 is the axis gutter). Feed CH (316) to the geometry; the
// client→SVG Y conversion uses the full VH (340).
const VW = 520;
const VH = 340;
const PLOT_W = 440;
const BOT = 24;
const CH = VH - BOT; // 316
const HIT = 10; // handle hit-zone in viewBox units

function fmt(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString();
  if (p >= 1) return p.toFixed(2);
  return p.toPrecision(3);
}

const PRESETS: { z: string; label: string }[] = [
  { z: "full", label: "Full range" },
  { z: "bid", label: "Full bid" },
  { z: "ask", label: "Full ask" },
  { z: "0.02", label: "±2%" },
  { z: "0.05", label: "±5%" },
  { z: "0.10", label: "±10%" },
  { z: "0.20", label: "±20%" },
];

const PERIODS: ChartPeriod[] = ["1D", "7D", "1M"];

export interface CLPriceChartProps {
  baseSym: string;
  quoteSym: string;
  baseLogoURI?: string;
  quoteLogoURI?: string;
  /** current pair rate (quote per base); the y-axis anchor */
  rate: number;
  low: number;
  high: number;
  isFullRange: boolean;
  zoom: number;
  period: ChartPeriod;
  /** Initial range preset for editable flows such as launch liquidity. */
  initialPreset?: string;
  /** launch mode: no history — a flat line at the starting price, no candles/depth */
  isLaunch?: boolean;
  /**
   * Tolerance bands to shade behind the candles, for a BandPool market.
   *
   * Drawn UNDER everything else and never in place of the candles: a band is where
   * liquidity may be taken, and the price history is still the thing being read.
   * Empty by default, so every non-banded caller is unchanged.
   */
  bandZones?: { tolerance: number; open: boolean; selected: boolean }[];
  /**
   * Reading mode: candles, depth overlay and the current-rate line, with no range at all.
   *
   * The pair profile shows the same chart as a place to LOOK at a market, so the two
   * draggable handles and the preset row have to go — a reading surface that invites a
   * drag it will not act on is worse than no control. Additive: the default is the
   * liquidity flow's existing behaviour, unchanged.
   */
  readOnly?: boolean;
  /** Live indexed OHLC data. */
  candleData?: Candle[];
  candlesLoading?: boolean;
  /** Live indexed bid/ask depth, expressed in quote liquidity at each price. */
  liquidityLevels?: LiquidityLevel[];
  liquidityLoading?: boolean;
  onRangeChange: (low: number, high: number, full: boolean) => void;
  onZoom: (zoom: number) => void;
  onPeriod: (period: ChartPeriod) => void;
}

type Zone = "high" | "low" | "range" | null;

export function CLPriceChart({
  baseSym,
  quoteSym,
  baseLogoURI,
  quoteLogoURI,
  rate,
  low,
  high,
  isFullRange,
  zoom,
  period,
  initialPreset = "0.05",
  isLaunch = false,
  readOnly = false,
  bandZones = [],
  candleData,
  candlesLoading = false,
  liquidityLevels = [],
  liquidityLoading = false,
  onRangeChange,
  onZoom,
  onPeriod,
}: CLPriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activePreset, setActivePreset] = useState<string | null>(initialPreset);
  const [cursor, setCursor] = useState<string>("crosshair");
  const [upperInput, setUpperInput] = useState(() => rangeInputValue(high));
  const [lowerInput, setLowerInput] = useState(() => rangeInputValue(low));
  const [displayZoom, setDisplayZoom] = useState(zoom);
  const displayZoomRef = useRef(zoom);
  const zoomAnimationRef = useRef<number | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => setUpperInput(rangeInputValue(high)), [high]);
  useEffect(() => setLowerInput(rangeInputValue(low)), [low]);

  // Keep the chart geometry in sync with the controlled zoom value while
  // easing between zoom states. This makes the range, grid, depth and candles
  // move together instead of snapping to the next scale.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      displayZoomRef.current = zoom;
      setDisplayZoom(zoom);
      return;
    }

    const from = displayZoomRef.current;
    const to = zoom;
    if (Math.abs(to - from) < 0.0001) {
      displayZoomRef.current = to;
      setDisplayZoom(to);
      return;
    }

    if (zoomAnimationRef.current !== null) cancelAnimationFrame(zoomAnimationRef.current);
    const startedAt = performance.now();
    const duration = 280;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      // ease-out cubic: responsive start, soft settle
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (to - from) * eased;
      displayZoomRef.current = next;
      setDisplayZoom(next);
      if (progress < 1) {
        zoomAnimationRef.current = requestAnimationFrame(tick);
      } else {
        zoomAnimationRef.current = null;
      }
    };

    zoomAnimationRef.current = requestAnimationFrame(tick);
    return () => {
      if (zoomAnimationRef.current !== null) cancelAnimationFrame(zoomAnimationRef.current);
      zoomAnimationRef.current = null;
    };
  }, [zoom]);

  // Latest props snapshot for the imperative pointer handlers, so the
  // document-level listeners (registered once) never read a stale closure.
  const latest = useRef({ rate, low, high, zoom: displayZoom, isFullRange, onRangeChange, onZoom });
  useLayoutEffect(() => {
    latest.current = { rate, low, high, zoom: displayZoom, isFullRange, onRangeChange, onZoom };
  });

  // Transient drag bookkeeping lives in refs — never in state — so it stays out
  // of the render path and out of the listener closures.
  const draggingRef = useRef<Zone>(null);
  const anchorDragRef = useRef<{ y: number; low: number; high: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  const b = bounds(rate, displayZoom);
  const candles = useMemo(() => (isLaunch ? [] : candleData ?? []), [candleData, isLaunch]);

  const clamp = (v: number) => Math.max(0, Math.min(CH, v));
  const yH = clamp(priceToY(high, b, CH));
  const yL = clamp(priceToY(low, b, CH));

  // ---- imperative pointer geometry (reads latest.current) ----
  const svgY = (clientY: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * VH;
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Read-only: no drag zones, no pinch, no cursor changes. Returning before any
    // listener is attached is deliberate — gating each handler individually would leave
    // the non-passive touchstart registered and still swallow page scroll.
    if (readOnly) return;

    const zoneAt = (y: number): Zone => {
      const s = latest.current;
      if (s.isFullRange) return null;
      const bb = bounds(s.rate, s.zoom);
      const h = priceToY(s.high, bb, CH);
      const l = priceToY(s.low, bb, CH);
      if (Math.abs(y - h) < HIT) return "high";
      if (Math.abs(y - l) < HIT) return "low";
      if (y > h + HIT && y < l - HIT) return "range";
      return null;
    };

    const down = (clientY: number): boolean => {
      const y = svgY(clientY);
      const z = zoneAt(y);
      if (!z) return false;
      draggingRef.current = z;
      if (z === "range") {
        const s = latest.current;
        anchorDragRef.current = { y, low: s.low, high: s.high };
      }
      return true;
    };

    const move = (clientY: number) => {
      const zone = draggingRef.current;
      if (!zone) return;
      const s = latest.current;
      const bb = bounds(s.rate, s.zoom);
      const y = svgY(clientY);
      if (zone === "range") {
        const a = anchorDragRef.current;
        if (!a) return;
        const dp = yToPrice(y, bb, CH) - yToPrice(a.y, bb, CH);
        const nl = a.low + dp;
        const nh = a.high + dp;
        if (nl > 0 && nh > 0) s.onRangeChange(nl, nh, false);
      } else if (zone === "high") {
        const p = yToPrice(y, bb, CH);
        if (p > s.low) s.onRangeChange(s.low, p, false);
      } else {
        const p = yToPrice(y, bb, CH);
        if (p < s.high && p > 0) s.onRangeChange(p, s.high, false);
      }
      setActivePreset(null);
    };

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const pinch = (t: TouchList) => {
      const p = pinchRef.current;
      if (!p) return;
      const d = dist(t);
      if (d <= 0) return;
      // Fingers apart (d grows) → zoom in (narrower window around the anchor).
      const next = Math.max(0.01, Math.min(1, (p.startDist / d) * p.startZoom));
      latest.current.onZoom(next);
      setActivePreset(null);
    };

    const endDrag = () => {
      draggingRef.current = null;
      anchorDragRef.current = null;
      pinchRef.current = null;
    };

    // Non-passive touchstart so a drag/pinch on the chart doesn't scroll the page.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        pinchRef.current = { startDist: dist(e.touches), startZoom: latest.current.zoom };
        draggingRef.current = null;
        e.preventDefault();
        return;
      }
      if (e.touches.length && down(e.touches[0].clientY)) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length >= 2) {
        pinch(e.touches);
        e.preventDefault();
        return;
      }
      if (draggingRef.current && e.touches.length) {
        move(e.touches[0].clientY);
        e.preventDefault();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (down(e.clientY)) e.preventDefault();
    };
    const onSvgMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) return;
      const z = zoneAt(svgY(e.clientY));
      setCursor(z === "range" ? "move" : z ? "ns-resize" : "crosshair");
    };
    const onDocMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) move(e.clientY);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mousemove", onSvgMouseMove);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", endDrag);
    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", endDrag);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mousemove", onSvgMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", endDrag);
      document.removeEventListener("mousemove", onDocMouseMove);
      document.removeEventListener("mouseup", endDrag);
    };
    // Registered once; handlers read latest.current for live values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- presets / zoom / period ----
  const clickPreset = (z: string) => {
    setActivePreset(z);
    if (z === "full") {
      onRangeChange(low, high, true);
      return;
    }
    if (z === "bid") {
      // Side presets represent the complete side of the chart, rather than
      // whatever zoom happened to be active when the user clicked them.
      const fullSideZoom = 1;
      if (zoom !== fullSideZoom) onZoom(fullSideZoom);
      onRangeChange(rate * (1 - fullSideZoom), rate, false);
      return;
    }
    if (z === "ask") {
      // `b.max` is derived from the current zoom (e.g. +35%), so using it
      // here made “Full ask” stop at the current viewport instead of the
      // full ask-side range.
      const fullSideZoom = 1;
      if (zoom !== fullSideZoom) onZoom(fullSideZoom);
      onRangeChange(rate, rate * (1 + fullSideZoom), false);
      return;
    }
    const f = parseFloat(z);
    onRangeChange(rate * (1 - f), rate * (1 + f), false);
    if (zoom < f * 1.6) onZoom(Math.min(1, f * 1.6));
  };
  const animateZoom = (direction: "in" | "out") => {
    onZoom(direction === "in" ? Math.max(0.01, zoom / 1.6) : Math.min(1, zoom * 1.6));
  };
  const fitZoomToRange = (nextLow: number, nextHigh: number) => {
    if (!Number.isFinite(rate) || rate <= 0) return;
    const required = Math.max(Math.abs(nextLow / rate - 1), Math.abs(nextHigh / rate - 1));
    if (required > zoom) onZoom(Math.min(1, Math.max(0.01, required * 1.08)));
  };
  const zoomIn = () => animateZoom("in");
  const zoomOut = () => animateZoom("out");

  // ---- SVG element helpers ----
  const gridEls = [0, 0.25, 0.5, 0.75, 1].map((f, i) => {
    const y = CH * (1 - f);
    const price = b.min + f * (b.max - b.min);
    return (
      <g key={`g${i}`}>
        <line
          x1={0}
          y1={y}
          x2={PLOT_W}
          y2={y}
          stroke="var(--m-chart-grid)"
          strokeWidth={0.6}
          strokeDasharray="4 3"
        />
        <text x={PLOT_W + 6} y={y + 4} fill="var(--m-text-secondary-2)" fontSize={11}>
          {fmt(price)}
        </text>
      </g>
    );
  });

  const dp = isLaunch ? "" : liquidityDepthPath(liquidityLevels, b, PLOT_W, CH);
  const clipY1 = isFullRange ? 0 : yH;
  const clipY2 = isFullRange ? CH : yL;

  const handle = (y: number, price: number, key: string) => {
    const pct = ((price - rate) / rate) * 100;
    const lbl = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    const pw = lbl.length * 7 + 12;
    const gy = clamp(priceToY(price, b, CH));
    const labelY = clamp(gy - 9);
    const visibleLabelY = Math.min(CH - 18, labelY);
    return (
      <g key={key}>
        <line
          x1={0}
          y1={y}
          x2={PLOT_W}
          y2={y}
          stroke="var(--m-logo)"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <rect x={8} y={visibleLabelY} width={pw} height={18} rx={6} fill="var(--m-logo)" />
        <text x={8 + pw / 2} y={visibleLabelY + 13} fill="#fff" fontSize={11} textAnchor="middle" fontWeight={600}>
          {lbl}
        </text>
        <g transform={`translate(${PLOT_W * 0.62},${key === "hi" ? gy - 16 : gy})`}>
          <rect width={18} height={16} rx={3} fill="var(--m-logo)" />
          <line x1={4} y1={5} x2={14} y2={5} stroke="rgba(255,255,255,.7)" strokeWidth={1} />
          <line x1={4} y1={8} x2={14} y2={8} stroke="rgba(255,255,255,.7)" strokeWidth={1} />
          <line x1={4} y1={11} x2={14} y2={11} stroke="rgba(255,255,255,.7)" strokeWidth={1} />
        </g>
      </g>
    );
  };

  const yc = priceToY(rate, b, CH);
  const rateLabel = fmt(rate);
  const ratePillW = Math.max(52, rateLabel.length * 7 + 12);
  const slotW = candles.length ? PLOT_W / candles.length : PLOT_W;
  const bw = Math.max(2, Math.min(slotW * 0.6, slotW - 2));

  return (
    <div className="rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] px-4 pb-3 pt-3.5 shadow-sm">
      {/* header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <TokenImageIcon symbol={baseSym} logoURI={baseLogoURI} color={liqToken(baseSym).color} size="sm" className="h-[22px] w-[22px] border-[1.5px] border-[var(--m-surface)] text-[7px]" />
          <TokenImageIcon symbol={quoteSym} logoURI={quoteLogoURI} color={liqToken(quoteSym).color} size="sm" className="-ml-2 h-[22px] w-[22px] border-[1.5px] border-[var(--m-surface)] text-[7px]" />
          <span className="ml-1">{baseSym}/{quoteSym}</span>
          <span className="ml-1 font-mono text-[13px] font-medium tabular-nums text-[var(--m-text-secondary)]">
            {fmt(rate)} {quoteSym}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={zoomIn}
            className="cl-chart-zoom-button flex h-6 w-6 items-center justify-center rounded-[7px] border border-[var(--m-border)] bg-[var(--m-surface)] text-[13px] text-[var(--m-text-secondary)] hover:border-[var(--m-primary)] hover:text-[var(--m-primary)]"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={zoomOut}
            className="cl-chart-zoom-button flex h-6 w-6 items-center justify-center rounded-[7px] border border-[var(--m-border)] bg-[var(--m-surface)] text-[13px] text-[var(--m-text-secondary)] hover:border-[var(--m-primary)] hover:text-[var(--m-primary)]"
          >
            −
          </button>
          <div className="ml-1.5 flex gap-[3px]">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriod(p)}
                className={cn(
                  "rounded-[7px] px-2.5 py-[5px] font-mono text-[11.5px] font-semibold tabular-nums",
                  p === period
                    ? "bg-[var(--m-primary)] text-[color:var(--m-on-primary)]"
                    : "bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* chart */}
      <div className="relative w-full select-none" style={{ aspectRatio: `${VW}/${VH}`, touchAction: "none" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 block h-full w-full",
          )}
          style={{ cursor }}
        >
          {gridEls}

          {/* Bands first, so candles and the range highlight both sit on top. */}
          {bandZones.map((z, i) => {
            const zy1 = clamp(priceToY(rate * (1 + z.tolerance), b, CH));
            const zy2 = clamp(priceToY(rate * (1 - z.tolerance), b, CH));
            return (
              <rect
                key={i}
                x={0}
                y={zy1}
                width={PLOT_W}
                height={Math.max(0, zy2 - zy1)}
                fill={z.open ? "var(--m-primary)" : "var(--m-border)"}
                fillOpacity={z.selected ? 0.16 : z.open ? 0.06 : 0.1}
              />
            );
          })}

          {/*
            Each band's own price, on the price axis.
            
            These lived in the step beside the chart as a "Where it fills" panel
            of two cells — printing the bounds of ONE band, the widest selected,
            under a heading, while the picker rows printed their own bounds too.
            A price belongs on the axis that measures price, and every selected
            band gets one here rather than a single band getting one there.

            Only SELECTED bands are labelled. An unselected band is not part of
            the deposit, and filling the axis with prices for bands the money
            will never sit in is what turns an axis into noise.
          */}
          {(() => {
            const rows = bandZones
              .filter((z) => z.selected)
              .flatMap((z) => [
                { y: clamp(priceToY(rate * (1 + z.tolerance), b, CH)), price: rate * (1 + z.tolerance), tol: z.tolerance },
                { y: clamp(priceToY(rate * (1 - z.tolerance), b, CH)), price: rate * (1 - z.tolerance), tol: z.tolerance },
              ])
              // Outermost first, so a tight band's label is the one dropped when
              // two collide — it sits nearest the rate pill, which already
              // states the price it would be repeating.
              .sort((p1, p2) => Math.abs(p2.price - rate) - Math.abs(p1.price - rate));

            const placed: number[] = [priceToY(rate, b, CH)];
            const keep = rows.filter((r) => {
              if (placed.some((y) => Math.abs(y - r.y) < 11)) return false;
              placed.push(r.y);
              return true;
            });

            return keep.map((r, i) => (
              <g key={`band-label-${i}`}>
                <line
                  x1={PLOT_W - 5}
                  y1={r.y}
                  x2={PLOT_W + 2}
                  y2={r.y}
                  stroke="var(--m-primary)"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                />
                <text
                  x={PLOT_W + 5}
                  y={r.y + 3}
                  fill="var(--m-primary)"
                  fontSize={9}
                  className="font-mono"
                >
                  {fmt(r.price)}
                </text>
                <text
                  x={PLOT_W + 5}
                  y={r.y + 12}
                  fill="var(--m-text-secondary-2)"
                  fontSize={8}
                  className="font-mono"
                >
                  ±{(r.tol * 100).toFixed(2)}%
                </text>
              </g>
            ));
          })()}

          {!isLaunch && !readOnly && dp && (
            <>
              <path d={dp} fill="var(--m-text-secondary-2)" fillOpacity={0.28} stroke="var(--m-text-secondary-2)" strokeWidth={1} strokeOpacity={0.5} />
              <clipPath id="cl-range-clip">
                <rect
                  x={PLOT_W - PLOT_W * 0.42}
                  y={clipY1}
                  width={PLOT_W * 0.42}
                  height={Math.max(0, clipY2 - clipY1)}
                />
              </clipPath>
              <path d={dp} fill="var(--m-logo)" fillOpacity={0.3} clipPath="url(#cl-range-clip)" />
              <text x={PLOT_W - 4} y={13} fill="var(--m-text-secondary-2)" fontSize={10} textAnchor="end">
                Liquidity depth
              </text>
            </>
          )}

          {!readOnly && (isFullRange ? (
            <rect x={0} y={0} width={PLOT_W} height={CH} fill="var(--m-logo)" fillOpacity={0.07} />
          ) : (
            <rect x={0} y={yH} width={PLOT_W} height={Math.max(0, yL - yH)} fill="var(--m-logo)" fillOpacity={0.09} />
          ))}

          {isLaunch ? (
            <>
              <line x1={0} y1={priceToY(rate, b, CH)} x2={PLOT_W} y2={priceToY(rate, b, CH)} stroke="var(--m-success)" strokeWidth={1.5} />
              <text x={PLOT_W / 2} y={priceToY(rate, b, CH) - 8} fill="var(--m-text-secondary-2)" fontSize={11} textAnchor="middle">
                No history — starting price
              </text>
            </>
          ) : (
            candles.map((d, i) => {
              const cx = (i + 0.5) * slotW;
              const bull = d.c >= d.o;
              const col = bull ? "var(--m-success)" : "var(--m-error)";
              const bt = priceToY(Math.max(d.o, d.c), b, CH);
              const bbm = priceToY(Math.min(d.o, d.c), b, CH);
              const bh = Math.max(1.5, bbm - bt);
              return (
                <g key={`c${i}`}>
                  <line x1={cx} y1={priceToY(d.h, b, CH)} x2={cx} y2={priceToY(d.l, b, CH)} stroke={col} strokeWidth={1} />
                  <rect x={cx - bw / 2} y={bt} width={bw} height={bh} fill={col} rx={1.5} />
                </g>
              );
            })
          )}

          {yc >= 0 && yc <= CH && (
            <>
              <line x1={0} y1={yc} x2={PLOT_W} y2={yc} stroke="var(--m-primary)" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
              <rect x={PLOT_W + 2} y={yc - 9} width={ratePillW} height={18} rx={5} fill="var(--m-primary)" />
              <text x={PLOT_W + 2 + ratePillW / 2} y={yc + 4} fill="#fff" fontSize={10.5} textAnchor="middle" fontWeight={700}>
                {rateLabel}
              </text>
            </>
          )}

          {!readOnly && !isFullRange && handle(yH, high, "hi")}
          {!readOnly && !isFullRange && handle(yL, low, "lo")}

          <line x1={0} y1={CH} x2={PLOT_W} y2={CH} stroke="var(--m-border)" strokeWidth={0.6} />
        </svg>
        {!isLaunch && candlesLoading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[color:color-mix(in_srgb,var(--m-surface)_78%,transparent)]">
            <div className="w-2/3 space-y-3" aria-label="Loading market history">
              <div className="h-3 animate-pulse rounded-full bg-[var(--m-surface-2)]" />
              <div className="h-28 animate-pulse rounded-xl bg-[var(--m-surface-2)]" />
            </div>
          </div>
        )}
        {readOnly && !candlesLoading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[color:var(--m-text-secondary)]">
            No indexed price history for this period.
          </div>
        )}
        {!isLaunch && !liquidityLoading && liquidityLevels.length === 0 && !candlesLoading && (
          <span className="pointer-events-none absolute right-[16%] top-2 text-[10px] text-[var(--m-text-secondary-2)]">
            No indexed liquidity depth
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[var(--m-text-secondary)]">Upper range quote price</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-2">
              <input
                aria-label={`Upper range in ${quoteSym}`}
                inputMode="decimal"
                type="text"
                value={upperInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setUpperInput(value);
                  const next = Number(value);
                  if (Number.isFinite(next) && next >= low) {
                    onRangeChange(low, next, false);
                    fitZoomToRange(low, next);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[var(--m-text-primary)] outline-none"
              />
              <span className="shrink-0 font-mono text-[10px] text-[var(--m-text-secondary-2)]">{quoteSym}</span>
            </div>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[10.5px] text-[var(--m-text-secondary)]">Lower range quote price</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-2">
              <input
                aria-label={`Lower range in ${quoteSym}`}
                inputMode="decimal"
                type="text"
                value={lowerInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setLowerInput(value);
                  const next = Number(value);
                  if (Number.isFinite(next) && next <= high) {
                    onRangeChange(next, high, false);
                    fitZoomToRange(next, high);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[var(--m-text-primary)] outline-none"
              />
              <span className="shrink-0 font-mono text-[10px] text-[var(--m-text-secondary-2)]">{quoteSym}</span>
            </div>
          </label>
        </div>
      )}

      {/* presets — range selection, so absent from the reading surface */}
      <div className={cn("mt-3 flex flex-wrap gap-1.5", readOnly && "hidden")}>
        {PRESETS.map((p) => {
          const on = activePreset === p.z;
          const isFull = p.z === "full";
          const isSide = p.z === "bid" || p.z === "ask";
          return (
            <button
              key={p.z}
              type="button"
              onClick={() => clickPreset(p.z)}
              className={cn(
                "rounded-lg border px-3 py-[7px] font-mono text-xs font-semibold tabular-nums",
                on && isFull && "border-[var(--m-logo)] bg-[color-mix(in_srgb,var(--m-logo)_14%,transparent)] text-[var(--m-logo)]",
                on && !isFull && "border-[var(--m-primary)] bg-[var(--m-primary-100)] text-[var(--m-primary-fg)]",
                on && isSide && "border-[var(--m-logo)] bg-[color-mix(in_srgb,var(--m-logo)_10%,transparent)] text-[var(--m-logo)]",
                !on && "border-[var(--m-border)] bg-[var(--m-surface-2)] text-[var(--m-text-secondary)]",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function rangeInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  return value >= 1 ? String(value) : value.toPrecision(8).replace(/0+$/, "").replace(/\.$/, "");
}
