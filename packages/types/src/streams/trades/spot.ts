import { z } from "zod";

export const spotTradeStreamSchema = z.tuple([
	z.string(), // eventId
	z.number(), // orderId
	z.string(), // base
	z.string(), // quote
	z.string(), // baseSymbol
	z.string(), // quoteSymbol
	z.string(), // baseLogoURI
	z.string(), // quoteLogoURI
	z.string(), // pair
	z.string(), // pairSymbol
	z.boolean(), // isBid
	z.number(), // price
	z.string(), // account
	z.string(), // asset
	z.string(), // assetSymbol
	z.number(), // amount
	z.number(), // valueUSD
	z.number(), // baseAmount
	z.number(), // quoteAmount
	z.number(), // baseFee
	z.number(), // quoteFee
	z.number(), // timestamp
	z.string(), // taker
	z.string(), // maker
	z.string(), // txHash
	z.number(), // updatedAt
]);

export type SpotTradeStream = z.infer<typeof spotTradeStreamSchema>;

export type SpotTradeEvent = {
	eventId: "spotTrade";
	orderId: number;
	base: string;
	quote: string;
	baseSymbol: string;
	quoteSymbol: string;
	baseLogoURI: string;
	quoteLogoURI: string;
	pair: string;
	pairSymbol: string;
	isBid: boolean;
	price: number;
	account: string;
	asset: string;
	assetSymbol: string;
	amount: number;
	valueUSD: number;
	baseAmount: number;
	quoteAmount: number;
	baseFee: number;
	quoteFee: number;
	timestamp: number;
	taker: string;
	maker: string;
	txHash: string;
	updatedAt: number;
};

export function eventToSpotTradeStream(obj: SpotTradeEvent): SpotTradeStream {
	return [
		obj.eventId,
		obj.orderId,
		obj.base,
		obj.quote,
		obj.baseSymbol,
		obj.quoteSymbol,
		obj.baseLogoURI,
		obj.quoteLogoURI,
		obj.pair,
		obj.pairSymbol,
		obj.isBid,
		obj.price,
		obj.account,
		obj.asset,
		obj.assetSymbol,
		obj.amount,
		obj.valueUSD,
		obj.baseAmount,
		obj.quoteAmount,
		obj.baseFee,
		obj.quoteFee,
		obj.timestamp,
		obj.taker,
		obj.maker,
		obj.txHash,
		obj.updatedAt,
	];
}

export function streamToSpotTradeEvent(data: SpotTradeStream): SpotTradeEvent {
	return {
		eventId: data[0] as "spotTrade",
		orderId: data[1],
		base: data[2],
		quote: data[3],
		baseSymbol: data[4],
		quoteSymbol: data[5],
		baseLogoURI: data[6],
		quoteLogoURI: data[7],
		pair: data[8],
		pairSymbol: data[9],
		isBid: data[10],
		price: data[11],
		account: data[12],
		asset: data[13],
		assetSymbol: data[14],
		amount: data[15],
		valueUSD: data[16],
		baseAmount: data[17],
		quoteAmount: data[18],
		baseFee: data[19],
		quoteFee: data[20],
		timestamp: data[21],
		taker: data[22],
		maker: data[23],
		txHash: data[24],
		updatedAt: data[25] as number,
	};
}
