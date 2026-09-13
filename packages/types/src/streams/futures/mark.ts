import { z } from "zod";

export const futuresMarkStreamSchema = z.tuple([
	z.string(), // eventId
	z.string(), // symbol
	z.string(), // pool
	z.number(), // mark
	z.number(), // indexPrice
	z.number(), // fundingRate
	z.boolean(), // fundingIndicative
	z.number(), // longOI
	z.number(), // shortOI
	z.number(), // timestamp
	z.number(), // updatedAt
]);

export type FuturesMarkStream = z.infer<typeof futuresMarkStreamSchema>;

export type FuturesMarkEvent = {
	eventId: "futuresMark";
	symbol: string;
	pool: string;
	mark: number;
	indexPrice: number;
	fundingRate: number;
	fundingIndicative: boolean;
	longOI: number;
	shortOI: number;
	timestamp: number;
	updatedAt: number;
};

export function eventToFuturesMarkStream(
	obj: FuturesMarkEvent,
): FuturesMarkStream {
	return [
		obj.eventId,
		obj.symbol,
		obj.pool,
		obj.mark,
		obj.indexPrice,
		obj.fundingRate,
		obj.fundingIndicative,
		obj.longOI,
		obj.shortOI,
		obj.timestamp,
		obj.updatedAt,
	];
}

export function streamToFuturesMarkEvent(
	data: FuturesMarkStream,
): FuturesMarkEvent {
	return {
		eventId: data[0] as "futuresMark",
		symbol: data[1],
		pool: data[2],
		mark: data[3],
		indexPrice: data[4],
		fundingRate: data[5],
		fundingIndicative: data[6],
		longOI: data[7],
		shortOI: data[8],
		timestamp: data[9],
		updatedAt: data[10],
	};
}
