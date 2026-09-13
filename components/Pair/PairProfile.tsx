"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChainBadge, TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { ActionDock, type DockTab } from "@/components/Explore/ActionDock";
import { buildPageUrl } from "@/lib/routing/chainParams";
import {
  bookState,
  bookStateNote,
  depthWithin,
  formatPct,
  levelWidthPct,
  midPrice,
  spreadPct,
} from "@/lib/pair/derive";
import { usePairSnapshot } from "@/hooks/usePairSnapshot";
import { usePairCandles } from "@/hooks/usePairCandles";
import type { PairCandle } from "@/hooks/usePairCandles";
import { usePairLiquidityRanges, type LiquidityRange } from "@/hooks/usePairLiquidityRanges";
import type { ChartPeriod } from "@/lib/liquidity/types";
import type { BookLevel } from "@/lib/pair/types";
import type { GroupedOrderbookResult } from "@/types/tables/orderbooks/orderbook";
import { isUnlisted } from "@/lib/search/listing";
import { formatSubscriptDecimal } from "@/utils/number";
import { cn } from "@/lib/utils";
import { tokenColor } from "@/lib/portfolio/mock";
import type { SpotPair } from "@/types";

/**
 * Pair profile — the reading surface the app never had.
 *
 * Explore's doctrine is "read left, act right": profiles inform, the dock executes. Until
 * now a pair had nowhere to be read at all — the name in the market table linked straight
 * into the trading terminal, so the only way to look at a market was to open a place
 * designed for trading it.
 *
 * Everything here is read-only by construction. The chart is the shared CL chart in its
 * new `readOnly` mode (no draggable range on a page that cannot act on one), and every
 * action is delegated to the dock on the right, which is the same component Explore uses.
 *
 * The figures are LIVE as of 2026-08-08: the book, spread and depth come from
 * `useOrderbook` and recent trades from `useRecentTrades` — both websocket-backed and
 * shared with `/trade/pro` — while pool APR comes from `/api/liquidity/pool`. See
 * `hooks/usePairSnapshot`. What remains marked `est` is marked per leg, so the badge
 * appears only on figures that really are illustrative.
 */

const DEPTH_BAND_PCT = 2;
type ProfileTab = "price" | "liquidity" | "volume" | "depth";

function AnimatedDigits({ value, className }: { value: string | number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = String(value);

  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    group.classList.remove("is-animating");
    void group.offsetHeight;
    group.classList.add("is-animating");
  }, [text]);

  return (
    <span ref={ref} className={cn("t-digit-group is-animating tabular-nums", className)} aria-label={text}>
      {text.split("").map((character, index) => (
        <span
          key={`${character}-${index}`}
          className="t-digit whitespace-pre"
          aria-hidden="true"
          data-stagger={index === text.length - 2 ? "1" : index === text.length - 1 ? "2" : undefined}
        >
          {character}
        </span>
      ))}
    </span>
  );
}

function PairLogo({ pair }: { pair: SpotPair }) {
  const { displayNetworkName } = useMarketPageContext();
  return (
    <span className="relative block h-10 w-10 shrink-0 overflow-visible rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={pair.baseSymbol}
          logoURI={pair.base.logoURI}
          color={tokenColor(pair.baseSymbol)}
          size="lg"
          className="h-10 w-10 rounded-none"
        />
        </span>
        <span className="absolute inset-y-0 left-1/2 w-1/2 overflow-hidden">
        <TokenImageIcon
          symbol={pair.quoteSymbol}
          logoURI={pair.quote.logoURI}
          color={tokenColor(pair.quoteSymbol)}
          size="lg"
          className="h-10 w-10 -translate-x-1/2 rounded-none"
        />
        </span>
      </span>
      <ChainBadge chainName={displayNetworkName} size="lg" />
    </span>
  );
}

/**
 * Marks a market Iter has not listed.
 *
 * Same wording and title text as the search modal's chip — a reader who follows a hit
 * from search to here must not be told two different things about the same market.
 */
function UnlistedChip() {
  return (
    <span
      title="Not listed by Iter — anyone can deploy a token and open a market"
      className="shrink-0 rounded-[5px] border border-[color:var(--m-text-secondary-2)] px-1 py-px font-dm-mono text-[9px] uppercase tracking-normal text-[color:var(--m-text-secondary-2)]"
    >
      unlisted
    </span>
  );
}

function fmtUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function fmtRate(value: number | null, quote: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  // Sub-1 rates used to go straight to `maximumFractionDigits: 6`, which loses
  // the number twice over: 0.00000123 rendered as "0.000001" (a 23% error, and
  // every token in that decade collapsing onto one label), and anything below
  // 1e-7 rendered as a flat "0" — a priced market reading as an unpriced one,
  // on the page whose whole job is quoting it. See `formatSubscriptDecimal`.
  //
  // This is the ONLY price formatter on this page — the depth axis, the candle
  // axis, the header rate, the trade rows and every aria-label route through it
  // — which is why the notation reaches all of them from this one line. Keep it
  // that way: a second formatter here is how one surface starts disagreeing
  // with the one beside it.
  const subscript = formatSubscriptDecimal(value);
  if (subscript !== null) return `${subscript} ${quote}`;
  const digits = value < 1 ? 6 : value < 1_000 ? 4 : 2;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ${quote}`;
}

/** Marks a figure the gateway does not serve yet. Same contract as the portfolio's `est`. */
function Est() {
  return (
    <sup
      title="Illustrative — this figure is not coming from the gateway right now"
      className="ml-0.5 cursor-help font-dm-mono text-[8.5px] font-semibold uppercase tracking-wide text-[color:var(--m-warning)]"
    >
      est
    </sup>
  );
}

function Stat({
  label,
  value,
  tone,
  est,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down";
  est?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="font-dm-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-dm-mono text-[15px] font-semibold tabular-nums",
          tone === "up" && "text-[color:var(--m-success-fg)]",
          tone === "down" && "text-[color:var(--m-error-fg)]",
        )}
      >
        {typeof value === "string" || typeof value === "number" ? <AnimatedDigits value={value} /> : value}
        {est && <Est />}
      </div>
    </div>
  );
}

function BookSide({
  levels,
  side,
  quote,
}: {
  levels: BookLevel[];
  side: "bid" | "ask";
  quote: string;
}) {
  const rows = side === "ask" ? [...levels].slice(0, 6).reverse() : levels.slice(0, 6);
  const color = side === "bid" ? "var(--m-success)" : "var(--m-error)";
  return (
    <div className="flex flex-col gap-px">
      {rows.map((level, i) => (
        <div key={i} className="relative flex items-center justify-between px-2 py-[3px] text-[11.5px]">
          {/* Depth bar reads from the side it belongs to, so the two ladders mirror. */}
          <span
            aria-hidden
            className={cn("absolute inset-y-0", side === "bid" ? "left-0" : "right-0")}
            style={{
              width: `${levelWidthPct(level, levels)}%`,
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
          />
          <span
            className="relative font-dm-mono tabular-nums"
            style={{ color: side === "bid" ? "var(--m-success-fg)" : "var(--m-error-fg)" }}
          >
            {fmtRate(level.price, "")}
          </span>
          <span className="relative font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
            {level.size.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="px-2 py-3 text-center text-[11.5px] text-[color:var(--m-text-secondary-2)]">
          nothing resting on the {side} side
        </div>
      )}
      <div className="mt-1 px-2 font-dm-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        {side === "bid" ? "bids" : "asks"} · size in base, price in {quote}
      </div>
    </div>
  );
}

const CHART_W = 760;
const CHART_H = 310;
const CHART_PAD = 30;

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[310px] items-center justify-center rounded-xl border border-dashed border-[color:var(--m-border)] text-sm text-[color:var(--m-text-secondary)]">
      {children}
    </div>
  );
}

/**
 * A price bin with every source of liquidity resting in it, all in QUOTE terms.
 *
 * One unit for all three so the bars can stack and share a scale: a book level's
 * notional is `size × price`, and a pool bin's is its base leg at the bin's own
 * rate plus its quote leg as-is.
 */
interface DepthBin {
  minPrice: number;
  maxPrice: number;
  /** Resting BIDS — quote committed to buying, below the mid. */
  bid: number;
  /** Resting ASKS — base offered for sale, above it. */
  ask: number;
  /** Concentrated-liquidity ranges, where the market has a pool. */
  pool: number;
}

/**
 * Bin the book and the pool onto one price axis.
 *
 * The pool's edges win when it has any, because the gateway already chose them
 * around the live rate and re-deriving them here would put this chart on a
 * different axis from the numbers underneath it. With no pool — which on this
 * venue is most markets, every order-book-only pair — the book sets its own
 * span, padded so the outermost level is not drawn on the plot edge.
 */
function depthBins(
  poolRanges: LiquidityRange[],
  bids: BookLevel[],
  asks: BookLevel[],
  center: number,
  count: number,
): DepthBin[] {
  const usablePool = poolRanges.filter((r) => r.maxPrice > r.minPrice);
  const levels = [...bids, ...asks].filter((level) => level.price > 0 && level.size > 0);
  if (!usablePool.length && !levels.length) return [];

  /*
   * ONE axis, spanning both sources.
   *
   * This used to adopt the gateway's own bin edges whenever the pool had any,
   * and that is a different axis from the one the book needs. A band pool is
   * TIGHT — measured on Arc, a single band at ±0.02%, so the gateway's histogram
   * spans 0.04% of price end to end — while resting orders on the same market
   * are percent away. Every one of them was clamped into the two edge bins,
   * which drew the entire order book as two towers at the extremes.
   *
   * So the domain is the union, and both sources are binned here.
   */
  const prices = [
    ...levels.map((l) => l.price),
    ...usablePool.flatMap((r) => [r.minPrice, r.maxPrice]),
  ];
  const lo = Math.min(...prices, center || Number.POSITIVE_INFINITY);
  const hi = Math.max(...prices, center || 0);
  // A one-sided book, or a single band, collapses lo and hi onto one price — and
  // a zero-width domain divides by zero downstream. Pad proportionally, with an
  // absolute floor for the degenerate case.
  const pad = Math.max((hi - lo) * 0.15, hi * 0.02, 1e-12);
  const min = lo - pad;
  const width = (hi + pad - min) / count;

  const out: DepthBin[] = Array.from({ length: count }, (_, i) => ({
    minPrice: min + i * width,
    maxPrice: min + (i + 1) * width,
    bid: 0,
    ask: 0,
    pool: 0,
  }));

  /*
   * Each band spread across the bins it covers, proportionally — the same
   * treatment the gateway's own `buildHistogram` gives a range, so the two agree
   * about what a band means.
   *
   * Quote-denominated like the book beside it: the base leg is valued at the
   * bin's own rate so all three series share one scale and can stack.
   */
  for (const range of usablePool) {
    const rangeWidth = range.maxPrice - range.minPrice;
    if (rangeWidth <= 0) continue;
    for (const bin of out) {
      const overlap =
        Math.min(bin.maxPrice, range.maxPrice) - Math.max(bin.minPrice, range.minPrice);
      if (overlap <= 0) continue;
      const fraction = overlap / rangeWidth;
      const binMid = (bin.minPrice + bin.maxPrice) / 2;
      bin.pool += range.baseAmount * fraction * binMid + range.quoteAmount * fraction;
    }
  }

  if (!out.length) return out;
  const first = out[0]!;
  const last = out[out.length - 1]!;

  const place = (price: number): DepthBin | null => {
    // Clamped rather than dropped: a resting order outside the pool's window is
    // still real depth, and silently discarding it would understate the book on
    // exactly the markets whose orders sit far from spot.
    if (price <= first.minPrice) return first;
    if (price >= last.maxPrice) return last;
    const found = out.find((bin) => price >= bin.minPrice && price < bin.maxPrice);
    return found ?? last;
  };

  for (const level of bids) {
    if (!(level.price > 0) || !(level.size > 0)) continue;
    const bin = place(level.price);
    if (bin) bin.bid += level.size * level.price;
  }
  for (const level of asks) {
    if (!(level.price > 0) || !(level.size > 0)) continue;
    const bin = place(level.price);
    if (bin) bin.ask += level.size * level.price;
  }

  return out;
}

/**
 * Liquidity by rate: the ORDER BOOK first, and pool ranges where a pool exists.
 *
 * ## The book was missing, and it is where the liquidity actually is
 *
 * This drew `spotLiquidityRanges` and nothing else — concentrated-liquidity
 * positions, the thing Uniswap's chart shows. On a venue whose markets are order
 * books first that is the smaller half of the answer and frequently the empty
 * one: `addPair` creates a Pool only when neither leg is a wrapped native, so
 * every market on a WETH-quoted chain has no pool at all, and on the chains that
 * do the pools can sit at zero positions while the book carries real depth.
 *
 * Measured on Arc, DONUT/USDC: pool `0xeb65fD3C…` exists, `positions: 0`, forty
 * histogram bins each `{base: 0, quote: 0}` — so the chart drew axes, a legend, a
 * current-rate readout and forty bars of height zero, on a market that was
 * trading. "Liquidity distribution" showing none of the liquidity.
 *
 * Bids and asks are separate series rather than one "depth", because which side
 * is thick is the question a reader brings to this chart. Pool ranges stack on
 * top in a third colour, so a market with both shows how much of its depth is
 * passive — and a market with an empty pool now shows the book instead of
 * nothing.
 *
 * Everything is quote-denominated, which is what lets the three stack.
 */
function LiquidityChart({
  ranges,
  currentPrice,
  base,
  quote,
  bids,
  asks,
  hasPool,
}: {
  ranges: LiquidityRange[];
  currentPrice: number;
  base: string;
  quote: string;
  bids: BookLevel[];
  asks: BookLevel[];
  /** False when the market has no pool at all — changes the legend, not the plot. */
  hasPool: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const center = currentPrice || 0;
  const levels = depthBins(ranges, bids, asks, center, 40);
  const totals = levels.map((bin) => bin.bid + bin.ask + bin.pool);
  const maxValue = Math.max(...totals, 0);

  if (!levels.length || maxValue <= 0) {
    return (
      <EmptyChart>
        Nothing is resting on this market — no orders on the book
        {hasPool ? " and no liquidity in the pool" : " and no pool"}.
      </EmptyChart>
    );
  }

  const minPrice = levels[0]!.minPrice;
  const maxPrice = levels.at(-1)!.maxPrice;
  const plotWidth = CHART_W - CHART_PAD * 2;
  const x = (price: number) => CHART_PAD + ((price - minPrice) / (maxPrice - minPrice)) * plotWidth;
  const slotWidth = plotWidth / levels.length;
  const selected = hovered === null ? null : levels[hovered];
  const selectedTotal = hovered === null ? null : totals[hovered];
  const hoverRatio = hovered === null ? 0 : (hovered + 0.5) / levels.length;
  const pointerRatio = pointer && chartRef.current ? pointer.x / chartRef.current.clientWidth : hoverRatio;
  const tooltipShiftX = pointerRatio < 0.28 ? "0" : pointerRatio > 0.72 ? "-100%" : "-50%";
  const movePointer = (event: React.PointerEvent<SVGGElement>) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPointer({
      x: Math.max(12, Math.min(bounds.width - 12, event.clientX - bounds.left)),
      y: Math.max(12, Math.min(bounds.height - 12, event.clientY - bounds.top)),
    });
  };

  const SERIES = [
    { key: "bid" as const, label: "Bids", fill: "url(#pair-depth-bid)", swatch: "var(--m-success-fg)", text: "text-[color:var(--m-success-fg)]" },
    { key: "ask" as const, label: "Asks", fill: "url(#pair-depth-ask)", swatch: "var(--m-error-fg)", text: "text-[color:var(--m-error-fg)]" },
    { key: "pool" as const, label: "Pool", fill: "url(#pair-depth-pool)", swatch: "var(--m-logo)", text: "text-[color:var(--m-logo)]" },
  ];

  return (
    <div ref={chartRef} className="relative overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/20 p-3">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2 px-2">
        <div><div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Current rate</div><div className="font-dm-mono text-sm tabular-nums">1 {base} = {fmtRate(center, quote)}</div></div>
        <div className="flex items-center gap-3 font-dm-mono text-[10px]">
          {SERIES.filter((series) => series.key !== "pool" || hasPool).map((series) => (
            <span key={series.key} className="inline-flex items-center gap-1.5 text-[color:var(--m-text-secondary)]">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: series.swatch }} />
              {series.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block h-auto w-full" role="img" aria-label="Liquidity by rate">
        <defs>
          <linearGradient id="pair-depth-bid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--m-success-fg)" stopOpacity="1" /><stop offset="1" stopColor="var(--m-success-fg)" stopOpacity="0.5" /></linearGradient>
          <linearGradient id="pair-depth-ask" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--m-error-fg)" stopOpacity="1" /><stop offset="1" stopColor="var(--m-error-fg)" stopOpacity="0.5" /></linearGradient>
          <linearGradient id="pair-depth-pool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--m-logo)" stopOpacity="0.9" /><stop offset="1" stopColor="var(--m-logo)" stopOpacity="0.42" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((tick) => <line key={tick} x1={CHART_PAD} x2={CHART_W - CHART_PAD} y1={CHART_H * tick} y2={CHART_H * tick} stroke="var(--m-border)" strokeDasharray="2 6" />)}
        {levels.map((level, index) => {
          const total = totals[index]!;
          const bottom = CHART_H - CHART_PAD;
          const full = CHART_H - CHART_PAD * 2;
          const barX = CHART_PAD + index * slotWidth + 1;
          const barWidth = Math.max(2, slotWidth - 2);
          // An empty bin draws NOTHING. The old chart floored every bar at 2px,
          // which on a pool of forty zeroes rendered a solid row of stubs that
          // read as uniform shallow liquidity rather than as none.
          if (total <= 0) return null;
          let y = bottom;
          return (
            <g
              key={`${level.minPrice}-${index}`}
              tabIndex={0}
              role="graphics-symbol"
              aria-label={`${fmtRate(level.minPrice, quote)} to ${fmtRate(level.maxPrice, quote)}: ${total.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${quote} resting`}
              onPointerEnter={(event) => { setHovered(index); movePointer(event); }}
              onPointerMove={movePointer}
              onPointerLeave={() => { setHovered(null); setPointer(null); }}
              onFocus={() => { setHovered(index); setPointer(null); }}
              onBlur={() => { setHovered(null); setPointer(null); }}
            >
              {SERIES.map((series) => {
                const value = level[series.key];
                if (value <= 0) return null;
                const height = Math.max(1, (value / maxValue) * full);
                y -= height;
                return (
                  <rect
                    key={series.key}
                    className="liquidity-bar-draw"
                    style={{ animationDelay: `${index * 12}ms` }}
                    x={barX}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx={1.5}
                    fill={series.fill}
                  />
                );
              })}
            </g>
          );
        })}
        {center >= minPrice && center <= maxPrice && <line x1={x(center)} x2={x(center)} y1={8} y2={CHART_H - CHART_PAD} stroke="var(--m-text-primary)" strokeWidth={2.5} />}
        <line x1={CHART_PAD} x2={CHART_W - CHART_PAD} y1={CHART_H - CHART_PAD} y2={CHART_H - CHART_PAD} stroke="var(--m-border)" />
        <text x={CHART_PAD} y={CHART_H - 8} fill="var(--m-text-secondary-2)" fontSize="11">{fmtRate(minPrice, "")}</text>
        <text x={CHART_W - CHART_PAD} y={CHART_H - 8} textAnchor="end" fill="var(--m-text-secondary-2)" fontSize="11">{fmtRate(maxPrice, "")}</text>
      </svg>
      {selected && selectedTotal !== null && selectedTotal > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[230px] rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3 shadow-lg"
          style={{
            left: pointer ? `${pointer.x}px` : `calc(12px + (100% - 24px) * ${hoverRatio})`,
            top: pointer ? `${pointer.y}px` : "64px",
            transform: pointer
              ? `translate(${tooltipShiftX}, ${pointer.y < 150 ? "16px" : "calc(-100% - 12px)"})`
              : `translate(${tooltipShiftX}, 0)`,
          }}
        >
          <div className="mb-2 font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Rate range</div>
          <div className="font-dm-mono text-[12px] tabular-nums">{fmtRate(selected.minPrice, quote)} – {fmtRate(selected.maxPrice, quote)}</div>
          <div className="mt-3 flex flex-col gap-1 border-t border-[color:var(--m-border)] pt-2.5">
            {/* Only the sources actually present in THIS bin. A row of zeroes
                under every hover is noise, and it hides the one line that moved. */}
            {SERIES.filter((series) => selected[series.key] > 0).map((series) => (
              <div key={series.key} className="flex items-center justify-between gap-4">
                <span className={cn("inline-flex items-center gap-1.5 text-[10px]", series.text)}>
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: series.swatch }} />
                  {series.label}
                </span>
                <span className={cn("font-dm-mono text-xs tabular-nums", series.text)}>
                  {selected[series.key].toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-[color:var(--m-border)] pt-2 font-dm-mono text-[11px]"><span className="text-[color:var(--m-text-secondary-2)]">Total</span><span>{selectedTotal.toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}</span></div>
        </div>
      )}
    </div>
  );
}

/** Cumulative bid/ask depth from the real order book, centered on the mid. */
function DepthChart({ bids, asks, mid, quote }: { bids: BookLevel[]; asks: BookLevel[]; mid: number | null; quote: string }) {
  const [hovered, setHovered] = useState<BookLevel | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const left = [...bids].filter((level) => level.price > 0).sort((a, b) => a.price - b.price);
  const right = [...asks].filter((level) => level.price > 0).sort((a, b) => a.price - b.price);
  const levels = [...left, ...right];
  if (!levels.length) return <EmptyChart>No resting depth for this pair.</EmptyChart>;
  const rawMin = Math.min(...levels.map((level) => level.price));
  const rawMax = Math.max(...levels.map((level) => level.price));
  const center = mid ?? (rawMin + rawMax) / 2;
  // The mid has to be inside the domain, and on a one-sided book it sits
  // outside the levels' own range.
  const domainLo = Math.min(rawMin, center);
  const domainHi = Math.max(rawMax, center);
  // Padding is what makes the outermost level visible AT ALL. Without it that
  // level lands exactly on the plot edge, so its step has nowhere to run and
  // draws nothing — which is how a book with one resting ask rendered its
  // whole ask side as empty space while the order book table listed it.
  const pad = Math.max((domainHi - domainLo) * 0.15, domainHi * 0.002, 1e-9);
  const minPrice = domainLo - pad;
  const maxPrice = domainHi + pad;
  const span = maxPrice - minPrice;
  const maxDepth = Math.max(...levels.map((level) => level.cumulative || level.size), 1e-9);
  const x = (price: number) => CHART_PAD + ((price - minPrice) / span) * (CHART_W - CHART_PAD * 2);
  const y = (depth: number) => CHART_H - CHART_PAD - (depth / maxDepth) * (CHART_H - CHART_PAD * 2);
  /**
   * A depth staircase read outward from the mid: nothing is filled at the mid,
   * and each level adds its cumulative size as the price moves away.
   *
   * The previous shape walked the levels themselves and emitted a step per
   * level AFTER the first, which dropped two runs: the one between the mid and
   * the innermost level, and — on a side holding exactly one level — every run,
   * leaving a bare `moveto` that SVG renders as nothing.
   */
  const stair = (side: BookLevel[], outward: "left" | "right"): Array<[number, number]> => {
    if (!side.length) return [];
    // `side` is sorted ascending by price; nearest-the-mid is the far end for bids.
    const ordered = outward === "left" ? [...side].reverse() : side;
    const points: Array<[number, number]> = [[x(center), y(0)]];
    let depth = 0;
    for (const level of ordered) {
      points.push([x(level.price), y(depth)]);
      depth = level.cumulative || level.size;
      points.push([x(level.price), y(depth)]);
    }
    // Carry the deepest level out to the edge so the last step has width.
    points.push([x(outward === "left" ? minPrice : maxPrice), y(depth)]);
    return points;
  };
  const leftPoints = stair(left, "left");
  const rightPoints = stair(right, "right");
  const curve = (points: Array<[number, number]>) =>
    points.map(([px, py], index) => `${index ? "L" : "M"} ${px},${py}`).join(" ");
  const area = (points: Array<[number, number]>) => {
    if (!points.length) return "";
    const base = CHART_H - CHART_PAD;
    return `${curve(points)} L ${points.at(-1)![0]},${base} L ${points[0]![0]},${base} Z`;
  };
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const localX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const localY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const svgX = (localX / bounds.width) * CHART_W;
    const price = minPrice + ((svgX - CHART_PAD) / (CHART_W - CHART_PAD * 2)) * span;
    const side = price <= center ? left : right;
    const nearest = side.reduce<BookLevel | null>(
      (best, level) => !best || Math.abs(level.price - price) < Math.abs(best.price - price) ? level : best,
      null,
    );
    setHovered(nearest);
    setPointer({ x: Math.max(12, Math.min(bounds.width - 12, localX)), y: Math.max(12, Math.min(bounds.height - 12, localY)) });
  };
  const pointerRatio = pointer && chartRef.current ? pointer.x / chartRef.current.clientWidth : 0.5;
  const shiftX = pointerRatio < 0.3 ? "0" : pointerRatio > 0.7 ? "-100%" : "-50%";
  const distancePct = hovered && center > 0 ? ((hovered.price - center) / center) * 100 : null;
  return (
    <div ref={chartRef} className="relative overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/35 p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block h-auto w-full touch-none" role="img" aria-label={`Full ${quote} order-book depth`} onPointerMove={inspect} onPointerLeave={() => { setHovered(null); setPointer(null); }}>
        {[0.25, 0.5, 0.75].map((tick) => <line key={tick} x1={CHART_PAD} x2={CHART_W - CHART_PAD} y1={CHART_H * tick} y2={CHART_H * tick} stroke="var(--m-border)" strokeDasharray="2 6" />)}
        <path d={area(leftPoints)} fill="var(--m-success)" fillOpacity={0.22} stroke="none" />
        <path d={area(rightPoints)} fill="var(--m-error)" fillOpacity={0.22} stroke="none" />
        <path d={curve(leftPoints)} fill="none" stroke="var(--m-success)" strokeWidth={3.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={curve(rightPoints)} fill="none" stroke="var(--m-error)" strokeWidth={3.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {center >= minPrice && center <= maxPrice && <line x1={x(center)} x2={x(center)} y1={CHART_PAD} y2={CHART_H - CHART_PAD} stroke="var(--m-text-primary)" strokeWidth={2} />}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const price = minPrice + span * tick;
          if (tick === 0.5 && center >= minPrice && center <= maxPrice) return null;
          return <text key={tick} x={CHART_PAD + (CHART_W - CHART_PAD * 2) * tick} y={CHART_H - 8} textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"} fill="var(--m-text-secondary-2)" fontSize="11">{fmtRate(price, "")}</text>;
        })}
        {center >= minPrice && center <= maxPrice && <>
          <rect x={x(center) - 38} y={CHART_H - 25} width={76} height={22} rx={5} fill="var(--m-text-secondary-2)" />
          <text x={x(center)} y={CHART_H - 10} textAnchor="middle" fill="var(--m-background)" fontSize="11" fontWeight={600}>{fmtRate(center, "")}</text>
        </>}
      </svg>
      {hovered && pointer && (
        <div className="pointer-events-none absolute z-10 min-w-[220px] rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3 shadow-lg" style={{ left: pointer.x, top: pointer.y, transform: `translate(${shiftX}, ${pointer.y < 145 ? "14px" : "calc(-100% - 12px)"})` }}>
          <div className="mb-2 flex items-center justify-between text-xs"><span className="text-[color:var(--m-text-secondary)]">Range</span><span className={cn("font-dm-mono tabular-nums", (distancePct ?? 0) <= 0 ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{distancePct !== null && distancePct >= 0 ? "+" : ""}{distancePct?.toFixed(2)}%</span></div>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <span className="text-[color:var(--m-text-secondary)]">Rate</span><span className="text-right font-dm-mono tabular-nums">{fmtRate(hovered.price, quote)}</span>
            <span className="text-[color:var(--m-text-secondary)]">Amount</span><span className="text-right font-dm-mono tabular-nums">{hovered.cumulative.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span>
            <span className="text-[color:var(--m-text-secondary)]">Quote value</span><span className="text-right font-dm-mono tabular-nums">{(hovered.cumulative * hovered.price).toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeChart({ candles, period, onPeriod }: { candles: PairCandle[]; period: ChartPeriod; onPeriod: (period: ChartPeriod) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  if (!candles.length) return <EmptyChart>No indexed volume for this period.</EmptyChart>;
  const W = 820;
  const H = 430;
  const left = 24;
  const right = 92;
  const top = 82;
  const bottom = 350;
  const maxVolume = Math.max(...candles.map((bar) => bar.volumeUsd), 1e-12);
  const total = candles.reduce((sum, bar) => sum + bar.volumeUsd, 0);
  const plotWidth = W - left - right;
  const slot = plotWidth / candles.length;
  // Deduplicated, so a short series cannot label one bar twice; the last entry is
  // always the NEWEST bucket, and it is drawn flush to the plot's right edge below
  // rather than at its bar's centre — a gap there reads as "the axis stops before now".
  const timeTicks = [...new Set(Array.from({ length: Math.min(5, candles.length) }, (_, tick) => Math.round((tick / Math.max(1, Math.min(5, candles.length) - 1)) * (candles.length - 1))))];
  const formatTime = (timestamp: number) => {
    if (!timestamp) return "—";
    const date = new Date(timestamp * 1000);
    if (period === "1D") return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (period === "7D") return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const svgX = ((event.clientX - bounds.left) / bounds.width) * W;
    setActive(Math.max(0, Math.min(candles.length - 1, Math.floor((svgX - left) / slot))));
  };
  const selected = active === null ? null : candles[active];
  return (
    <div ref={chartRef} className="relative overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2">
      <div className="pointer-events-none absolute left-6 top-5 z-10"><div className="text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.03em]"><AnimatedDigits value={fmtUsd(selected?.volumeUsd ?? total)} /></div><div className="mt-1 text-sm text-[color:var(--m-text-secondary)]">{selected?.timestamp ? formatTime(selected.timestamp) : period === "1D" ? "Past day" : period === "7D" ? "Past week" : "Past month"}</div></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none" role="img" aria-label="USD trading volume" onPointerMove={inspect} onPointerLeave={() => setActive(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}><line x1={left} x2={W - right} y1={top + (bottom - top) * tick} y2={top + (bottom - top) * tick} stroke="var(--m-border)" strokeDasharray="2 7" /><text x={W - right + 12} y={top + (bottom - top) * tick + 4} fill="var(--m-text-secondary)" fontSize="11">{fmtUsd(maxVolume * (1 - tick))}</text></g>)}
        {candles.map((bar, index) => {
          const height = Math.max(1, (bar.volumeUsd / maxVolume) * (bottom - top));
          return <rect className="liquidity-bar-draw" style={{ animationDelay: `${index * 16}ms` }} key={`${bar.timestamp}-${index}`} x={left + index * slot + slot * 0.1} y={bottom - height} width={Math.max(2, slot * 0.8)} height={height} fill="var(--m-logo)" opacity={active === null || active === index ? 0.9 : 0.55} />;
        })}
        {active !== null && <line x1={left + (active + 0.5) * slot} x2={left + (active + 0.5) * slot} y1={top} y2={bottom} stroke="var(--m-text-secondary)" strokeWidth={1} />}
        {timeTicks.map((index, tick) => <text key={`${candles[index]!.timestamp}-${index}`} x={tick === timeTicks.length - 1 ? W - right : left + (index + 0.5) * slot} y={bottom + 24} textAnchor={tick === 0 ? "start" : tick === timeTicks.length - 1 ? "end" : "middle"} fill="var(--m-text-primary)" fontSize="12">{formatTime(candles[index]!.timestamp)}</text>)}
      </svg>
      <div className="absolute right-4 top-4 z-10 flex gap-1 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-sm">{(["1D", "7D", "1M"] as ChartPeriod[]).map((option) => <button key={option} type="button" onClick={() => onPeriod(option)} className={cn("min-h-8 rounded-full px-3 font-dm-mono text-[11px]", period === option ? "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]" : "text-[color:var(--m-text-secondary)]")}>{option}</button>)}</div>
    </div>
  );
}

function PairPriceChart({ candles, loading, base, quote, period, onPeriod }: { candles: PairCandle[]; loading: boolean; base: string; quote: string; period: ChartPeriod; onPeriod: (period: ChartPeriod) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  if (loading) return <div className="h-[420px] animate-pulse rounded-2xl bg-[color:var(--m-surface-2)] motion-reduce:animate-none" />;
  if (!candles.length) return <EmptyChart>No indexed price history for this period.</EmptyChart>;
  const W = 820;
  const H = 430;
  const left = 24;
  const right = 92;
  const top = 88;
  const bottom = 350;
  const closes = candles.map((candle) => candle.c);
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const padding = Math.max((high - low) * 0.18, high * 0.0005, 1e-9);
  const min = low - padding;
  const max = high + padding;
  const plotWidth = W - left - right;
  const x = (index: number) => left + (index / Math.max(1, candles.length - 1)) * plotWidth;
  const y = (value: number) => top + ((max - value) / (max - min)) * (bottom - top);
  let line = `M ${x(0)},${y(candles[0]!.c)}`;
  for (let index = 1; index < candles.length; index += 1) line += ` H ${x(index)} V ${y(candles[index]!.c)}`;
  const area = `${line} L ${x(candles.length - 1)},${bottom} L ${x(0)},${bottom} Z`;
  const selectedIndex = active ?? candles.length - 1;
  const selected = candles[selectedIndex]!;
  const change = candles[0]!.c > 0 ? ((selected.c - candles[0]!.c) / candles[0]!.c) * 100 : 0;
  const timeTicks = Array.from({ length: Math.min(5, candles.length) }, (_, tick) =>
    Math.round((tick / Math.max(1, Math.min(5, candles.length) - 1)) * (candles.length - 1)),
  );
  const formatTime = (timestamp: number) => {
    if (!timestamp) return "—";
    const date = new Date(timestamp * 1000);
    if (period === "1D") return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (period === "7D") return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const localX = ((event.clientX - bounds.left) / bounds.width) * W;
    setActive(Math.max(0, Math.min(candles.length - 1, Math.round(((localX - left) / plotWidth) * (candles.length - 1)))));
  };
  return (
    <div ref={chartRef} className="relative overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2">
      <div className="pointer-events-none absolute left-6 top-5 z-10">
        <div className="flex items-baseline gap-3"><span className="text-[clamp(22px,3vw,34px)] font-medium tracking-[-0.03em]">1 {base} = <AnimatedDigits value={fmtRate(selected.c, "")} /> {quote}</span><span className={cn("font-dm-mono text-sm", change >= 0 ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{change >= 0 ? "▲" : "▼"} <AnimatedDigits value={`${Math.abs(change).toFixed(2)}%`} /></span></div>
        <div className="mt-1 text-sm text-[color:var(--m-text-secondary)]">{selected.timestamp ? new Date(selected.timestamp * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Indexed close"}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none" role="img" aria-label={`${base}/${quote} price history`} onPointerMove={inspect} onPointerLeave={() => setActive(null)}>
        <defs><linearGradient id="pair-price-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--m-primary)" stopOpacity="0.42" /><stop offset="1" stopColor="var(--m-primary)" stopOpacity="0.04" /></linearGradient></defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}><line x1={left} x2={W - right} y1={top + (bottom - top) * tick} y2={top + (bottom - top) * tick} stroke="var(--m-border)" strokeDasharray="2 7" /><text x={W - right + 12} y={top + (bottom - top) * tick + 4} fill="var(--m-text-secondary)" fontSize="11">{fmtRate(max - (max - min) * tick, "")}</text></g>)}
        <path d={area} fill="url(#pair-price-area)" />
        <path d={line} fill="none" stroke="var(--m-primary)" strokeWidth={2.5} strokeLinejoin="round" />
        {active !== null && <><line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="var(--m-text-secondary)" strokeWidth={1} /><circle cx={x(active)} cy={y(selected.c)} r={4} fill="var(--m-surface)" stroke="var(--m-primary)" strokeWidth={2} /></>}
        <line x1={left} x2={W - right} y1={y(candles.at(-1)!.c)} y2={y(candles.at(-1)!.c)} stroke="var(--m-text-secondary-2)" strokeDasharray="4 4" />
        <rect x={W - right + 5} y={y(candles.at(-1)!.c) - 11} width={72} height={22} rx={5} fill="var(--m-text-secondary-2)" />
        <text x={W - right + 41} y={y(candles.at(-1)!.c) + 4} textAnchor="middle" fill="var(--m-background)" fontSize="11">{fmtRate(candles.at(-1)!.c, "")}</text>
        {timeTicks.map((index, tick) => (
          <text
            key={`${candles[index]!.timestamp}-${index}`}
            x={x(index)}
            y={bottom + 24}
            textAnchor={tick === 0 ? "start" : tick === timeTicks.length - 1 ? "end" : "middle"}
            fill="var(--m-text-secondary)"
            fontSize="11"
          >
            {formatTime(candles[index]!.timestamp)}
          </text>
        ))}
      </svg>
      <div className="absolute right-4 top-4 z-10 flex gap-1 rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-sm">
        {(["1D", "7D", "1M"] as ChartPeriod[]).map((option) => <button key={option} type="button" onClick={() => onPeriod(option)} className={cn("min-h-8 rounded-full px-3 font-dm-mono text-[11px]", period === option ? "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]" : "text-[color:var(--m-text-secondary)]")}>{option}</button>)}
      </div>
    </div>
  );
}

export function PairProfile({
  base,
  quote,
  /**
   * The market, resolved on the server through the UNGATED detail route.
   *
   * Do not reintroduce a lookup against `defaultSpotPairData`. That list is
   * `/api/pairs/*`, which is listing-gated, while everything that links here —
   * the search modal above all — is ungated by design. The two disagree about
   * every pre-graduation market, and the disagreement is silent: the page simply
   * reports "no market data" for a market that exists and trades.
   */
  pair,
  /** Price-grouping step for the book, computed server-side. Null when there is no pair. */
  step,
  /** Server-fetched first book. Null when that read failed; the hook refetches. */
  seed,
}: {
  base: string;
  quote: string;
  pair: SpotPair | null;
  step: string | null;
  seed: GroupedOrderbookResult | null;
}) {
  const { displayNetworkSlug } = useMarketPageContext();
  const symbol = pair?.symbol ?? `${base.toUpperCase()}/${quote.toUpperCase()}`;

  // A market the indexer has never heard of is not an error page: the pair may exist and
  // the indexer may simply be unreachable, which is its normal state right now.
  //
  // There is no "Loading markets…" branch any more, and that is the point — the pair is
  // resolved on the server before this renders, so reaching here means the detail route
  // answered 404 or could not be reached. It is never merely "not fetched yet".
  //
  // The live half is a separate component so this branch can return before any
  // data hook runs. `usePairSnapshot` needs `pair.base`/`pair.quote` to subscribe
  // at all, and hooks cannot sit behind an early return.
  if (!pair || !step) {
    return (
      <div className="mx-auto max-w-[1160px] px-5 py-16 text-center">
        <p className="mb-2 font-dm-mono text-[12px] uppercase tracking-[0.16em] text-[color:var(--m-primary)]">
          <span className="font-bold text-[color:var(--m-logo)]">Iter</span> · pair
        </p>
        <h1 className="mb-2 text-2xl font-medium tracking-tight">{symbol}</h1>
        <p className="mx-auto mb-6 max-w-md text-sm text-[color:var(--m-text-secondary)]">
          No market for this pair on this chain. It may never have been created here, or the
          indexer may be unreachable.
        </p>
        <Link
          href={buildPageUrl("explore", { slug: displayNetworkSlug })}
          className="rounded-[10px] border border-[color:var(--m-primary)] px-4 py-2 font-dm-mono text-xs text-[color:var(--m-primary)]"
        >
          Back to Explore
        </Link>
      </div>
    );
  }

  return <PairProfileLive pair={pair} step={step} seed={seed} />;
}

/**
 * The profile with a market behind it. Split from `PairProfile` purely so the
 * no-market branch above can return before any subscription starts.
 */
function PairProfileLive({
  pair,
  step,
  seed,
}: {
  pair: SpotPair;
  step: string;
  seed: GroupedOrderbookResult | null;
}) {
  const { displayNetworkSlug } = useMarketPageContext();
  const [tab, setTab] = useState<DockTab>("buy");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("chart");
  const [profileTab, setProfileTab] = useState<ProfileTab>(
    requestedView === "liquidity" || requestedView === "volume" || requestedView === "depth"
      ? requestedView
      : "price",
  );
  const [period, setPeriod] = useState<ChartPeriod>("7D");
  const { displayNetworkName } = useMarketPageContext();
  const candles = usePairCandles(displayNetworkName, pair.symbol, period);
  const liquidityRanges = usePairLiquidityRanges(
    displayNetworkName,
    pair.base.id,
    pair.quote.id,
    40,
  );

  const snapshot = usePairSnapshot({ pair, step, seed });
  const { provenance } = snapshot;

  const mid = midPrice(snapshot);
  const spread = spreadPct(snapshot);
  const depthUp = depthWithin(snapshot.asks, mid, DEPTH_BAND_PCT);
  const depthDown = depthWithin(snapshot.bids, mid, DEPTH_BAND_PCT);
  const state = bookState(snapshot);
  const symbol = pair.symbol;
  const note = bookStateNote(state, symbol);
  const change = pair.dayPriceDifferencePercentage ?? 0;
  const selectProfileTab = (next: ProfileTab) => {
    setProfileTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "price") params.delete("chart");
    else params.set("chart", next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-[1160px] px-5 pb-24 pt-8">
      <header className="mb-6">
        <p className="mb-4 flex items-center gap-2 font-dm-mono text-xs tracking-[0.06em] text-[color:var(--m-primary)]">
          <Link href={buildPageUrl("explore", { slug: displayNetworkSlug })} className="hover:underline">
            Explore
          </Link>
          <span className="text-[color:var(--m-text-secondary-2)]">/</span>
          <span className="font-bold text-[color:var(--m-logo)]">{symbol}</span>
          {/* This page can now render pre-graduation markets — it resolves through the
              ungated detail route — so it owes them the badge. "Unlisted, not hidden" is
              the standing rule: reachable, always labelled. Before the lookup changed,
              only listed markets could reach this page and the chip was unnecessary. */}
          {isUnlisted(pair) && <UnlistedChip />}
        </p>
        <div className="flex items-center gap-4">
          <PairLogo pair={pair} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-[clamp(28px,3vw,38px)] font-medium leading-none tracking-[-0.03em]">
                <AnimatedDigits value={fmtRate(pair.price, "")} /> {pair.quoteSymbol}
              </h1>
              <span className={cn("font-dm-mono text-sm font-semibold tabular-nums", change >= 0 ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>
                {change >= 0 ? "+" : "−"}<AnimatedDigits value={`${Math.abs(change).toFixed(2)}%`} /> · 24h
              </span>
            </div>
            <div className="mt-2 font-dm-mono text-xs text-[color:var(--m-text-secondary-2)]">
              1 {pair.baseSymbol} = <AnimatedDigits value={fmtRate(pair.price, "")} /> {pair.quoteSymbol}
            </div>
          </div>
        </div>
      </header>

      {/* stat strip */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-border)] sm:grid-cols-3 lg:grid-cols-5">
        <div className="bg-[color:var(--m-surface)]">
          {/* est is now conditional on the leg. These three are derived from the
              book, so they are estimates exactly when the book is. Leaving the
              marker hardcoded would stamp "est" on live depth — and a marker that
              appears on measured numbers teaches readers to ignore it everywhere,
              including on the figures that really are illustrative. */}
          <Stat label="Spread" value={formatPct(spread)} est={provenance.book} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat label={`Depth +${DEPTH_BAND_PCT}%`} value={fmtUsd(depthUp)} est={provenance.book} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat label={`Depth −${DEPTH_BAND_PCT}%`} value={fmtUsd(depthDown)} est={provenance.book} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat
            label="24h volume"
            value={fmtUsd((pair.dayBaseVolumeUSD ?? 0) + (pair.dayQuoteVolumeUSD ?? 0))}
          />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat label="TVL" value={fmtUsd((pair.dayBaseTvlUSD ?? 0) + (pair.dayQuoteTvlUSD ?? 0))} />
        </div>
      </div>

      {note && (
        <p className="mb-4 rounded-[11px] border border-dashed border-[color:var(--m-border)] px-3.5 py-2.5 text-[12.5px] text-[color:var(--m-text-secondary)]">
          {note}
        </p>
      )}

      <nav aria-label="Pool profile views" className="mb-4 flex gap-1 rounded-xl bg-[color:var(--m-surface-2)] p-1">
        {([
          ["price", "Price"],
          ["volume", "Volume"],
          ["liquidity", "Liquidity"],
          ["depth", "Depth"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={profileTab === key ? "page" : undefined}
            onClick={() => selectProfileTab(key)}
            className={cn(
              "min-h-11 rounded-lg px-5 py-2.5 text-sm font-medium transition-all active:translate-y-px",
              profileTab === key
                ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] shadow-sm"
                : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {profileTab === "liquidity" && <>
          <section className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-medium">Liquidity distribution</h2>
                <p className="mt-1 text-xs text-[color:var(--m-text-secondary)]">Everything resting at each rate — the order book, and pool ranges where the market has a pool.</p>
              </div>
              <button type="button" onClick={() => setTab("lp")} className="rounded-[9px] border border-[color:var(--m-primary)] px-3 py-2 font-dm-mono text-[11.5px] text-[color:var(--m-primary-fg)] hover:bg-[color:var(--m-surface-2)]">Liquidity →</button>
            </div>
            {liquidityRanges.isLoading ? (
              <div className="h-[340px] animate-pulse rounded-xl bg-[color:var(--m-surface-2)] motion-reduce:animate-none" />
            ) : (
              /*
                No "this market has no pool" branch any more, because the chart no
                longer needs one: the book is drawn either way, and a missing pool
                is now just a legend without a third swatch.
       
                That branch existed to stop a pool-only chart rendering blank on
                the majority of this venue's markets, and it did so by telling the
                reader to go and look at a different tab for the depth this panel
                claims to show. `liquidityRanges` failing is treated the same way —
                the pool half is unavailable, the book half is not, and refusing to
                draw the half that works helps nobody.
              */
              <LiquidityChart
                ranges={liquidityRanges.data?.ranges ?? []}
                currentPrice={liquidityRanges.data?.price || pair.price}
                base={pair.baseSymbol}
                quote={pair.quoteSymbol}
                bids={snapshot.bids}
                asks={snapshot.asks}
                hasPool={liquidityRanges.data?.poolExists === true && !liquidityRanges.isError}
              />
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[color:var(--m-border)] pt-4">
              <div>
                <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Pool APR</div>
                <div className="font-dm-mono text-[15px] font-semibold tabular-nums text-[color:var(--m-logo)]">{formatPct(snapshot.lpAprPct, 1)}{provenance.liquidity && <Est />}</div>
              </div>
              <div>
                <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Pool TVL</div>
                <div className="font-dm-mono text-[15px] font-semibold tabular-nums">{fmtUsd(snapshot.lpTvlUsd)}</div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Your position</div>
                  <div className="font-dm-mono text-[15px] font-semibold tabular-nums text-[color:var(--m-text-secondary-2)]">{snapshot.yourPositionUsd === null ? "none" : fmtUsd(snapshot.yourPositionUsd)}</div>
                </div>
              </div>
            </div>
          </section>
          </>}

          {profileTab === "price" && (
          <PairPriceChart
            base={pair.baseSymbol}
            quote={pair.quoteSymbol}
            period={period}
            candles={candles.data ?? []}
            loading={candles.isLoading}
            onPeriod={setPeriod}
          />
          )}

          {(profileTab === "depth" || profileTab === "volume") && <div className="grid gap-4">
            {profileTab === "depth" && <section className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div><h2 className="text-[15px] font-medium">Full depth {provenance.book && <Est />}</h2><p className="mt-1 text-xs text-[color:var(--m-text-secondary)]">Cumulative bids and asks across every indexed level.</p></div>
                <Link
                  href={buildPageUrl("trade", {
                    pro: true,
                    base: pair.baseSymbol,
                    quote: pair.quoteSymbol,
                    slug: displayNetworkSlug,
                  })}
                  className="font-dm-mono text-[11px] text-[color:var(--m-primary-fg)]"
                >
                  Open terminal ↗
                </Link>
              </div>
              <DepthChart bids={snapshot.bids} asks={snapshot.asks} mid={mid} quote={pair.quoteSymbol} />
              <div className="mt-3 flex justify-between font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]"><span>Bid depth {fmtUsd(depthDown)}</span><span>Mid {fmtRate(mid, pair.quoteSymbol)}</span><span>Ask depth {fmtUsd(depthUp)}</span></div>
              <div className="mt-4 grid gap-4 border-t border-[color:var(--m-border)] pt-4 md:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/25 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-medium">Order book</h3>
                    <span className="font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">Rate · amount</span>
                  </div>
                  <BookSide levels={snapshot.asks.slice(0, 4)} side="ask" quote={pair.quoteSymbol} />
                  <div className="my-1.5 flex items-center justify-between border-y border-[color:var(--m-border)] px-2 py-1.5">
                    <span className="font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">Mid</span>
                    <span className="font-dm-mono text-xs tabular-nums">{fmtRate(mid, pair.quoteSymbol)}</span>
                  </div>
                  <BookSide levels={snapshot.bids.slice(0, 4)} side="bid" quote={pair.quoteSymbol} />
                </div>
                <div className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/25 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-medium">Recent trades {provenance.trades && <Est />}</h3>
                    <span className="font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">Rate · amount · time</span>
                  </div>
                  <div className="flex flex-col gap-px">
                    {snapshot.trades.slice(0, 9).map((trade, index) => (
                      <div key={`${trade.txHash}-${index}`} className="grid grid-cols-[1fr_0.8fr_auto] items-center gap-3 px-2 py-[4px] text-[11px]">
                        <span className={cn("font-dm-mono tabular-nums", trade.side === "Buy" ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{fmtRate(trade.price, "")}</span>
                        <span className="text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">{trade.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                        <span className="font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">{new Date(trade.timestamp * 1000).toISOString().slice(11, 19)}</span>
                      </div>
                    ))}
                    {snapshot.trades.length === 0 && <div className="py-8 text-center text-xs text-[color:var(--m-text-secondary-2)]">No indexed trades yet.</div>}
                  </div>
                </div>
              </div>
            </section>}

            {profileTab === "volume" && <section className="rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div><h2 className="text-[15px] font-medium">Volume</h2><p className="mt-1 text-xs text-[color:var(--m-text-secondary)]">Indexed USD trading volume for the selected period.</p></div>
                <div className="flex gap-8 text-right">
                  <div><div className="text-xs text-[color:var(--m-text-secondary)]">Accrued LP fees · 24h</div><div className="mt-1 font-dm-mono text-lg tabular-nums text-[color:var(--m-logo)]">{snapshot.accruedFees24hQuote === null ? "—" : `${snapshot.accruedFees24hQuote.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${pair.quoteSymbol}`}{provenance.liquidity && <Est />}</div></div>
                </div>
              </div>
              {candles.isLoading ? <div className="h-[420px] animate-pulse rounded-2xl bg-[color:var(--m-surface-2)] motion-reduce:animate-none" /> : <VolumeChart candles={candles.data ?? []} period={period} onPeriod={setPeriod} />}
            </section>}
          </div>}

        </div>

        <aside className="lg:sticky lg:top-4">
          {/* No caption. It read "Read here, act on the right. The dock is the
              same one Explore uses — re-binding it never navigates", which
              describes the app's own architecture to someone trying to trade. A
              layout that needs a sentence explaining where to look has a layout
              problem, and this one does not. */}
          <ActionDock pair={pair} tab={tab} onTabChange={setTab} />
        </aside>
      </div>
    </div>
  );
}
