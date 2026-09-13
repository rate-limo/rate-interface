import { z } from "zod";

export const spotOrderHistoryStreamSchema = z.tuple([
	z.string(), // eventId
	z.number(), // orderId
	z.boolean(), // isBid
	z.string(), // base
	z.string(), // baseSymbol
	z.string(), // quote
	z.string(), // quoteSymbol
	z.string(), // pair
	z.string(), // pairSymbol
	z.number(), // price
	z.string(), // asset
	z.string(), // assetSymbol
	z.number(), // assetDecimals
	z.number(), // amount
	z.number(), // timestamp
	z.string(), // account
	z.string(), // txHash
	z.number(), // gasUsed
	z.string(), // status
	z.number(), // updatedAt
]);

export type SpotOrderHistoryStream = z.infer<
	typeof spotOrderHistoryStreamSchema
>;

export type SpotOrderHistoryEvent = {
	eventId: "spotOrderHistory";
	orderId: number;
	isBid: boolean;
	base: string;
	baseSymbol: string;
	quote: string;
	quoteSymbol: string;
	pair: string;
	pairSymbol: string;
	price: number;
	asset: string;
	assetSymbol: string;
	assetDecimals: number;
	amount: number;
	timestamp: number;
	account: string;
	txHash: string;
	gasUsed: number;
	status: "open" | "filled" | "canceled";
	updatedAt: number;
};

export function eventToSpotOrderHistoryStream(
	obj: SpotOrderHistoryEvent,
): SpotOrderHistoryStream {
	return [
		obj.eventId,
		obj.orderId,
		obj.isBid,
		obj.base,
		obj.baseSymbol,
		obj.quote,
		obj.quoteSymbol,
		obj.pair,
		obj.pairSymbol,
		obj.price,
		obj.asset,
		obj.assetSymbol,
		obj.assetDecimals,
		obj.amount,
		obj.timestamp,
		obj.account,
		obj.txHash,
		obj.gasUsed,
		obj.status,
		obj.updatedAt,
	];
}

export function streamToSpotOrderHistoryEvent(
	data: SpotOrderHistoryStream,
): SpotOrderHistoryEvent {
	return {
		eventId: data[0] as "spotOrderHistory",
		orderId: data[1],
		isBid: data[2],
		base: data[3],
		baseSymbol: data[4],
		quote: data[5],
		quoteSymbol: data[6],
		pair: data[7],
		pairSymbol: data[8],
		price: data[9],
		asset: data[10],
		assetSymbol: data[11],
		assetDecimals: data[12],
		amount: data[13],
		timestamp: data[14],
		account: data[15],
		txHash: data[16],
		gasUsed: data[17],
		status: data[18] as "open" | "filled" | "canceled",
		updatedAt: data[19] as number,
	};
}
