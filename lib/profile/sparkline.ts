/**
 * Sparkline geometry for a SPARSE, time-indexed series.
 *
 * Pure so it can be tested without a DOM — this repo's vitest runs in the node
 * environment, and the rules worth pinning here are arithmetic, not markup.
 *
 * ## Why this is not `Rewards/LiquiditySparkline`
 *
 * That one maps `values[i]` to `x = i / (n - 1)`, which is correct for its own
 * data: reward epochs are contiguous, so array position IS time. A balance
 * series is not. A wallet gets a row only on days it was seen, so a reading on
 * day 1 and the next on day 21 are ADJACENT in the array and three weeks apart
 * in fact. Plotting by position draws them one step apart and turns a long
 * quiet stretch into a cliff.
 *
 * So x comes from the day index, scaled across the window the user asked for
 * rather than across the data that happens to exist — otherwise a 1M view
 * holding two readings a day apart would stretch them across the full width and
 * read as a month of movement.
 */

export interface SeriesPoint {
  /** UTC day ordinal. */
  index: number;
  balanceUsd: number;
}

export interface SparkGeometry {
  /** `x,y` pairs in viewBox units, ready for `points=`. */
  points: string;
  /** The same, closed to the baseline, for the area fill. */
  area: string;
  /** Where the series ENDS, so the caller can mark it. */
  last: { x: number; y: number } | null;
}

/**
 * Project a sparse series into a viewBox.
 *
 * `windowStart`/`windowEnd` are day ordinals bounding the requested timeframe.
 * Passing them (rather than deriving from the data) is what keeps a 1W and a 1M
 * view of the same two readings visibly different.
 *
 * Y is scaled to the DATA's own range, not to zero. A portfolio moving between
 * $24,700 and $24,900 is a flat line on a zero-based axis, which hides the only
 * thing the chart is for. The trade is that the sparkline shows shape, never
 * magnitude — which is why the figure above it is the actual number.
 */
export function sparkGeometry(
  series: SeriesPoint[],
  windowStart: number,
  windowEnd: number,
  width: number,
  height: number,
  pad = 2,
): SparkGeometry {
  if (series.length === 0) return { points: "", area: "", last: null };

  const sorted = [...series].sort((a, b) => a.index - b.index);
  const values = sorted.map((p) => p.balanceUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series has no range to scale against; centre it rather than divide
  // by zero, which would put every point at NaN and render nothing at all.
  const range = max - min;
  const span = Math.max(1, windowEnd - windowStart);

  const projected = sorted.map((p) => {
    const x = ((p.index - windowStart) / span) * width;
    const y =
      range === 0
        ? height / 2
        : height - pad - ((p.balanceUsd - min) / range) * (height - pad * 2);
    // Clamped: a point can legitimately sit outside the window when the caller
    // includes a baseline reading from before it, and an out-of-box coordinate
    // silently disappears rather than being drawn at the edge.
    return {
      x: Math.min(width, Math.max(0, x)),
      y: Math.min(height, Math.max(0, y)),
    };
  });

  const points = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = projected[0]!;
  const last = projected[projected.length - 1]!;

  return {
    points,
    area: `${first.x.toFixed(1)},${height} ${points} ${last.x.toFixed(1)},${height}`,
    last,
  };
}

/** Whether the series ends above where it started — decides the stroke colour.
 * Null when there is nothing to compare, so the caller renders neutral rather
 * than guessing a direction. */
export function seriesDirection(series: SeriesPoint[]): "up" | "down" | "flat" | null {
  if (series.length < 2) return null;
  const sorted = [...series].sort((a, b) => a.index - b.index);
  const first = sorted[0]!.balanceUsd;
  const last = sorted[sorted.length - 1]!.balanceUsd;
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}
