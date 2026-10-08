/**
 * Bars a chart already loaded, kept for a moment after it stops showing them.
 *
 * The coin page's chart unmounts its series on every tab switch (1H → 24H → 1H)
 * and fetched the same page again each time. The gateway marks history
 * `max-age=10`, but that never helped: the request's `to` was the current second,
 * so no two requests shared a URL, and nothing in front of the gateway caches
 * (Railway's edge proxies without storing). So the browser keeps its own copy.
 *
 * Only briefly. A chart is live while it is on screen — ticks fold into the last
 * bar — so an entry is refreshed on every change and trusted for `FRESH_MS`
 * after the last one. Past that the chart refetches rather than showing candles
 * that stopped updating when the reader looked away.
 *
 * Bounded: at most `MAX_ENTRIES` charts, the least recently used dropped first.
 */

/** How long bars stay trustworthy after the chart last touched them. Matches the gateway's s-maxage. */
export const FRESH_MS = 30_000;
/** Charts remembered at once. A reader flips between a few tabs on a few coins. */
export const MAX_ENTRIES = 24;

export interface CachedHistory<Bar> {
  bars: readonly Bar[];
  /** False once paging back hit the start of the data or the retention horizon. */
  hasOlder: boolean;
  savedAt: number;
}

const entries = new Map<string, CachedHistory<unknown>>();

export function historyKey(api: string, symbol: string, resolution: string): string {
  return `${api}|${symbol}|${resolution}`;
}

/** The entry if it is still fresh, else undefined (and the stale one is dropped). */
export function readHistory<Bar>(key: string, now: number = Date.now()): CachedHistory<Bar> | undefined {
  const hit = entries.get(key) as CachedHistory<Bar> | undefined;
  if (!hit) return undefined;
  if (now - hit.savedAt > FRESH_MS) {
    entries.delete(key);
    return undefined;
  }
  // Re-insert to mark it most recently used; Map iteration order is insertion order.
  entries.delete(key);
  entries.set(key, hit);
  return hit;
}

export function writeHistory<Bar>(key: string, value: Omit<CachedHistory<Bar>, "savedAt">, now: number = Date.now()): void {
  entries.delete(key);
  entries.set(key, { ...value, savedAt: now });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** For tests. */
export function clearHistoryCache(): void {
  entries.clear();
}
