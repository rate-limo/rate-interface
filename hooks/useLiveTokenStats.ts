"use client";
import { useQuery } from "@tanstack/react-query";
import { PonderLinks } from "@/consts";
import type { SpotToken } from "@/types";

/** The four figures the token profile's header shows. */
export interface LiveTokenStats {
  priceUSD: number;
  marketCap: number | null;
  dayChangePct: number;
  dayVolumeUSD: number;
}

/**
 * The token profile header's numbers, kept current by polling.
 *
 * ## Why polling and not the socket
 *
 * The socket carries a `spotBar` per bucket, which has a price and a volume
 * delta — enough for a candle and not enough for this row. `dayVolumeUSD` and
 * the 24h change are ROLLING windows the broker maintains, and `marketCap` is a
 * generated column on `spotTokens`. Deriving any of them from a tick means
 * recomputing server state in the browser, which is how `sparkline7D` was
 * deleted and why `marketCap` became a generated column in the first place.
 *
 * So this asks the server for the row it already computes. The price ticks
 * faster on the chart beside it; that is fine and expected — the chart is
 * drawing a bar stream and this is reporting a row, and the row is the one that
 * has to agree with every other surface showing the same token.
 *
 * ## Seeded from the server render, so there is never a blank frame
 *
 * The page is server-rendered with a `SpotToken` already in hand. Passing it as
 * `initial` makes the first paint the real numbers rather than dashes that
 * resolve a moment later — and, more importantly, means a failed poll leaves the
 * last good figures on screen instead of emptying the header.
 *
 * ## By ADDRESS, never by symbol
 *
 * `useToken` resolves `/token/symbol/:symbol`, which is wrong here: anyone can
 * launch a coin called USDC on this venue, and a launch profile is exactly where
 * that happens. The address is the identity.
 */
export function useLiveTokenStats({
  networkName,
  address,
  initial,
  intervalMs = 15_000,
}: {
  networkName: string;
  address: string;
  initial: SpotToken;
  /** How often to re-ask. 15s by default — see the note in the component. */
  intervalMs?: number;
}): { stats: LiveTokenStats; updatedAt: number | null } {
  const seed = statsOf(initial);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["token-stats-live", networkName, address.toLowerCase()],
    enabled: !!networkName && !!address,
    // Kept polling in a background tab is wasted: the row is re-fetched on
    // focus anyway, and a tab nobody is looking at does not need fresh numbers.
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<LiveTokenStats | null> => {
      const root = PonderLinks[networkName];
      if (!root) return null;
      try {
        const res = await fetch(`${root}/api/token/address/${encodeURIComponent(address)}`);
        if (!res.ok) return null;
        return statsOf((await res.json()) as SpotToken);
      } catch {
        // Null keeps the seed on screen. A header that empties itself because a
        // poll missed is worse than one showing figures a few seconds old.
        return null;
      }
    },
  });

  return { stats: data ?? seed, updatedAt: data ? dataUpdatedAt : null };
}

/**
 * The four figures out of a token row.
 *
 * `marketCap` is READ, never recomputed — it is a stored generated column
 * (`priceUSD * totalSupply`, maintained by postgres), and multiplying here would
 * put a second source of truth beside it that drifts the moment a supply
 * changes. Null when the token has no price; the caller renders a dash, never
 * `$0`.
 *
 * The 24h change is computed from `priceUSD1DayBF` rather than read, because the
 * gateway sends the two prices and not the percentage. Guarded against a zero
 * baseline: a token whose first ever bucket is today divides by zero and would
 * render `Infinity%`.
 */
function statsOf(token: SpotToken): LiveTokenStats {
  const before = Number(token.priceUSD1DayBF) || 0;
  const now = Number(token.priceUSD) || 0;
  return {
    priceUSD: now,
    marketCap: token.marketCap == null ? null : Number(token.marketCap),
    dayChangePct: before > 0 ? ((now - before) / before) * 100 : 0,
    dayVolumeUSD: Number(token.dayVolumeUSD) || 0,
  };
}
