/**
 * One flat carry-forward candle — the single definition shared by the writer
 * and the reader.
 *
 * apps/broker's CandleTick writes these when a period elapses with no trades;
 * apps/gateway synthesizes the identical row when it serves a chart whose
 * series has gaps (see apps/gateway/src/api/densify.ts). Two implementations
 * would be free to disagree about what an idle minute looks like, and the
 * disagreement would surface as a chart that changes shape depending on whether
 * the tick had run for that pair yet — which is exactly the bug nobody would
 * think to look for.
 *
 * Volume AND tvl are zeroed. Since the b1 rekey the tvl columns are signed
 * PER-PERIOD deltas rather than a carried running level: a quiet period has zero
 * flux by definition, and carrying the previous period's delta forward would
 * double-count it in the read-time running sum.
 */
export type CandleRow = Record<string, unknown>;

const TVL_KEYS = {
  token: ["tvl", "tvlUSD"],
  pair: ["baseTvl", "quoteTvl", "baseTvlUSD", "quoteTvlUSD"],
} as const;

/**
 * The next period's row, carried forward from `cur`.
 *
 * `now` is only the fallback for a row with no timestamp, matching the tick's
 * own `(cur.timestamp ?? now) + seconds`. Every stored row has one — the column
 * is NOT NULL — so this is defensive rather than load-bearing.
 */
export function nextFlatRow<T extends CandleRow>(
  cur: T,
  seconds: number,
  kind: "pair" | "token",
  now: number,
): T & CandleRow {
  const close = (cur.close as number | null) ?? 0;
  const next = { ...cur } as CandleRow;

  for (const k of Object.keys(next)) {
    if (/volume/i.test(k)) next[k] = 0;
  }

  Object.assign(next, {
    open: close,
    high: close,
    low: close,
    close,
    average: close,
    difference: 0,
    differencePercentage: 0,
    count: 0,
    timestamp: ((cur.timestamp as number | null) ?? now) + seconds,
  });

  for (const k of TVL_KEYS[kind]) next[k] = 0;

  return next as T & CandleRow;
}
