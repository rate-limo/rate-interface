import { z } from "zod";
export * from "./buckets";
export * from "./groupPairs";
export * from "./likes";
import { spotToken } from "../tokens";

export const spotPair = z.object({
  /// base token address
  base: spotToken,
  /// quote token address
  quote: spotToken,
  /// base token symbol
  baseSymbol: z.string(),
  /// quote token symbol
  quoteSymbol: z.string(),
  /// base token decimal
  bDecimal: z.number(),
  /// quote token decimal
  qDecimal: z.number(),
  /// pair contract address
  id: z.string(),
  /// pair symbol
  symbol: z.string(),
  /// ticker for trading view
  ticker: z.string(),
  /// description for trading view
  description: z.string(),
  /// type for trading view
  type: z.string(),
  /// is favorite
  isFavorite: z.boolean(),
  /// exchange for trading view
  exchange: z.string(),
  /// market price
  price: z.number(),
  /// scales which supports on the orderbook
  scales: z.array(z.string()),
  /// sparkline in 7 days
  sparkline7D: z.array(z.number()),
  /// all time high
  ath: z.number(),
  /// all time low
  atl: z.number(),
  /// listing date timestamp in seconds
  listingDate: z.number(),
  /// day open
  dayOpen: z.number(),
  /// day high
  dayHigh: z.number(),
  /// day low
  dayLow: z.number(),
  /// day price difference,
  dayPriceDifference: z.number(),
  /// day price difference percentage
  dayPriceDifferencePercentage: z.number(),
  /// day base tvl
  dayBaseTvl: z.number(),
  /// day quote tvl
  dayQuoteTvl: z.number(),
  /// day base volume
  dayBaseVolume: z.number(),
  /// day quote volume
  dayQuoteVolume: z.number(),
  /// day base tvl in USD
  dayBaseTvlUSD: z.number(),
  /// day quote tvl in USD
  dayQuoteTvlUSD: z.number(),
  /// day base volume in USD
  dayBaseVolumeUSD: z.number(),
  /// day quote volume in USD
  dayQuoteVolumeUSD: z.number(),
  /**
   * LIFETIME quote spent BUYING this pair's base asset — what graduation grades on.
   *
   * Optional because it is written by a broker from 2026-09-06 and is NULL on
   * every row an older one wrote, until the backfill runs. A caller must treat
   * absent as "not measured yet" rather than as zero progress.
   */
  buyQuoteVolumeUSD: z.number().nullable().optional(),
  /** The same figure in the quote asset's own units. */
  buyQuoteVolume: z.number().nullable().optional(),
  /**
   * Trailing 30-day QUOTE volume, summed from `spotPairDayBuckets` by the gateway.
   *
   * Optional because it is derived per request rather than stored, so a gateway
   * older than the route that adds it simply omits the field; nullable because a
   * pair with no recorded day buckets has an UNKNOWN month, not a zero one.
   */
  monthQuoteVolumeUSD: z.number().nullable().optional(),
  /// trades in the current day bucket — the divisor that turns day volume into a mean
  /// trade SIZE, which is what decides whether a swap reaches past the tightest
  /// liquidity band. `dayQuoteVolumeUSD` alone cannot answer that: the same volume in
  /// many small trades never leaves band 0. Written by the broker's pair buckets and
  /// reset on the day roll, exactly like `spotToken.dayTradesCount`.
  ///
  /// `tradesCount` is NOT this divisor and never has been — nothing writes it for
  /// pairs. Read this one; see migration 0006 for why it was not repurposed.
  ///
  /// OPTIONAL because a gateway running before migration 0006 omits it entirely, and
  /// `pairStatsFrom` reads a missing divisor as zero rather than Infinity — a pair we
  /// cannot size trades for contributes nothing to the exhaustion channel instead of
  /// everything.
  dayTradesCount: z.number().nullable().optional(),
  /// Wilder's RSI over hourly closes, kept incrementally by the broker.
  ///
  /// Null until 14 steps have accumulated, and null is a different statement from 50:
  /// "not enough history" rather than "no momentum either way". Collapsing them would
  /// make a fresh listing look neutral rather than unknown.
  ///
  /// The running state behind it (`rsiAvgGain`/`rsiAvgLoss`/`rsiPrevClose`/`rsiSteps`/
  /// `rsiUpdatedAt`) rides on the same rows and is deliberately NOT declared here.
  /// Those are a resumable average, not a reading — declaring them invites a component
  /// to render a half-finished one.
  rsi: z.number().nullable().optional(),
  /// total Minute Buckets
  totalMinBuckets: z.number(),
  /// total Hour Buckets
  totalHourBuckets: z.number(),
  /// total Day Buckets
  totalDayBuckets: z.number(),
  /// total Week Buckets
  totalWeekBuckets: z.number(),
  /// total Month Buckets
  totalMonthBuckets: z.number(),
  /// admin-curated listing flag, mirroring `spotToken.verified`. The gateway has always
  /// sent it on pair payloads; this type simply predated the listing gate and never
  /// declared it, so every consumer had to cast to read it.
  ///
  /// OPTIONAL, and anything other than an explicit `true` reads as unlisted (see
  /// `lib/search/listing.ts`). Optional because an older gateway omits the field
  /// entirely, and the safe reading of "unknown" is "not listed" — the opposite default
  /// would present an unreviewed market as a reviewed one.
  verified: z.boolean().nullable().optional(),
});

export type SpotPair = z.infer<typeof spotPair>;
