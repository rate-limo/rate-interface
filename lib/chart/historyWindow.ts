/**
 * Which slice of history a chart asks the gateway for.
 *
 * The coin-page chart used to ask for everything (`from=0`). On the 1h tab that
 * is one-minute candles, so every open returned the whole retained week —
 * 10,081 bars and ~433 KB — to draw about sixty, and the gateway built 8–17 MB
 * of objects per viewer per tab switch. Those rows are also scattered one per
 * disk page (the broker writes candles in time order, interleaved across every
 * market), so a chart opened cold paid for ten thousand page reads it never
 * showed. Measured on 100k synthetic launches; see the launchpad load test.
 *
 * So a chart loads one page of bars ending now, and one more page each time the
 * user scrolls to the left edge — the same shape TradingView's own datafeed uses.
 */

/** Bars per request. Enough to fill a wide chart with room to scroll. */
export const BARS_PER_PAGE = 300;

const DAY = 86_400;

/**
 * How far back each stored series is kept, mirroring `RETENTION_DAYS` in
 * apps/broker/src/processors/BucketPrune.ts (minute 7, hour 90, day 365, week and
 * month forever). Past it the gateway has no rows, only a carried-forward price,
 * so paging further back would draw flat candles for a period that was pruned,
 * not a period that was quiet. Keep in step with BucketPrune if that changes.
 */
const RETENTION_SECONDS: Record<"minute" | "hour" | "day" | "week" | "month", number | null> = {
  minute: 7 * DAY,
  hour: 90 * DAY,
  day: 365 * DAY,
  week: null,
  month: null,
};

/** Seconds per bar for a UDF resolution string, and which stored series serves it. */
export function resolutionInfo(resolution: string): {
  seconds: number;
  series: keyof typeof RETENTION_SECONDS;
} {
  switch (resolution) {
    case "D":
    case "1D":
      return { seconds: DAY, series: "day" };
    case "W":
    case "1W":
      return { seconds: 7 * DAY, series: "week" };
    case "M":
    case "1M":
      return { seconds: 30 * DAY, series: "month" };
  }
  const minutes = Number.parseInt(resolution, 10);
  const seconds = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 60;
  // The gateway reads minute buckets below an hour and hour buckets up to a day
  // (getTableFromResolution in apps/gateway/src/api/tradingview.ts).
  return { seconds, series: minutes < 60 ? "minute" : "hour" };
}

export interface HistoryWindow {
  from: number;
  to: number;
}

/**
 * The oldest timestamp worth asking for at this resolution, or 0 when the series
 * is kept forever.
 */
export function retentionFloor(resolution: string, now: number): number {
  const keep = RETENTION_SECONDS[resolutionInfo(resolution).series];
  return keep === null ? 0 : now - keep;
}

/**
 * The first page: `BARS_PER_PAGE` bars ending with the bar forming now, clipped
 * to retention.
 *
 * `to` is the LAST SECOND of the current bar, not the current second. The
 * gateway marks history cacheable, but a URL carrying the current second is
 * never requested twice, so that header did nothing; rounded, every open within
 * one bar asks for the same URL. Not the next bar's start: the gateway's range
 * is inclusive and it gap-fills up to `to`, so that would draw a candle for a
 * bar that has not begun.
 */
export function latestWindow(resolution: string, now: number): HistoryWindow {
  const { seconds } = resolutionInfo(resolution);
  const currentBar = Math.floor(now / seconds) * seconds;
  return {
    // BARS_PER_PAGE bars counting the one forming now.
    from: Math.max(retentionFloor(resolution, now), currentBar - (BARS_PER_PAGE - 1) * seconds),
    to: currentBar + seconds - 1,
  };
}

/**
 * The page before the oldest bar the chart holds, or `null` when there is
 * nothing older worth fetching: the retention horizon is reached.
 *
 * `to` stops one second short of the oldest bar so the two pages never overlap
 * (the gateway's range is inclusive at both ends).
 */
export function olderWindow(resolution: string, oldestTime: number, now: number): HistoryWindow | null {
  const { seconds } = resolutionInfo(resolution);
  const floor = retentionFloor(resolution, now);
  const to = oldestTime - 1;
  if (to <= floor) return null;
  return { from: Math.max(floor, oldestTime - BARS_PER_PAGE * seconds), to };
}

/**
 * Put an older page in front of the bars already loaded. Sorted and de-duplicated
 * by time, with the already-loaded bar winning a collision: it may carry live
 * ticks the history page predates.
 */
export function prependBars<T extends { time: unknown }>(older: readonly T[], current: readonly T[]): T[] {
  // `time` is typed loosely because lightweight-charts' `Time` admits strings and
  // business days; every bar a UDF history route returns is Unix seconds.
  const first = current.length > 0 ? Number(current[0]!.time) : Number.POSITIVE_INFINITY;
  return [...older.filter((b) => Number(b.time) < first), ...current];
}
