import { z } from "zod";

export const futuresLiquidationStreamSchema = z.tuple([
	z.string(), // eventId
	z.number(), // positionId
	z.string(), // pool
	z.string(), // symbol
	z.string(), // trader
	z.number(), // markPrice
	z.number(), // feeFund
	z.number(), // poolFund
	z.boolean(), // byKeeper
	z.number(), // timestamp
	z.string(), // txHash
	z.number(), // updatedAt
]);

export type FuturesLiquidationStream = z.infer<
	typeof futuresLiquidationStreamSchema
>;

export type FuturesLiquidationEvent = {
	eventId: "futuresLiquidation";
	positionId: number;
	pool: string;
	symbol: string;
	trader: string;
	markPrice: number;
	feeFund: number;
	poolFund: number;
	byKeeper: boolean;
	timestamp: number;
	txHash: string;
	updatedAt: number;
};

export function eventToFuturesLiquidationStream(
	obj: FuturesLiquidationEvent,
): FuturesLiquidationStream {
	return [
		obj.eventId,
		obj.positionId,
		obj.pool,
		obj.symbol,
		obj.trader,
		obj.markPrice,
		obj.feeFund,
		obj.poolFund,
		obj.byKeeper,
		obj.timestamp,
		obj.txHash,
		obj.updatedAt,
	];
}

export function streamToFuturesLiquidationEvent(
	data: FuturesLiquidationStream,
): FuturesLiquidationEvent {
	return {
		eventId: data[0] as "futuresLiquidation",
		positionId: data[1],
		pool: data[2],
		symbol: data[3],
		trader: data[4],
		markPrice: data[5],
		feeFund: data[6],
		poolFund: data[7],
		byKeeper: data[8],
		timestamp: data[9],
		txHash: data[10],
		updatedAt: data[11],
	};
}
