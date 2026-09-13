import { z } from "zod";

const spotExchangeTimeBucket = z.object({
	/// index to find previous bucket
	index: z.number(),
	/// protocol id as "iter-exchange"
	protocolId: z.string(),
	/// network name
	networkName: z.string(),
	/// Timestamp
	timestamp: z.number(),
	/// Accumulated Volume
	totalVolume: z.number(),
	/// TVL
	tvl: z.number(),
	/// Total Global trades
	totalGlobalTrades: z.number(),
	/// Total Global pairs
	totalGlobalPairs: z.number(),
	/// Total Global traders
	totalGlobalTraders: z.number(),
});

export type SpotExchangeTimeBucket = z.infer<typeof spotExchangeTimeBucket>;