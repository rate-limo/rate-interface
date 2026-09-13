/**
 * Turning a list of callouts into the marks a chart can actually draw.
 *
 * ## Why this is a module and not a few lines inside the chart
 *
 * Because the interesting cases are all about COLLISION, and every one of them
 * is silent when it goes wrong: marks stacked exactly on top of one another look
 * like a single callout, a cluster that exceeds its fan looks like the rest were
 * never posted, and a card ordered differently from the chart makes the two
 * disagree about which callout matters. None of that throws. It is pure
 * arithmetic over a list, so it is tested as such — `marks.test.ts`.
 *
 * The chart component owns pixels and React; this owns the rules.
 */

/** One callout, as `/api/tradingview/marks` serves it. */
export interface ThesisMark {
  id: number;
  /** Unix seconds — `theses.plotTime`, the trade the callout is anchored to. */
  time: number;
  author: string;
  name: string;
  body: string;
  /** USD size of the anchoring trade. The stake behind the claim. */
  valueUsd: number;
  plotPrice: number;
  avatarUrl: string | null;
}

/**
 * The callouts sharing one time bucket, and where that bucket sits.
 *
 * `time` is the BUCKET's time, not any one callout's — it is what the chart
 * converts to an x coordinate, and using a member's own timestamp would place
 * the cluster a fraction of a candle away from the candle it belongs to.
 */
export interface MarkCluster {
  /** Stable across re-renders: the bucket, so React keys survive a refetch. */
  key: string;
  time: number;
  price: number;
  /** Every callout in the bucket, biggest stake first. */
  marks: ThesisMark[];
  /** The ones that get their own circle. At most `FAN_LIMIT`. */
  fanned: ThesisMark[];
  /** How many the fan does not show. Zero when the cluster fits. */
  overflow: number;
}

/**
 * How many callouts in one bucket get their own circle before the last becomes
 * a `+N` counter.
 *
 * Five, and the number is a width argument rather than a taste one: a 30px mark
 * overlapped at `FAN_STEP` spans about 110px across five, which is roughly one
 * candle at the resolutions this chart offers. Past that the cluster stops
 * reading as belonging to one bar and starts covering its neighbours.
 */
export const FAN_LIMIT = 5;

/** Horizontal pixels between fanned marks. Less than a mark's width, so they overlap. */
export const FAN_STEP = 22;

/**
 * The bar a callout belongs to: the last one at or before its timestamp.
 *
 * Binary search over the chart's OWN bar times, which is the whole point and not
 * an optimisation. Computing the bucket arithmetically — floor the timestamp to
 * a multiple of the resolution — is the obvious approach and is wrong twice
 * over. `timeScale().timeToCoordinate()` returns null for a time that is not on
 * the scale, so a bucket boundary that disagrees with the server's by one second
 * silently drops the mark; and week and month resolutions are CALENDAR-aligned,
 * which no fixed number of seconds reproduces. Asking the bars removes both.
 *
 * Returns -1 for a callout older than the first bar — off the left of the chart,
 * so there is nothing to attach it to.
 */
function barIndexFor(barTimes: readonly number[], time: number): number {
  let lo = 0;
  let hi = barTimes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barTimes[mid]! <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Group callouts into the clusters a chart draws, one per occupied bar.
 *
 * Ordering inside a cluster is by STAKE, descending — the same order
 * `/tradingview/marks` applies before its own cap. That is not a coincidence to
 * be maintained by hand on both sides: the server truncates the biggest N and
 * the client fans the biggest five of what survives, so a reader who sees five
 * avatars is seeing the five largest positions behind the five loudest claims,
 * on both surfaces, at every zoom level. Sorting by time here instead would fan
 * an arbitrary five and quietly bury the biggest.
 *
 * The tie-break is the id, so a bucket where two callouts carry the same stake
 * does not shuffle between renders — a fan that reorders under the cursor is a
 * fan nobody can click.
 */
export function clusterMarks(
  marks: readonly ThesisMark[],
  /** The chart's own bar times, ascending. Empty means nothing can be placed. */
  barTimes: readonly number[],
): MarkCluster[] {
  if (barTimes.length === 0) return [];
  const byBucket = new Map<number, ThesisMark[]>();

  for (const mark of marks) {
    const index = barIndexFor(barTimes, mark.time);
    // Older than the chart's first bar. Dropped rather than pinned to bar zero,
    // where it would claim a candle it predates.
    if (index < 0) continue;
    const bucket = barTimes[index]!;
    const existing = byBucket.get(bucket);
    if (existing) existing.push(mark);
    else byBucket.set(bucket, [mark]);
  }

  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, members]) => {
      const sorted = [...members].sort((a, b) => b.valueUsd - a.valueUsd || a.id - b.id);
      const overflow = Math.max(0, sorted.length - FAN_LIMIT);
      return {
        key: `b${time}`,
        time,
        // The cluster sits at the price of its LARGEST callout, which is the
        // first after the sort above. Averaging the members instead would park
        // the marks at a price nobody posted at — and on a bucket holding one
        // callout at the high and one at the low, exactly between two candles.
        price: sorted[0]?.plotPrice ?? 0,
        marks: sorted,
        // When the cluster overflows, the last SLOT is the counter — so only
        // `FAN_LIMIT - 1` avatars are shown. Fanning five and then adding a
        // sixth counter is what pushes a cluster past the width this limit
        // exists to hold it inside.
        fanned: overflow > 0 ? sorted.slice(0, FAN_LIMIT - 1) : sorted,
        overflow: overflow > 0 ? sorted.length - (FAN_LIMIT - 1) : 0,
      };
    });
}

/**
 * Where a card should sit so it stays inside the chart.
 *
 * A card anchored naively to its mark hangs off the right edge on the newest
 * candles — which are the ones people look at — and off the top on a callout
 * near the high. Both are clipped by the chart's own `overflow: hidden`, so the
 * failure is a card that is simply not there rather than one that is misplaced.
 *
 * Returns pixel offsets from the chart's top-left, already clamped. The caller
 * positions with them directly.
 */
export function placeCard(
  markX: number,
  markY: number,
  card: { width: number; height: number },
  chart: { width: number; height: number },
): { left: number; top: number } {
  const GAP = 14;
  // Prefer the right of the mark, flip to the left when that would overflow —
  // rather than clamping, which would slide the card over the mark it belongs to.
  const preferRight = markX + GAP + card.width <= chart.width;
  const left = preferRight ? markX + GAP : markX - GAP - card.width;
  const top = markY + GAP;

  return {
    left: Math.max(8, Math.min(left, chart.width - card.width - 8)),
    top: Math.max(8, Math.min(top, chart.height - card.height - 8)),
  };
}
