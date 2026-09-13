import { z } from "zod";

export const futuresPositionStreamSchema = z.tuple([
	z.string(), // eventId
	z.number(), // positionId
	z.string(), // pool
	z.string(), // symbol
	z.string(), // trader
	z.boolean(), // isLong
	z.string(), // status
	z.number(), // entryPrice
	z.number(), // margin
	z.number(), // leverage
	z.number(), // exitPrice
	z.number(), // pnl
	z.number(), // payout
	z.number(), // timestamp
	z.string(), // txHash
	z.number(), // updatedAt
]);

export type FuturesPositionStream = z.infer<typeof futuresPositionStreamSchema>;

export type FuturesPositionEvent = {
	eventId: "futuresPosition";
	positionId: number;
	pool: string;
	symbol: string;
	trader: string;
	isLong: boolean;
	status: "open" | "closed" | "liquidated";
	entryPrice: number;
	margin: number;
	leverage: number;
	exitPrice: number;
	pnl: number;
	payout: number;
	timestamp: number;
	txHash: string;
	updatedAt: number;
};

export function eventToFuturesPositionStream(
	obj: FuturesPositionEvent,
): FuturesPositionStream {
	return [
		obj.eventId,
		obj.positionId,
		obj.pool,
		obj.symbol,
		obj.trader,
		obj.isLong,
		obj.status,
		obj.entryPrice,
		obj.margin,
		obj.leverage,
		obj.exitPrice,
		obj.pnl,
		obj.payout,
		obj.timestamp,
		obj.txHash,
		obj.updatedAt,
	];
}

export function streamToFuturesPositionEvent(
	data: FuturesPositionStream,
): FuturesPositionEvent {
	return {
		eventId: data[0] as "futuresPosition",
		positionId: data[1],
		pool: data[2],
		symbol: data[3],
		trader: data[4],
		isLong: data[5],
		status: data[6] as "open" | "closed" | "liquidated",
		entryPrice: data[7],
		margin: data[8],
		leverage: data[9],
		exitPrice: data[10],
		pnl: data[11],
		payout: data[12],
		timestamp: data[13],
		txHash: data[14],
		updatedAt: data[15],
	};
}
