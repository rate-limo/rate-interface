"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/utils";
import { getApiUrl, getWsUrl } from "@/lib/realtime/ws-url";
import { getSocketManager } from "@/lib/realtime/socket-manager";
import { streamToEvent } from "@/types/streams";
import { pairRoomString, tokenRoomString } from "@/utils/datafeed";
import { parseTradingViewSymbol } from "@iter/types";
import type { SpotBarEvent } from "@/types";
import {
  FAN_STEP,
  clusterMarks,
  placeCard,
  type MarkCluster,
  type ThesisMark,
} from "@/lib/chart/marks";
import { MarkCard } from "./MarkCard";
import { candleColors } from "@/lib/chart/candleColors";

/**
 * The token profile's price chart, with callouts drawn on it.
 *
 * ## Why this is not the TradingView widget
 *
 * It was, and it could not do this. `TradingViewChart` is Charting Library
 * v28.4.0, whose marks are `Mark` objects: a circle, an avatar, and a
 * PLAIN-TEXT tooltip. The library exposes no mark-click callback and no
 * time/price-to-pixel conversion, so a styled card and a click-through are both
 * unreachable from inside it — and, worse for the common case, it MERGES marks
 * that share a bar into one mark whose tooltip is every body concatenated. Three
 * callouts on one candle rendered as one circle and one run-on string.
 *
 * Lightweight Charts draws the same candles and gives up
 * `timeScale().timeToCoordinate()` and `series.priceToCoordinate()`, which is
 * all it takes to put our own DOM over the right candle. The marks below are
 * ordinary React elements: they hover, they focus, they click.
 *
 * ## What this costs, deliberately
 *
 * The drawing tools, the indicator set and the symbol search go with the widget.
 * `/trade/pro` keeps `TradingViewChart` for exactly that reason — a terminal
 * needs them and a profile does not. Do not "unify" these two: they are two
 * charts because they answer to two different readers.
 *
 * ## Bars stream, and forgetting that is how this regressed once
 *
 * The widget subscribed to `spotBar:{ticker}-{room}` through the datafeed, so
 * the profile's chart ticked. The first version of this component fetched
 * `/history` and stopped, which silently turned a live chart into a snapshot —
 * the sort of regression that looks like a quiet market. `useBarStream` below is
 * that subscription, over the same shared socket and the same room names.
 *
 * ## The overlay is positioned, not laid out
 *
 * Every mark is absolutely placed from a coordinate the chart computes, so the
 * layer has to be repositioned on every pan, zoom, resize and data change —
 * `syncPositions` below, subscribed to the chart's own range events. A mark
 * whose candle has scrolled out of view resolves to a null coordinate and is
 * dropped rather than clamped to the edge, where it would claim a bar it does
 * not belong to.
 */

const CARD = { width: 330, height: 168 };
const STACK_CARD = { width: 350, height: 268 };

type Bar = CandlestickData<Time>;

interface Placed {
  cluster: MarkCluster;
  x: number;
  y: number;
}

function palette(isDark: boolean) {
  // Candle colours come from `candleColors`, shared with the Pro terminal. They
  // used to be literals here AND in TradingViewChart, with a comment promising
  // the two stayed in step — a promise two copies cannot keep. The chrome below
  // is still local because the two charts are different libraries with
  // different chrome; only the candles have to agree.
  return isDark
    ? {
        background: "#101318",
        grid: "rgba(154, 168, 184, 0.10)",
        border: "#2A313A",
        text: "#9DA8B5",
        ...candleColors(true),
      }
    : {
        background: "#F7F8FA",
        grid: "rgba(68, 83, 100, 0.10)",
        border: "#D5DCE4",
        text: "#5D6977",
        ...candleColors(false),
      };
}

export function ThesisChart({
  networkName,
  symbol,
  resolution,
  marks,
  marketCapSupply = 0,
  onOpenCallout,
  className,
}: {
  networkName: string;
  /** The UDF ticker — a bare symbol, or the `:MCAP` variant. */
  symbol: string;
  /** A UDF resolution string: "60", "D", "W". */
  resolution: string;
  /**
   * The callouts to draw. Fetched by the PAGE, not here.
   *
   * The page already owns the filters and needs the count for its own label, so
   * fetching in both places would mean two queries and two answers to "how many
   * callouts are on this chart" — the drift this repo keeps deleting. The chart
   * draws what it is handed.
   */
  marks: readonly ThesisMark[];
  /**
   * Total supply, for the `:MCAP` ticker only.
   *
   * A streamed bar carries a PRICE; market cap is that times supply, which the
   * gateway already applies to history. Passed in rather than fetched so the
   * live tick and the loaded bars are scaled by the same number.
   */
  marketCapSupply?: number;
  /** Opens the callout modal. The chart never owns that state. */
  onOpenCallout: (mark: ThesisMark) => void;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const holder = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [bars, setBars] = useState<Bar[]>([]);
  const barsRef = useRef<Bar[]>([]);
  barsRef.current = bars;
  const [loading, setLoading] = useState(true);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Clustered against the bars the chart actually has, not against the
  // resolution: `timeToCoordinate` answers null for a time that is not on the
  // scale, so a bucket computed arithmetically drops every mark whose boundary
  // disagrees with the server's by a second — and W/M bars are calendar-aligned,
  // which no fixed width reproduces.
  const barTimes = useMemo(() => bars.map((b) => b.time as number), [bars]);
  const clusters = useMemo(() => clusterMarks(marks, barTimes), [marks, barTimes]);

  /* ------------------------------------------------------------------ bars */

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const api = getApiUrl(networkName);
    if (!api || !symbol) {
      setBars([]);
      setLoading(false);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const url =
      `${api}/api/tradingview/history?symbol=${encodeURIComponent(symbol)}` +
      `&resolution=${encodeURIComponent(resolution)}&from=0&to=${now}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[] } | null) => {
        if (cancelled) return;
        const t = body?.t ?? [];
        // UDF answers in parallel arrays. A row is only usable if every one of
        // them has a value at that index — a short array is a malformed answer,
        // not a bar at zero.
        const next: Bar[] = [];
        for (let i = 0; i < t.length; i += 1) {
          const o = body?.o?.[i];
          const h = body?.h?.[i];
          const l = body?.l?.[i];
          const c = body?.c?.[i];
          if (o == null || h == null || l == null || c == null) continue;
          next.push({ time: t[i]! as UTCTimestamp, open: o, high: h, low: l, close: c });
        }
        setBars(next);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBars([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [networkName, symbol, resolution]);

  /* ------------------------------------------------------------ live bars */

  /**
   * Apply one streamed tick to the forming bar.
   *
   * The broker publishes a PRICE and a volume for the bucket, not an OHLC — so
   * the bar is folded here the same way the datafeed folds it: extend the high
   * and low, move the close, and open a new bar when the tick belongs to a
   * bucket after the last one. Replacing the bar outright would flatten the wick
   * every tick and draw a candle that never has a range.
   */
  const applyTick = useCallback((priceUsd: number, timestamp: number) => {
    const series = seriesRef.current;
    if (!series || priceUsd <= 0) return;
    const current = barsRef.current;
    const last = current[current.length - 1];
    if (!last) return;

    const lastTime = last.time as number;
    // The bucket width is read off the chart's own spacing rather than the
    // resolution string, for the same reason clustering is: W and M bars are
    // calendar-aligned and no constant reproduces them.
    const prev = current[current.length - 2];
    const width = prev ? lastTime - (prev.time as number) : 60;

    let next: Bar;
    if (timestamp >= lastTime + width) {
      // A new bucket. Opens at the previous close, which is what makes a gapless
      // series — opening at the tick would draw a candle with no body on the
      // first trade of every bar.
      next = {
        time: (lastTime + width) as UTCTimestamp,
        open: last.close,
        high: Math.max(last.close, priceUsd),
        low: Math.min(last.close, priceUsd),
        close: priceUsd,
      };
      barsRef.current = [...current, next];
      setBars(barsRef.current);
    } else {
      next = {
        time: last.time,
        open: last.open,
        high: Math.max(last.high, priceUsd),
        low: Math.min(last.low, priceUsd),
        close: priceUsd,
      };
      barsRef.current = [...current.slice(0, -1), next];
      // `update` rather than `setData`: it redraws one bar instead of the whole
      // series, and it is what keeps the user's pan and zoom where they left it.
      series.update(next);
      setBars(barsRef.current);
    }
  }, []);

  useEffect(() => {
    const ws = getWsUrl(networkName);
    if (!ws || !symbol || bars.length === 0) return;

    // `NOVA:MCAP` has no room of its own — the broker publishes bars for the
    // BARE ticker and the gateway scales history by supply on the way out. So
    // the market-cap chart subscribes to the token's own stream and applies the
    // same multiplication to each tick. Without this the metric toggle silently
    // turns a live chart into a static one, which is what it did before.
    const parsed = parseTradingViewSymbol(symbol);
    const barTicker = parsed.isMarketCap ? parsed.base : symbol;
    const scale = parsed.isMarketCap ? marketCapSupply : 1;
    if (parsed.isMarketCap && !(marketCapSupply > 0)) return;

    const isPair = barTicker.includes("/");
    const room = (isPair ? pairRoomString : tokenRoomString)[
      resolution as keyof typeof tokenRoomString
    ];
    if (!room) return;

    const roomString = `${barTicker}-${room}`;
    const manager = getSocketManager(ws);
    const unsubscribe = manager.subscribe(
      `spotBar:${roomString}`,
      {
        // The method says `pairs` for token rooms too. That is the datafeed's
        // own convention and the gateway routes on the room string, not the
        // method name — changing it here would unsubscribe from nothing.
        method: "spot.bars.subscribe.pairs",
        params: { ids: [roomString] },
        unsubscribeMethod: "spot.bars.unsubscribe.pairs",
      },
      {
        onBatch: (batch) => {
          for (const frame of batch.d) {
            const event = streamToEvent(frame as never) as SpotBarEvent | null;
            if (!event) continue;
            applyTick(event.price * scale, event.timestamp);
          }
        },
      },
    );
    return unsubscribe;
    // `bars.length` and not `bars`: the subscription only needs to know a series
    // EXISTS to fold onto. Keying on the array itself would tear the socket down
    // and rebuild it on every single tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkName, symbol, resolution, marketCapSupply, applyTick, bars.length > 0]);

  /* ----------------------------------------------------------------- chart */

  useEffect(() => {
    const el = holder.current;
    if (!el) return;

    const colors = palette(isDark);
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "var(--font-satoshi), system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    });
    const series = chart.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(bars);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  /* -------------------------------------------------------------- overlay */

  const syncPositions = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || clusters.length === 0) {
      setPlaced([]);
      return;
    }
    const timeScale = chart.timeScale();
    const next: Placed[] = [];
    for (const cluster of clusters) {
      const x = timeScale.timeToCoordinate(cluster.time as UTCTimestamp);
      const y = series.priceToCoordinate(cluster.price);
      // Null means the bar is outside the visible range or the price is off the
      // scale. Dropped rather than clamped: a mark pinned to the edge would sit
      // on a candle it has nothing to do with.
      if (x == null || y == null) continue;
      next.push({ cluster, x, y });
    }
    setPlaced(next);
  }, [clusters]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncPositions();
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(syncPositions);
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(syncPositions);
    };
  }, [syncPositions, bars, size]);

  // A cluster that scrolls out of view must take its open card with it — a card
  // left behind describes a mark that is no longer on screen.
  useEffect(() => {
    if (openKey && !placed.some((p) => p.cluster.key === openKey)) setOpenKey(null);
  }, [placed, openKey]);

  const open = placed.find((p) => p.cluster.key === openKey) ?? null;

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={holder} className="h-full w-full" />

      {loading && (
        <div className="absolute inset-0 animate-pulse bg-[color:var(--m-surface-2)]" />
      )}

      {!loading && bars.length === 0 && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-[color:var(--m-text-secondary)]">
          No market data for {symbol} yet.
        </div>
      )}

      {/* `pointer-events-none` on the layer, restored per mark: the chart under
          it still has to pan and zoom everywhere a mark is not. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {placed.map(({ cluster, x, y }) => (
          <ClusterMarks
            key={cluster.key}
            cluster={cluster}
            x={x}
            y={y}
            open={openKey === cluster.key}
            onToggle={() => setOpenKey(openKey === cluster.key ? null : cluster.key)}
          />
        ))}

        {open && (
          <MarkCard
            cluster={open.cluster}
            position={placeCard(
              open.x,
              open.y,
              open.cluster.marks.length > 1 ? STACK_CARD : CARD,
              size,
            )}
            width={open.cluster.marks.length > 1 ? STACK_CARD.width : CARD.width}
            onSelect={(mark) => {
              setOpenKey(null);
              onOpenCallout(mark);
            }}
            onDismiss={() => setOpenKey(null)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One bucket's marks, fanned.
 *
 * The fan runs LEFT from the cluster's own x so it grows away from the newest
 * candle rather than off the right edge, and the biggest stake keeps the
 * anchored position — so the mark actually on the candle is the one the cluster
 * is priced at.
 */
function ClusterMarks({
  cluster,
  x,
  y,
  open,
  onToggle,
}: {
  cluster: MarkCluster;
  x: number;
  y: number;
  open: boolean;
  onToggle: () => void;
}) {
  const slots = cluster.overflow > 0 ? cluster.fanned.length + 1 : cluster.fanned.length;

  return (
    <>
      {cluster.fanned.map((mark, i) => (
        <button
          key={mark.id}
          type="button"
          onClick={onToggle}
          onMouseEnter={open ? undefined : onToggle}
          title={`${mark.name}: ${mark.body}`}
          style={{
            left: x - i * FAN_STEP,
            top: y,
            // The anchored mark sits on top; the fan tucks behind it in order,
            // so the overlap reads as a stack rather than a jumble.
            zIndex: 20 - i,
          }}
          className={cn(
            "pointer-events-auto absolute grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2",
            "place-items-center overflow-hidden rounded-full border-2 border-[color:var(--m-surface)]",
            "bg-[color:var(--m-primary)] text-[11px] font-bold text-white transition-transform",
            "hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--m-primary)]",
            open && "ring-2 ring-[color:var(--m-primary)]",
          )}
        >
          {mark.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (mark.name.trim().charAt(0).toUpperCase() || "?")
          )}
        </button>
      ))}

      {cluster.overflow > 0 && (
        <button
          type="button"
          onClick={onToggle}
          title={`${cluster.marks.length} callouts on this candle`}
          style={{ left: x - (slots - 1) * FAN_STEP, top: y, zIndex: 20 - slots }}
          className={cn(
            "pointer-events-auto absolute grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2",
            "place-items-center rounded-full border-2 border-[color:var(--m-surface)]",
            "bg-[color:var(--m-surface-2)] font-dm-mono text-[10px] font-semibold",
            "text-[color:var(--m-text-primary)] transition-transform hover:scale-110",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--m-primary)]",
          )}
        >
          +{cluster.overflow}
        </button>
      )}
    </>
  );
}
