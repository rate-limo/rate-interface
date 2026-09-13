import { z } from "zod";

export const spotTokenTimeBucket = z.object({
	/// index to find previous bucket
	index: z.number(),
	/// token symbol
	symbol: z.string(),
	/// token address
	token: z.string(),
	/// open price in 1 hour related to asset in USD
	open: z.number(),
	/// high price in 1 hour related to asset in USD
	high: z.number(),
	/// low price in 1 hour related to asset in USD
	low: z.number(),
	/// close price in 1 hour related to asset in USD
	close: z.number(),
	/// average price in 1 hour related to asset in USD
	average: z.number(),
	/// difference from open to close
	difference: z.number(),
	/// difference from open to close in percentage
	differencePercentage: z.number(),
	/// total value locked
	tvl: z.number(),
	/// total value locked in USD
	tvlUSD: z.number(),
	/// volume in 1 hour for the asset
	volume: z.number(),
	/// volume in 1 hour for the asset in USD
	volumeUSD: z.number(),
	/// trade count
	count: z.number(),
	/// aggregated timestamp in 24 hours in seconds
	timestamp: z.number(),
});

export type SpotTokenTimeBucket = z.infer<typeof spotTokenTimeBucket>;
