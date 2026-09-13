import { z } from "zod";
export const spotBarsStreamSchema = z.tuple([
	z.string(), // eventId
	z.string(), // id (e.g. "ETH/USDC:1m")
	z.number(), // current price
	z.number(), // timestamp
	z.number(), // volume
	z.number(), // updatedAt
]);

export type SpotBarStream = z.infer<typeof spotBarsStreamSchema>;

export type SpotBarEvent = {
	eventId: string;
	id: string;
	price: number;
	timestamp: number;
	volume: number;
	updatedAt: number;
};

export function eventToSpotBarStream(obj: SpotBarEvent): SpotBarStream {
	return [obj.eventId, obj.id, obj.price, obj.timestamp, obj.volume, obj.updatedAt];
}

export function streamToSpotBarEvent(data: SpotBarStream): SpotBarEvent {
	return {
		eventId: data[0],
		id: data[1],
		price: data[2],
		timestamp: data[3],
		volume: data[4],
		updatedAt: data[5],
	};
}
