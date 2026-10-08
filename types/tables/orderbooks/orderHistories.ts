import { z } from "zod";
import { spotToken } from "../tokens";
import { spotTrade } from "./trades";
export const spotOrderHistory = z.object({
	// The order's own id, issued when it rested; null for one that crossed the
	// book outright and never did. Say which with `rested`, not with this.
	orderId: z.number().nullable(),
	// false: the order crossed outright (no id, fills recovered from trades).
	// Absent from gateways older than the field — see neverRested.
	rested: z.boolean().optional(),
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