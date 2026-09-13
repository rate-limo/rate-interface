import { z } from "zod";

export const spotOrderBlockStreamSchema = z.tuple([
	z.string(), // eventId
	z.boolean(), // isBid
	z.number(), // price
	z.number(), // baseVolume
	z.number(), // quoteVolume
	z.string(), // scale
	z.number(), // timestamp
	z.number(), // updatedAt
]);

export type SpotOrderBlockStream = z.infer<typeof spotOrderBlockStreamSchema>;

export type SpotOrderBlockEvent = {
	eventId: "spotOrderBlock";
	isBid: boolean;
	price: number;
	baseLiquidity: number;
	quoteLiquidity: number;
	scale: string;
	timestamp: number;
	updatedAt: number;
};

export function eventToSpotOrderBlockStream(
	obj: SpotOrderBlockEvent,
): SpotOrderBlockStream {
	return [
		obj.eventId,
		obj.isBid,
		obj.price,
		obj.baseLiquidity,
		obj.quoteLiquidity,
		obj.scale,
		obj.timestamp,
		obj.updatedAt,
	];
}

export function streamToSpotOrderBlockEvent(
	data: SpotOrderBlockStream,
): SpotOrderBlockEvent {
	return {
		eventId: data[0] as "spotOrderBlock",
		isBid: data[1],
		price: data[2],
		baseLiquidity: data[3],
		quoteLiquidity: data[4],
		scale: data[5],
		timestamp: data[6],
		updatedAt: data[7],
	};
}
