
import { z } from "zod";

export const spotTick = z.object({
	base: z.string(),
	baseSymbol: z.string(),
	quote: z.string(),
	quoteSymbol: z.string(),
	pair: z.string(),
	pairSymbol: z.string(),
	isBid: z.boolean(),
	priceBN: z.bigint(),
	price: z.number(),
	amount: z.number(),
	count: z.number(),
});

export type SpotTick = z.infer<typeof spotTick>;
