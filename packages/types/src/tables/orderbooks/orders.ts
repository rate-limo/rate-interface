import { z } from "zod";

export const spotOrder = z.object({
	isBid: z.boolean(),
	orderId: z.number(),
	base: z.string(),
	baseSymbol: z.string(),
	baseLogoURI: z.string(),
	quote: z.string(),
	quoteSymbol: z.string(),
	quoteLogoURI: z.string(),
	pairSymbol: z.string(),
	pair: z.string(),
	price: z.number(),
	asset: z.string(),
	assetSymbol: z.string(),
	assetDecimals: z.number(),
	amount: z.number(),
	placed: z.number(),
	timestamp: z.number(),
	account: z.string(),
	txHash: z.string(),
});

export type SpotOrder = z.infer<typeof spotOrder>;
