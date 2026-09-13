import { z } from "zod";

export const spotTrade = z.object({
	// order id of the trade
	orderId: z.number(),
	// base token address of the pair
	base: z.string(),
	// quote token address of the pair
	quote: z.string(),
	// base token symbol of the pair
	baseSymbol: z.string(),
	// base token logo uri of the pair
	baseLogoURI: z.string(),
	// quote token symbol of the pair
	quoteSymbol: z.string(),
	// quote token logo uri of the pair
	quoteLogoURI: z.string(),
	// pair contract address of the trade
	pair: z.string(),
	// symbol of the pair
	pairSymbol: z.string(),
	// is bid or ask
	isBid: z.boolean(),
	// price of the trade
	price: z.number(),
	// sender of the transaction
	account: z.string(),
	// asset of the trade
	asset: z.string(),
	// symbol of the asset
	assetSymbol: z.string(),
	// asset decimals of the asset
	assetDecimals: z.number(),
	// amount of the trade
	amount: z.number(),
	// value in usd
	valueUSD: z.number(),
	// base amount of the trade
	baseAmount: z.number(),
	// quote amount of the trade
	quoteAmount: z.number(),
	// base fee of the trade
	baseFee: z.number(),
	// quote fee of the trade
	quoteFee: z.number(),
	// timestamp of the trade
	timestamp: z.number(),
	// taker of the trade
	taker: z.string(),
	// maker of the trade
	maker: z.string(),
	// hash of the transaction
	txHash: z.string(),
});

export type SpotTrade = z.infer<typeof spotTrade>;
