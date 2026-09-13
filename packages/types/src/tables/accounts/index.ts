import { z } from "zod";

export * from "./balanceBuckets";
export * from "./follows";

export const spotAccounts = z.object({
	/// account wallet address
	id: z.string(),
	/// total value locked in USD
	tvlUSD: z.number(),
	/// last traded
	lastTraded: z.number(),
	/// total orders that a user has currently
	totalOrders: z.number(),
	/// total order history that a user has currently
	totalOrderHistory: z.number(),
	/// total trade number of records that a user has currently
	totalTradeHistory: z.number(),
	/// total USD volume of trades that a user has currently
	totalVolumeUSD: z.number(),
	/// total created tokens
	totalCreatedTokens: z.number(),
	/// api key for the account
	apiKey: z.string(),
	/// email for the account
	email: z.string(),
});
