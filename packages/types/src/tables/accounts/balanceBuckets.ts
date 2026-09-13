import { z } from "zod";

export const accountBalanceDayBuckets = z.object({
	account: z.string(),
	index: z.number(),
	totalBalanceInUSD: z.number(),
	totalTokens: z.number(),
});

export type AccountBalanceDayBuckets = z.infer<typeof accountBalanceDayBuckets>;
