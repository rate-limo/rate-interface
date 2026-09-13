import { z } from "zod";
import { spotToken } from "../tokens";
import { spotTrade } from "./trades";
export const spotOrderHistory = z.object({
	orderId: z.number(),
	isBid: z.boolean(),
	base: spotToken,
	baseSymbol: z.string(),
	quote: spotToken,
	quoteSymbol: z.string(),
	pair: z.string(),
	pairSymbol: z.string(),
	price: z.number(),
	asset: spotToken,
	assetSymbol: z.string(),
	amount: z.number(),
	timestamp: z.number(),
	account: z.string(),
	txHash: z.string(),
	matchHistories: z.array(spotTrade).optional(),
});

export type SpotOrderHistory = z.infer<typeof spotOrderHistory>;