import { z } from "zod";

export const spotPairTimeBucket = z.object({
	/// index to find previous bucket
	index: z.number(),
	/// base address
	base: z.string(),
	quote: z.string(),
	/// symbol in trading view
	symbol: z.string(),
	/// pair contract address
	pair: z.string(),
	/// open price in 1 min related to asset
	open: z.number(),
	/// high price in 1 min related to asset
	high: z.number(),
	/// low price in 1 min related to asset
	low: z.number(),
	/// close price in 1 min related to asset
	close: z.number(),
	/// average price in 1 min related to asset
	average: z.number(),
	/// difference from open to close
	difference: z.number(),
	/// difference from open to close in percentage
	differencePercentage: z.number(),
	/// volume in 1 min for base asset
	baseVolume: z.number(),
	/// volume in 1 min for quote asset
	quoteVolume: z.number(),
	/// volume in 1 min for base asset in USD
	baseVolumeUSD: z.number(),
	/// volume in 1 min for quote asset in USD
	quoteVolumeUSD: z.number(),
	/// base tvl
	baseTvl: z.number(),
	/// quote tvl
	quoteTvl: z.number(),
	/// base tvl in USD
	baseTvlUSD: z.number(),
	/// quote tvl in USD
	quoteTvlUSD: z.number(),
	/// matching price count
	count: z.number(),
	/// aggregated timestamp in 1 min in seconds
	timestamp: z.number(),
});

export type SpotPairMinuteBucket = z.infer<typeof spotPairTimeBucket>;
