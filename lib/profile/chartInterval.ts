/**
 * The profile page's timeframe buttons ("1h", "24h", ...) used to pick which
 * `TokenSparklines` series to plot. Now they pick a TradingView Advanced Chart
 * resolution instead, so the buttons keep doing something rather than sitting next
 * to a chart with its own toolbar and no connection to them.
 *
 * The candidate resolutions are exactly the keys `utils/datafeed.ts`'s `interval`
 * map (and the UDF datafeed) understand — anything else is silently ignored by the
 * chart, which would look identical to this mapping being wrong.
 */
export type ChartTimeframeLabel = "1h" | "24h" | "1W" | "1M" | "1Y" | "3Y";

export function timeframeToInterval(label: ChartTimeframeLabel): string {
  switch (label) {
    case "1h":
      return "1"; // 1-minute candles resolve a 1-hour window
    case "24h":
      return "15";
    case "1W":
      return "60";
    case "1M":
      return "D";
    case "1Y":
      return "W";
    case "3Y":
      return "M";
  }
}
