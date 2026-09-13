/**
 * Pure math for the concentrated-liquidity (v3-style) range chart. No React —
 * the CLPriceChart component maps client Y ↔ price with these, so the geometry
 * is testable and the component stays thin. Everything is the pair RATE
 * (quote-per-base), never a USD price (see apps/web/CLAUDE.md). Ported from the
 * approved liquidity artifact.
 */

export interface Bounds {
  min: number;
  max: number;
}

/** Y-axis window: the rate anchor ± zoom, so zoom rescales symmetrically around it. */
export function bounds(anchor: number, zoom: number): Bounds {
  return { min: anchor * (1 - zoom), max: anchor * (1 + zoom) };
}

export function priceToY(price: number, b: Bounds, chartH: number): number {
  const range = b.max - b.min;
  if (range === 0) return chartH / 2;
  return chartH - ((price - b.min) / range) * chartH;
}

export function yToPrice(y: number, b: Bounds, chartH: number): number {
  const clamped = Math.max(0, Math.min(chartH, y));
  return b.min + (1 - clamped / chartH) * (b.max - b.min);
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface LiquidityLevel {
  price: number;
  liquidity: number;
}

/** Build the right-aligned stepped area from indexed orderbook depth. */
export function liquidityDepthPath(
  levels: LiquidityLevel[],
  b: Bounds,
  plotW: number,
  chartH: number,
): string {
  const visible = levels
    .filter(
      ({ price, liquidity }) =>
        Number.isFinite(price) &&
        Number.isFinite(liquidity) &&
        price >= b.min &&
        price <= b.max &&
        liquidity > 0,
    )
    .sort((a, z) => z.price - a.price);
  if (visible.length === 0) return "";

  const maxLiquidity = Math.max(...visible.map((level) => level.liquidity));
  const maxW = plotW * 0.42;
  const points = visible.map((level) => ({
    x: plotW - (level.liquidity / maxLiquidity) * maxW,
    y: priceToY(level.price, b, chartH),
  }));

  let d = `M ${plotW},${points[0].y.toFixed(1)} L ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const point = points[i];
    d += ` L ${previous.x.toFixed(1)},${point.y.toFixed(1)} L ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }
  return `${d} L ${plotW},${points[points.length - 1].y.toFixed(1)} Z`;
}

/** Deterministic OHLC walk around `base`, renormalised so the last close == base. */
export function genCandles(n: number, base: number, vol: number): Candle[] {
  const out: Candle[] = [];
  let p = base * (1 - vol * 0.4);
  let seed = n * 7 + 3;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p * (1 + (rnd() - 0.5) * vol);
    out.push({ o, c, h: Math.max(o, c) * (1 + rnd() * vol * 0.4), l: Math.min(o, c) * (1 - rnd() * vol * 0.4) });
    p = c;
  }
  const k = base / out[out.length - 1].c;
  out.forEach((d) => {
    d.o *= k;
    d.c *= k;
    d.h *= k;
    d.l *= k;
  });
  return out;
}

/** Liquidity-depth overlay path — a gaussian bump around the anchor, growing left from the right edge. */
export function depthPath(anchor: number, b: Bounds, plotW: number, chartH: number): string {
  const sigma = anchor * 0.14;
  const maxW = plotW * 0.42;
  const N = 44;
  let d = `M ${plotW},${chartH.toFixed(1)}`;
  let prevX = plotW;
  for (let i = 0; i <= N; i++) {
    const price = b.min + (i / N) * (b.max - b.min);
    const g = Math.exp(-Math.pow(price - anchor, 2) / (2 * sigma * sigma));
    const w = Math.max(0.02, g) * maxW;
    const y = priceToY(price, b, chartH);
    const x = plotW - w;
    d += ` L ${prevX.toFixed(1)},${y.toFixed(1)} L ${x.toFixed(1)},${y.toFixed(1)}`;
    prevX = x;
  }
  return d + ` L ${plotW},0 Z`;
}

/** -1: range entirely above the rate (single-sided, base only); 1: entirely below (quote only); 0: straddles. */
export function singleSide(anchor: number, low: number, high: number, full: boolean): -1 | 0 | 1 {
  if (full) return 0;
  if (anchor > high) return -1;
  if (anchor < low) return 1;
  return 0;
}

/** Rough capital-concentration multiplier vs a full-range position. */
export function concentration(anchor: number, low: number, high: number, full: boolean): number {
  if (full) return 1;
  return Math.max(1, Math.round((2 * anchor) / Math.max(1e-9, high - low)));
}
