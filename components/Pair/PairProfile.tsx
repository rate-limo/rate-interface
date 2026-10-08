"use client";

import { marketParam } from "@/lib/routing/proMarket";
import { chartTicker } from "@/lib/chart/ticker";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChainBadge, TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { ActionDock, type DockTab } from "@/components/Explore/ActionDock";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { BreadcrumbNav } from "@/components/Atoms/BreadCrumbNav";
import {
  bookState,
  bookStateNote,
  depthCurveSide,
  depthWithin,
  depthAnchor,
  formatPct,
  levelWidthPct,
  midPrice,
  withPoolQuotes,
  midReadout,
  poolDepthWithin,
  poolSideInventory,
  poolTvlUsd,
  spreadPct,
} from "@/lib/pair/derive";
import type { DepthSample, PoolBand } from "@/lib/pair/derive";
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
 * Marks a market Rate has not listed.
 *
 * Same wording and title text as the search modal's chip — a reader who follows a hit
 * from search to here must not be told two different things about the same market.
 */
function UnlistedChip() {
  return (
    <span
      title="Not listed by Rate — anyone can deploy a token and open a market"
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

/**
 * One header figure, which FLASHES when it changes.
 *
 * The values here have always been live — `usePairSnapshot` maintains them over
 * `spotOrderbook:{pair}` and `spotTrade:{pair}`, so a fill moves them within a
 * frame. What was missing is the same thing the token profile's `LiveStat`
 * exists to say: that the number just moved. A figure that swaps silently is
 * indistinguishable from one that never moves, and on a market this quiet a
 * reader watching their own trade land saw the digits change only if they
 * happened to be looking at that tile.
 *
 * Same 900ms tint and the same rule as `LiveStat`: keyed on the FORMATTED
 * string, never the raw number, so the flash always corresponds to a digit the
 * reader can actually find. The first render is not a change.
 */
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
  const key = typeof value === "string" || typeof value === "number" ? String(value) : null;
  const [flash, setFlash] = useState(false);
  const previous = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = key;
    if (key === null || before === null || before === key) return;
    setFlash(false);
    // Cleared before it is set again, or a second change inside the window does
    // not restart the animation and the tile appears to miss a tick.
    if (timer.current) clearTimeout(timer.current);
    const raf = requestAnimationFrame(() => setFlash(true));
    timer.current = setTimeout(() => setFlash(false), 950);
    return () => {
      cancelAnimationFrame(raf);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key]);

  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors duration-500",
        flash && "bg-[color:var(--m-surface-2)]",
      )}
    >
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

export function BookSide({
  levels,
  side,
  quote,
  base,
  pool,
}: {
  levels: BookLevel[];
  side: "bid" | "ask";
  quote: string;
  base: string;
  /**
   * The band pool's inventory on this side, or null where it holds none.
   *
   * Its OWN line rather than a row among the resting orders. A band is a
   * continuum — it holds an amount across an interval — so writing it into a
   * ladder of discrete prices would invent a resting order that nobody placed,
   * at a price nobody chose. Measured on Arc, a band is ±0.02% wide, narrower
   * than the gap between two adjacent rows here: there is no row it belongs in,
   * and the interval is the honest thing to print.
   *
   * WHERE that line goes is a separate question — see `poolFirst` below.
   */
  pool: { amount: number; minPrice: number; maxPrice: number } | null;
}) {
  const rows = side === "ask" ? [...levels].slice(0, 6).reverse() : levels.slice(0, 6);
  const color = side === "bid" ? "var(--m-success)" : "var(--m-error)";

  /**
   * The pool line sits against the MARKET divider, on both sides.
   *
   * This ladder is ordered by distance from the market, and the pool line used
   * to be rendered after the rows whatever side it was on. Asks reverse their
   * rows, so best-ask lands at the bottom and the pool followed it into the
   * right place by accident; bids run best-first from the top, so the pool ended
   * up furthest from the market, printed beneath an order four percent away.
   *
   * Backwards, because the pool is the closest liquidity there is. On Arc's
   * TITER/USDC its bands span 1.0192–1.0212 and straddle the market at 1.0202
   * while the resting bid is at 0.98, so the card read as though that order
   * would fill first. It generalises: a band's width is a fraction of the pair's
   * slippage limit, so it is always tighter than any order resting outside the
   * spread.
   */
  const poolFirst = side === "bid";

  /**
   * The pool's line AND its caption, together.
   *
   * They were apart: one caption at the foot of the side described both the
   * resting rows and the pool line. Once the pool moved to the top of the bid
   * ladder that left "pool in USDC across its own range" printed under an order
   * four percent away, describing nothing next to it. Each caption now sits with
   * what it describes.
   */
  const poolLine = pool ? (
    /*
      The dashed rule bounds the WHOLE pool section — the line and its caption —
      so the caption sits inside it rather than below it. With the border on the
      row alone, a bid (where the section leads) pushed its own small print out
      the other side of the rule and in among the resting orders.
    */
    <div
      data-testid={`book-pool-${side}`}
      className={cn(
        "border-dashed border-[color:var(--m-border)]",
        poolFirst ? "mb-1 border-b pb-1.5" : "mt-1 border-t pt-1.5",
      )}
    >
    <div className="flex items-center justify-between gap-2 px-2 text-[11px]">
      <span
        className="inline-flex items-center gap-1.5 font-dm-mono text-[color:var(--m-text-secondary)]"
        style={{
          // Hatched in the side's own colour, matching the depth chart above.
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, color-mix(in srgb, ${color} 22%, transparent) 3px, color-mix(in srgb, ${color} 22%, transparent) 5px)`,
          backgroundClip: "content-box",
        }}
      >
        pool
      </span>
      <span className="font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
        {pool.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
        {/* An ask fills from the pool's BASE inventory and a bid from its QUOTE,
            so each side names the leg it would actually consume. */}
        {side === "ask" ? base : quote} · {fmtRate(pool.minPrice, "")}–{fmtRate(pool.maxPrice, "")}
      </span>
    </div>
      {/* ALL of the side's small print, in one place, inside the pool section.
          Splitting it left one line up here and the other at the foot of the
          side, which on a bid put them either end of a resting order. */}
      <div className="px-2 pt-1 font-dm-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        {side === "bid" ? "bids" : "asks"} · size in base, price in {quote} ·{" "}
        {/* An ask fills from the pool's BASE inventory and a bid from its QUOTE,
            so this names a different token from "size in base" above on a bid. */}
        pool in {side === "ask" ? base : quote} across its own range
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-px" data-testid={`book-side-${side}`}>
      {poolFirst && poolLine}
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
      {!poolFirst && poolLine}
      {/* Only when there is no pool section to carry it — see `poolLine`, which
          holds the whole caption whenever one is rendered. */}
      {!pool && (
        <div className="mt-1 px-2 font-dm-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
          {side === "bid" ? "bids" : "asks"} · size in base, price in {quote}
        </div>
      )}
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
            {/* Only the sources actually present in THIS bin — a row of zeroes
                under every hover is noise, and it hides the one line that moved.
                POOL is the exception and always shows. This chart bins by rate
                while the depth curve below accumulates from the market, so the
                two legitimately print different pool figures at the same price;
                omitting the row here left that reading as "not measured" when it
                is measured and genuinely zero, which is what made the two charts
                look like they disagreed. */}
            {SERIES.filter((series) => series.key === "pool" || selected[series.key] > 0).map((series) => (
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

/**
 * Cumulative depth from BOTH venues, centered on the mid: the order book's
 * staircase, and the band pool stacked on top of it.
 *
 * ## One unit, because the footer underneath is in it
 *
 * This drew cumulative BASE size while the figures printed directly below it —
 * "Bid depth", "Ask depth" — were quote notional from `depthWithin`. Two numbers
 * about the same market, in two units, three lines apart. Now that those figures
 * include the pool as well, the gap would have widened into a chart that
 * contradicts its own caption, so the curve is quote-denominated too: a level
 * contributes `size x price`, exactly as `depthWithin` sums it, and the axis
 * finally means the same thing as the text.
 *
 * The book's series is a STAIRCASE and the pool's is a RAMP, and that difference
 * is real rather than cosmetic. An order rests at one price, so crossing it adds
 * all of it at once; a band spans prices, so walking further into it collects
 * proportionally more. Drawing the pool as a step would claim it fills all at
 * once at an edge it does not have.
 *
 * Pool depth is hatched in the SIDE's own colour rather than given a third hue —
 * the same rule `lib/swap/depth.ts` applies on the swap card. It is not a third
 * kind of liquidity, it is the same depth from another venue.
 */
export function DepthChart({
  bids,
  asks,
  bands,
  mid,
  quote,
}: {
  bids: BookLevel[];
  asks: BookLevel[];
  bands: PoolBand[];
  mid: number | null;
  quote: string;
}) {
  const [hovered, setHovered] = useState<DepthSample | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const left = [...bids].filter((level) => level.price > 0 && level.size > 0).sort((a, b) => a.price - b.price);
  const right = [...asks].filter((level) => level.price > 0 && level.size > 0).sort((a, b) => a.price - b.price);
  const usableBands = bands.filter((band) => band.maxPrice > band.minPrice);
  const levels = [...left, ...right];
  // A pool with no book is still a chart. This used to bail on `!levels.length`,
  // which on a pool-only market drew the "no resting depth" placeholder over
  // liquidity that was sitting right there.
  if (!levels.length && !usableBands.length) return <EmptyChart>No resting depth for this pair.</EmptyChart>;

  const prices = [
    ...levels.map((level) => level.price),
    ...usableBands.flatMap((band) => [band.minPrice, band.maxPrice]),
  ];
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const center = mid && mid > 0 ? mid : (rawMin + rawMax) / 2;
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

  /*
   * The sampling lives in `lib/pair/derive` so that "does pool liquidity reach
   * the chart" is a question a unit test can ask. Everything below this line is
   * coordinates and colour.
   */
  const leftSamples = depthCurveSide(left, usableBands, center, minPrice, "bid");
  const rightSamples = depthCurveSide(right, usableBands, center, maxPrice, "ask");
  const maxDepth = Math.max(
    ...leftSamples.map((s) => s.book + s.pool),
    ...rightSamples.map((s) => s.book + s.pool),
    1e-9,
  );
  const x = (price: number) => CHART_PAD + ((price - minPrice) / span) * (CHART_W - CHART_PAD * 2);
  const y = (depth: number) => CHART_H - CHART_PAD - (depth / maxDepth) * (CHART_H - CHART_PAD * 2);

  const curve = (samples: DepthSample[], pick: (s: DepthSample) => number) =>
    samples.map((s, index) => `${index ? "L" : "M"} ${x(s.price)},${y(pick(s))}`).join(" ");
  const area = (samples: DepthSample[], pick: (s: DepthSample) => number) => {
    if (!samples.length) return "";
    const base = CHART_H - CHART_PAD;
    return `${curve(samples, pick)} L ${x(samples.at(-1)!.price)},${base} L ${x(samples[0]!.price)},${base} Z`;
  };
  /**
   * The pool's slice: the ribbon between the book's curve and the total.
   *
   * Empty rather than degenerate where there is no pool. Without the guard the
   * two edges coincide and this emits a zero-area hatched path lying exactly on
   * the book's own curve — invisible, but a real node claiming pool depth on a
   * market that has none, and the kind of thing that starts intercepting hit
   * tests the moment the chart gains one.
   */
  const ribbon = (samples: DepthSample[]) => {
    if (!samples.length || !samples.some((s) => s.pool > 0)) return "";
    const top = curve(samples, (s) => s.book + s.pool);
    const back = [...samples]
      .reverse()
      .map((s) => `L ${x(s.price)},${y(s.book)}`)
      .join(" ");
    return `${top} ${back} Z`;
  };

  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const localX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const localY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const svgX = (localX / bounds.width) * CHART_W;
    const price = minPrice + ((svgX - CHART_PAD) / (CHART_W - CHART_PAD * 2)) * span;
    const samples = price <= center ? leftSamples : rightSamples;
    const nearest = samples.reduce<DepthSample | null>(
      (best, sample) =>
        !best || Math.abs(sample.price - price) < Math.abs(best.price - price) ? sample : best,
      null,
    );
    setHovered(nearest);
    setPointer({ x: Math.max(12, Math.min(bounds.width - 12, localX)), y: Math.max(12, Math.min(bounds.height - 12, localY)) });
  };
  const pointerRatio = pointer && chartRef.current ? pointer.x / chartRef.current.clientWidth : 0.5;
  const shiftX = pointerRatio < 0.3 ? "0" : pointerRatio > 0.7 ? "-100%" : "-50%";
  const distancePct = hovered && center > 0 ? ((hovered.price - center) / center) * 100 : null;
  const hoveredSide = hovered && hovered.price <= center ? "bid" : "ask";
  return (
    <div ref={chartRef} className="relative overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/35 p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block h-auto w-full touch-none" role="img" aria-label={`Cumulative ${quote} depth — order book and pool`} onPointerMove={inspect} onPointerLeave={() => { setHovered(null); setPointer(null); }}>
        <defs>
          {/* Hatch, not a third hue: the pool is the same depth from another venue. */}
          {(["bid", "ask"] as const).map((side) => (
            <pattern key={side} id={`depth-pool-${side}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill={side === "bid" ? "var(--m-success)" : "var(--m-error)"} fillOpacity={0.12} />
              <line x1="0" y1="0" x2="0" y2="7" stroke={side === "bid" ? "var(--m-success)" : "var(--m-error)"} strokeWidth="2.5" strokeOpacity={0.5} />
            </pattern>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((tick) => <line key={tick} x1={CHART_PAD} x2={CHART_W - CHART_PAD} y1={CHART_H * tick} y2={CHART_H * tick} stroke="var(--m-border)" strokeDasharray="2 6" />)}
        <path d={area(leftSamples, (s) => s.book)} fill="var(--m-success)" fillOpacity={0.22} stroke="none" />
        <path d={area(rightSamples, (s) => s.book)} fill="var(--m-error)" fillOpacity={0.22} stroke="none" />
        <path d={ribbon(leftSamples)} fill="url(#depth-pool-bid)" stroke="none" />
        <path d={ribbon(rightSamples)} fill="url(#depth-pool-ask)" stroke="none" />
        <path d={curve(leftSamples, (s) => s.book)} fill="none" stroke="var(--m-success)" strokeWidth={3.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={curve(rightSamples, (s) => s.book)} fill="none" stroke="var(--m-error)" strokeWidth={3.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
        <div className="pointer-events-none absolute z-10 min-w-[230px] rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-3 shadow-lg" style={{ left: pointer.x, top: pointer.y, transform: `translate(${shiftX}, ${pointer.y < 145 ? "14px" : "calc(-100% - 12px)"})` }}>
          <div className="mb-2 flex items-center justify-between text-xs"><span className="text-[color:var(--m-text-secondary)]">Range</span><span className={cn("font-dm-mono tabular-nums", (distancePct ?? 0) <= 0 ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{distancePct !== null && distancePct >= 0 ? "+" : ""}{distancePct?.toFixed(2)}%</span></div>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <span className="text-[color:var(--m-text-secondary)]">Rate</span><span className="text-right font-dm-mono tabular-nums">{fmtRate(hovered.price, quote)}</span>
            <span className="text-[color:var(--m-text-secondary)]">Order book</span><span className={cn("text-right font-dm-mono tabular-nums", hoveredSide === "bid" ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{hovered.book.toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}</span>
            {/* The pool line appears only where there IS pool depth. A zero under
                every hover is noise, and it hides the line that moved. */}
            {hovered.pool > 0 && <>
              <span className="text-[color:var(--m-text-secondary)]">Pool</span><span className="text-right font-dm-mono tabular-nums">{hovered.pool.toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}</span>
            </>}
          </div>
          <div className="mt-2 flex justify-between border-t border-[color:var(--m-border)] pt-2 font-dm-mono text-[11px]"><span className="text-[color:var(--m-text-secondary-2)]">Total</span><span>{(hovered.book + hovered.pool).toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote}</span></div>
          {/* States the SCOPE of the two figures above, where they are read. Both
              are cumulative from the market rate, while the liquidity chart's
              identically-named Pool series is per rate bin — so the same pool
              reads as two different numbers at one price, correctly, and this is
              the line that says why. */}
          <div className="mt-1.5 font-dm-mono text-[9.5px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">cumulative from the market rate</div>
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
    <div ref={chartRef} className="relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2 sm:block">
      <div className="pointer-events-none relative z-10 order-1 px-3 pt-2 sm:absolute sm:left-6 sm:top-5 sm:p-0"><div className="text-[clamp(24px,3vw,34px)] font-medium tracking-[-0.03em]"><AnimatedDigits value={fmtUsd(selected?.volumeUsd ?? total)} /></div><div className="mt-1 text-sm text-[color:var(--m-text-secondary)]">{selected?.timestamp ? formatTime(selected.timestamp) : period === "1D" ? "Past day" : period === "7D" ? "Past week" : "Past month"}</div></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="order-3 block h-auto w-full touch-none" role="img" aria-label="USD trading volume" onPointerMove={inspect} onPointerLeave={() => setActive(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}><line x1={left} x2={W - right} y1={top + (bottom - top) * tick} y2={top + (bottom - top) * tick} stroke="var(--m-border)" strokeDasharray="2 7" /><text x={W - right + 12} y={top + (bottom - top) * tick + 4} fill="var(--m-text-secondary)" fontSize="11">{fmtUsd(maxVolume * (1 - tick))}</text></g>)}
        {candles.map((bar, index) => {
          const height = Math.max(1, (bar.volumeUsd / maxVolume) * (bottom - top));
          return <rect className="liquidity-bar-draw" style={{ animationDelay: `${index * 16}ms` }} key={`${bar.timestamp}-${index}`} x={left + index * slot + slot * 0.1} y={bottom - height} width={Math.max(2, slot * 0.8)} height={height} fill="var(--m-logo)" opacity={active === null || active === index ? 0.9 : 0.55} />;
        })}
        {active !== null && <line x1={left + (active + 0.5) * slot} x2={left + (active + 0.5) * slot} y1={top} y2={bottom} stroke="var(--m-text-secondary)" strokeWidth={1} />}
        {timeTicks.map((index, tick) => <text key={`${candles[index]!.timestamp}-${index}`} x={tick === timeTicks.length - 1 ? W - right : left + (index + 0.5) * slot} y={bottom + 24} textAnchor={tick === 0 ? "start" : tick === timeTicks.length - 1 ? "end" : "middle"} fill="var(--m-text-primary)" fontSize="12">{formatTime(candles[index]!.timestamp)}</text>)}
      </svg>
      <div className="relative z-10 order-2 mx-3 mt-2 flex gap-1 self-start rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-sm sm:absolute sm:right-4 sm:top-4 sm:m-0">{(["1D", "7D", "1M"] as ChartPeriod[]).map((option) => <button key={option} type="button" onClick={() => onPeriod(option)} className={cn("min-h-8 rounded-full px-3 font-dm-mono text-[11px]", period === option ? "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-primary)]" : "text-[color:var(--m-text-secondary)]")}>{option}</button>)}</div>
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
    <div ref={chartRef} className="relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-2 sm:block">
      <div className="pointer-events-none relative z-10 order-1 px-3 pt-2 sm:absolute sm:left-6 sm:top-5 sm:p-0">
        <div className="flex items-baseline gap-3"><span className="text-[clamp(22px,3vw,34px)] font-medium tracking-[-0.03em]">1 {base} = <AnimatedDigits value={fmtRate(selected.c, "")} /> {quote}</span><span className={cn("font-dm-mono text-sm", change >= 0 ? "text-[color:var(--m-success-fg)]" : "text-[color:var(--m-error-fg)]")}>{change >= 0 ? "▲" : "▼"} <AnimatedDigits value={`${Math.abs(change).toFixed(2)}%`} /></span></div>
        <div className="mt-1 text-sm text-[color:var(--m-text-secondary)]">{selected.timestamp ? new Date(selected.timestamp * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Indexed close"}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="order-3 block h-auto w-full touch-none" role="img" aria-label={`${base}/${quote} price history`} onPointerMove={inspect} onPointerLeave={() => setActive(null)}>
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
      <div className="relative z-10 order-2 mx-3 mt-2 flex gap-1 self-start rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-1 shadow-sm sm:absolute sm:right-4 sm:top-4 sm:m-0">
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
          <span className="font-bold text-[color:var(--m-logo)]">Rate</span> · pair
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
  const candles = usePairCandles(displayNetworkName, chartTicker(pair), period);
  const liquidityRanges = usePairLiquidityRanges(
    displayNetworkName,
    pair.base.id,
    pair.quote.id,
    40,
  );

  const snapshot = usePairSnapshot({ pair, step, seed });
  const { provenance } = snapshot;

  /*
   * The pool's bands, read ONCE and handed to every surface that owes the reader
   * an answer about pool liquidity: the two depth stats, the depth curve and the
   * ladder. `usePairLiquidityRanges` was already mounted here for the liquidity
   * chart and nothing else looked at it, which is why a market whose depth sat
   * in a band showed it on one tab and denied it on the other two.
   *
   * Three states, not two, and the distinction is the one `poolExists` was added
   * for: no pool at all contributes nothing and claims nothing; a pool that
   * exists and holds no bands contributes zero, which is a measurement; a FAILED
   * read contributes nothing but marks the figures `est`, because "we could not
   * look" must not render as "we looked and found none".
   */
  const poolUnavailable = liquidityRanges.isError;
  const poolBands: PoolBand[] =
    liquidityRanges.data?.poolExists === true && !poolUnavailable
      ? (liquidityRanges.data.ranges ?? [])
      : [];
  const poolTvl = poolUnavailable
    ? null
    : poolTvlUsd(
        liquidityRanges.data?.totalBase,
        liquidityRanges.data?.totalQuote,
        pair.price,
        pair.quote?.priceUSD,
      );

  // The book's best quotes with the pool's folded in: the pool bids and offers
  // at its own price, often inside the book's spread (see `withPoolQuotes`).
  const quotes = withPoolQuotes(snapshot, poolBands, liquidityRanges.data?.price);
  const mid = midPrice(quotes);
  /*
   * What to PRINT where the book's centre goes, and what to call it.
   *
   * `mid` stays null on a one-sided book, which is right for the spread beside
   * it. It was wrong for the readout: the depth figures and the curve are both
   * measured from `depthAnchor`, so a market with an empty ask side showed an
   * em-dash under a chart drawn around the very rate the header prints. Two
   * different numbers had one label; now each says which it is.
   */
  const centre = midReadout(quotes, pair.price);
  const spread = spreadPct(quotes);
  /*
   * Depth is anchored on `depthAnchor`, NOT on `mid`, and the two differ exactly
   * when it matters: a one-sided book has no mid, and anchoring on it blanked
   * both depth figures — including the side that was holding real resting
   * orders. `mid` still drives the Mid readout below, where a dash is the
   * honest answer.
   */
  const anchor = depthAnchor(quotes, pair.price);
  /*
   * Both venues, in one figure, because "depth within 2%" is a question about the
   * MARKET rather than about the order book — a taker crossing that band fills
   * from whichever side of it holds the liquidity, and quoting only the book
   * understated every banded market on the venue.
   *
   * The book leg still decides whether there is an answer at all: `null` there
   * means no anchor, and a pool figure alone would be a depth reading with no
   * price to measure it from.
   */
  const bookUp = depthWithin(snapshot.asks, anchor, DEPTH_BAND_PCT);
  const bookDown = depthWithin(snapshot.bids, anchor, DEPTH_BAND_PCT);
  const poolUp = poolDepthWithin(poolBands, anchor, DEPTH_BAND_PCT, "ask");
  const poolDown = poolDepthWithin(poolBands, anchor, DEPTH_BAND_PCT, "bid");
  const depthUp = bookUp === null ? null : bookUp + (poolUp ?? 0);
  const depthDown = bookDown === null ? null : bookDown + (poolDown ?? 0);
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
        {/*
          The SHARED breadcrumb, same as the token profile's.

          This was a hand-rolled `<p>` of `<span>`s with a literal `/`: two
          levels where the token page has four, no `<nav>`, no `<ol>`, no
          `aria-current` — a lookalike that read as a breadcrumb to a sighted
          user and as nothing at all to a crawler or a screen reader. The
          component only ever needed a label, so it takes one now.
        */}
        <div className="flex items-center gap-2">
          <BreadcrumbNav
            label={symbol}
            networkName={displayNetworkName}
            section="pools"
            sectionLabel="Pools"
          />
          {/* This page can now render pre-graduation markets — it resolves through the
              ungated detail route — so it owes them the badge. "Unlisted, not hidden" is
              the standing rule: reachable, always labelled. Before the lookup changed,
              only listed markets could reach this page and the chip was unnecessary. */}
          {isUnlisted(pair) && <span className="mb-6"><UnlistedChip /></span>}
        </div>
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
      {/* On phones (2 columns) an odd last stat spans both, instead of leaving an
          empty cell beside TVL. */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-border)] max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="bg-[color:var(--m-surface)]">
          {/* est is now conditional on the leg. These three are derived from the
              book, so they are estimates exactly when the book is. Leaving the
              marker hardcoded would stamp "est" on live depth — and a marker that
              appears on measured numbers teaches readers to ignore it everywhere,
              including on the figures that really are illustrative. */}
          <Stat label="Spread" value={formatPct(spread)} est={provenance.book} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          {/* Now that these count the pool too, a failed pool read makes them
              partial — so the marker follows EITHER leg being unavailable. The
              spread above stays book-only and keeps its own condition. */}
          <Stat label={`Depth +${DEPTH_BAND_PCT}%`} value={fmtUsd(depthUp)} est={provenance.book || poolUnavailable} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat label={`Depth −${DEPTH_BAND_PCT}%`} value={fmtUsd(depthDown)} est={provenance.book || poolUnavailable} />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          <Stat
            label="24h volume"
            value={fmtUsd((pair.dayBaseVolumeUSD ?? 0) + (pair.dayQuoteVolumeUSD ?? 0))}
          />
        </div>
        <div className="bg-[color:var(--m-surface)]">
          {/* The pair row's `dayBaseTvlUSD`/`dayQuoteTvlUSD` are written only by the
              ORDER BOOK processors — `OrderPlaced`, `OrderCanceled`, `OrderMatched`
              — so this was book TVL under a whole-market label. The pool's is
              added rather than merged into `snapshot.lpTvlUsd`, which stays book
              TVL so the two venues remain separable below. */}
          <Stat
            label="TVL"
            value={fmtUsd((pair.dayBaseTvlUSD ?? 0) + (pair.dayQuoteTvlUSD ?? 0) + (poolTvl ?? 0))}
            est={poolUnavailable}
          />
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
                {/* This printed `snapshot.lpTvlUsd`, which is the pair row's book TVL,
                    under the label "Pool TVL" — the one number on the page that named
                    the pool and measured the book. It is the band pool's own value
                    now, and null rather than zero without a quote USD price, the same
                    rule `yourPositionUsd` beside it already follows. */}
                <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Pool TVL</div>
                <div className="font-dm-mono text-[15px] font-semibold tabular-nums">{fmtUsd(poolTvl)}{poolUnavailable && <Est />}</div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Your position</div>
                  <div
                    data-testid="pair-your-position"
                    /* How many band positions this wallet holds here. 0 with a
                       connected wallet is the signature of the bug this panel
                       replaced, so it is worth being readable from a test. */
                    data-positions={snapshot.yourPositionCount}
                    className={cn(
                      "font-dm-mono text-[15px] font-semibold tabular-nums",
                      snapshot.yourPositionUsd === null
                        ? "text-[color:var(--m-text-secondary-2)]"
                        : "text-[color:var(--m-text-primary)]",
                    )}
                  >
                    {/*
                      THREE states, not two. "none" is a measured fact about the
                      wallet; an em-dash is a position whose value the broker has
                      not snapshotted yet, which is every position for its first
                      minute. Printing "none" there tells a wallet that just
                      deposited that it has nothing — the exact claim this panel
                      was rebuilt to stop making.
                    */}
                    {snapshot.yourPositionUsd !== null
                      ? fmtUsd(snapshot.yourPositionUsd)
                      : snapshot.yourBands
                        ? "—"
                        : "none"}
                  </div>
                </div>
              </div>
              {snapshot.yourFeesUsd !== null && snapshot.yourFeesUsd > 0 && (
                <div>
                  <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">Your fees</div>
                  <div className="font-dm-mono text-[15px] font-semibold tabular-nums text-[color:var(--m-logo)]">{fmtUsd(snapshot.yourFeesUsd)}</div>
                </div>
              )}
            </div>

            {/*
              THE LADDER, and the reason it is a list rather than one more figure
              in the row above.

              A band position is not a number. One ERC-1155 token holds a whole
              ladder, and WHICH rungs it funds is the decision the LP made — a
              total hides exactly the part they chose. The row above keeps the
              total, because that is the number you compare against Pool TVL;
              this says where it sits.

              It renders only for a wallet that holds one. A reader with no
              position has nothing to learn from an empty ladder.
            */}
            {snapshot.yourBands && (
              <div
                data-testid="pair-band-ladder"
                data-bands={snapshot.yourBands.length}
                className="mt-3 flex flex-col gap-1.5 border-t border-[color:var(--m-border)] pt-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
                    Your bands
                  </div>
                  {snapshot.yourPositionCount > 1 && (
                    <div className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
                      across {snapshot.yourPositionCount} positions
                    </div>
                  )}
                </div>
                {snapshot.yourBands.map((rung) => (
                  <div key={rung.band} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-[54px] flex-none font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                      {rung.toleranceFrac === null ? `#${rung.band}` : `±${(rung.toleranceFrac * 100).toFixed(2)}%`}
                    </span>
                    {/*
                      Width is the band's share of THIS position, so the rungs read
                      against each other. Floored at 2% so a small band is still a
                      mark rather than nothing — a rung that renders as zero width
                      reads as a missing row.
                    */}
                    <span
                      className="h-[6px] flex-none rounded-[2px] bg-[color:var(--m-logo)]"
                      style={{ width: `${Math.max(2, Math.min(100, rung.sharePct)) * 0.45}%` }}
                    />
                    {rung.open === false && (
                      <span className="font-dm-mono text-[10px] text-[color:var(--m-text-secondary-2)]">closed</span>
                    )}
                    <span className="ml-auto font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                      {rung.valueUsd > 0 ? fmtUsd(rung.valueUsd) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
                <div><h2 className="text-[15px] font-medium">Full depth {(provenance.book || poolUnavailable) && <Est />}</h2><p className="mt-1 text-xs text-[color:var(--m-text-secondary)]">Cumulative depth in {pair.quoteSymbol} — every indexed book level, and the pool's bands stacked on top.</p></div>
                <Link
                  href={buildPageUrl("trade", {
                    pro: true,
                    base: marketParam({ id: pair.base?.id, symbol: pair.baseSymbol }),
                    quote: marketParam({ id: pair.quote?.id, symbol: pair.quoteSymbol }),
                    slug: displayNetworkSlug,
                  })}
                  className="font-dm-mono text-[11px] text-[color:var(--m-primary-fg)]"
                >
                  Open terminal ↗
                </Link>
              </div>
              {/*
                `anchor`, not `mid`, and for the same reason the depth figures use
                it: a one-sided book has no mid, and the chart's own fallback is
                the midpoint of the DATA rather than the market rate. The two
                figures printed directly underneath are measured from `anchor`, so
                centring the curve anywhere else puts the caption and the plot on
                different prices — and swings the pool's side split with it, which
                lands the hatched ribbon on the wrong side of the line.

                The `Mid` readout below keeps `mid` and its em-dash. "There is no
                mid" is the honest answer there; it is not an answer a curve can be
                drawn from.
              */}
              <DepthChart bids={snapshot.bids} asks={snapshot.asks} bands={poolBands} mid={anchor} quote={pair.quoteSymbol} />
              <div className="mt-3 flex justify-between font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]"><span>Bid depth {fmtUsd(depthDown)}</span><span>{centre.label} {fmtRate(centre.value, pair.quoteSymbol)}</span><span>Ask depth {fmtUsd(depthUp)}</span></div>
              <div className="mt-4 grid gap-4 border-t border-[color:var(--m-border)] pt-4 md:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]/25 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-medium">Order book</h3>
                    <span className="font-dm-mono text-[9.5px] text-[color:var(--m-text-secondary-2)]">Rate · amount</span>
                  </div>
                  <BookSide levels={snapshot.asks.slice(0, 4)} side="ask" quote={pair.quoteSymbol} base={pair.baseSymbol} pool={poolSideInventory(poolBands, "ask")} />
                  <div className="my-1.5 flex items-center justify-between border-y border-[color:var(--m-border)] px-2 py-1.5">
                    <span className="font-dm-mono text-[9.5px] uppercase text-[color:var(--m-text-secondary-2)]">{centre.label}</span>
                    <span className="font-dm-mono text-xs tabular-nums">{fmtRate(centre.value, pair.quoteSymbol)}</span>
                  </div>
                  <BookSide levels={snapshot.bids.slice(0, 4)} side="bid" quote={pair.quoteSymbol} base={pair.baseSymbol} pool={poolSideInventory(poolBands, "bid")} />
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
