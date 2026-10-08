"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";
import { useQuery } from "@tanstack/react-query";
import { useTradePulse } from "@/hooks/useTradePulse";
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
  pairs = [],
  initial,
  intervalMs = 15_000,
}: {
  networkName: string;
  /**
   * May be undefined. The page resolves a token from a URL segment, and a
   * symbol it cannot resolve leaves this empty — the type said `string` and the
   * caller passed undefined anyway, which is how it reached the query key.
   */
  address: string | undefined;
  /**
   * The token's own markets, `BASE/QUOTE`. Used ONLY to pick the trade topics
   * this page subscribes to — the figures still come from the REST row.
   *
   * Empty means no subscription: the poll alone keeps working, which is what a
   * token with no market needs and all it needs.
   */
  pairs?: readonly string[];
  initial: SpotToken;
  /** How often to re-ask. 15s by default — see the note in the component. */
  intervalMs?: number;
}): { stats: LiveTokenStats; updatedAt: number | null; stale: boolean } {
  const seed = statsOf(initial);

  const { data, dataUpdatedAt, isError, refetch } = useQuery({
    /*
     * The key is built EAGERLY, before `enabled` is consulted.
     *
     * So `address.toLowerCase()` on an unresolved token threw right here —
     * "Cannot read properties of undefined (reading 'toLowerCase')" — and took
     * the whole token page down with a runtime overlay. `enabled` gates the
     * FETCH and nothing else; anything evaluated to build the key has to stand
     * on its own.
     */
    queryKey: ["token-stats-live", networkName, address?.toLowerCase() ?? ""],
    enabled: !!networkName && !!address,
    // Kept polling in a background tab is wasted: the row is re-fetched on
    // focus anyway, and a tab nobody is looking at does not need fresh numbers.
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<LiveTokenStats | null> => {
      const root = PonderLinks[networkName];
      // `enabled` already refuses both of these; re-checking here is what makes
      // the function total, since a manual `refetch()` ignores `enabled`. This
      // is the one null that is NOT a failure — there is nothing to ask.
      if (!root || !address) return null;
      /*
       * THROWS on a bad response, and lets a network error propagate.
       *
       * Both used to `return null`, which fell through to `data ?? seed` below
       * and pinned the header to its server-rendered figures FOREVER, with
       * nothing to say so: no error, no stale mark, and `LiveStat`'s change
       * flash never fires because the rendered string never changes. A dead
       * poll was indistinguishable from a quiet market.
       *
       * Throwing changes none of what is on screen — `data` stays undefined and
       * the seed still shows, which is right, since a header that empties
       * itself over a missed poll is worse than one a few seconds old. What it
       * adds is `isError`, which react-query also retries on, and which the
       * caller renders as the `stale` mark this hook now returns.
       */
      /*
       * `no-store`, because this is now socket-triggered.
       *
       * The route answers `cache-control: public, max-age=10`, which was
       * harmless while the only caller was a 15s timer — the entry had always
       * expired by the time it asked again. A trade-driven refetch lands within
       * a second of the fill, so the browser would serve the pre-trade row
       * straight back out of cache and the header would flash a value that had
       * not changed. The socket is only worth listening to if the read it
       * triggers actually reaches the gateway.
       */
      const res = await gatewayFetch(`${root}/api/token/address/${encodeURIComponent(address)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`token stats: ${res.status} from ${root}`);
      return statsOf((await res.json()) as SpotToken);
    },
  });

  /*
   * The socket says WHEN, the poll still says WHAT.
   *
   * At 15s, with the gateway caching this route for ten more, a trade took up
   * to ~25 seconds to reach the header and several trades inside one window
   * collapsed into a single change — which is why the figures only flashed
   * "occasionally" while the market was in fact moving. A trade touching this
   * token now re-asks immediately. Nothing is DERIVED from the frame: these are
   * rolling aggregates the broker maintains, and recomputing them here is the
   * mistake the note above exists to prevent.
   */
  useTradePulse({
    networkName,
    pairs,
    enabled: !!networkName && !!address,
    onTrade: () => void refetch(),
  });

  return {
    stats: data ?? seed,
    updatedAt: data ? dataUpdatedAt : null,
    // Only after react-query has exhausted its retries, so a single dropped
    // poll on a flaky connection does not flicker a warning at the reader.
    stale: isError,
  };
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
