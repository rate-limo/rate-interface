import { z } from "zod";
export * from "./buckets";
export * from "./groupPairs";
export * from "./likes";

export const spotPair = z.object({
	/// base token address
	base: z.string(),
	/// quote token address
	quote: z.string(),
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
	/// exchange for trading view
	exchange: z.string(),
	/// market price
	price: z.number(),
	/// day open price
	dayOpen: z.number(),
	/// day high price
	dayHigh: z.number(),
	/// day low price
	dayLow: z.number(),
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
	/// trades in the current day bucket -- the divisor that turns day volume into
	/// a mean trade SIZE. `tradesCount` is not this and is never written for pairs.
	dayTradesCount: z.number().nullish(),
	/// Wilder's RSI over hourly closes. Null until 14 hours have accumulated,
	/// which is distinct from 50 -- unknown rather than neutral.
	rsi: z.number().nullish(),
	/// running state behind `rsi`; not for display
	rsiAvgGain: z.number().nullish(),
	rsiAvgLoss: z.number().nullish(),
	rsiPrevClose: z.number().nullish(),
	rsiSteps: z.number().nullish(),
	/// bucket timestamp of the last RSI step -- the continuity check
	rsiUpdatedAt: z.number().nullish(),
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
});

export type SpotPair = z.infer<typeof spotPair>;
