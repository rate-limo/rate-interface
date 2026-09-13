import { z } from "zod";

export * from "./buckets";

export const spotExchange = z.object({
	/// iter-exchange
	id: z.string(),
	/// network name
	networkName: z.string(),
	/// orderbook bytecode to locate pair contract address
	bytecode: z.string(),
	/// deployer address to predict pair address
	deployer: z.string(),
	/// total day buckets
	totalDayBuckets: z.number(),
	/// total week buckets
	totalWeekBuckets: z.number(),
	/// total month buckets
	totalMonthBuckets: z.number(),
});

export type SpotExchange = z.infer<typeof spotExchange>;
