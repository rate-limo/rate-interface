import { spotOrderBlockStreamSchema } from "./orderbook/spot";
import {
	spotOrderStreamSchema as orderSchema,
	spotOrderMatchedStreamSchema as matchedSchema,
	spotDeleteOrderItemStreamSchema as deleteSchema,
} from "./orders/spot";
import { spotBarsStreamSchema } from "./bars/spot";
import { spotTradeStreamSchema as tradeSchema } from "./trades/spot";
import { spotFillSummaryStreamSchema as fillSummarySchema } from "./trades/summary";
import { spotOrderHistoryStreamSchema as historySchema } from "./orderhistories/spot";
import { futuresMarkStreamSchema } from "./futures/mark";
import { futuresPositionStreamSchema } from "./futures/position";
import { futuresLiquidationStreamSchema } from "./futures/liquidation";
import {
	eventToSpotOrderBlockStream,
	streamToSpotOrderBlockEvent,
	type SpotOrderBlockEvent,
	type SpotOrderBlockStream,
} from "./orderbook";
import {
	eventToSpotOrderHistoryStream,
	streamToSpotOrderHistoryEvent,
	type SpotOrderHistoryEvent,
	type SpotOrderHistoryStream,
} from "./orderhistories";
import {
	eventToSpotTradeStream,
	streamToSpotTradeEvent,
	type SpotTradeEvent,
	type SpotTradeStream,
} from "./trades";
import {
	eventToSpotFillSummaryStream,
	streamToSpotFillSummaryEvent,
	type SpotFillSummaryEvent,
	type SpotFillSummaryStream,
} from "./trades/summary";
import {
	eventToSpotDeleteOrderItemStream,
	eventToSpotOrderStream,
	eventToSpotOrderMatchedStream,
	streamToSpotDeleteOrderItemEvent,
	streamToSpotOrderEvent,
	streamToSpotOrderMatchedEvent,
	type SpotDeleteOrderItemEvent,
	type SpotDeleteOrderItemStream,
	type SpotOrderEvent,
	type SpotOrderStream,
	type SpotOrderMatchedEvent,
	type SpotOrderMatchedStream,
} from "./orders";
import {
	eventToSpotBarStream,
	streamToSpotBarEvent,
	type SpotBarEvent,
	type SpotBarStream,
} from "./bars";
import {
	eventToFuturesMarkStream,
	streamToFuturesMarkEvent,
	type FuturesMarkEvent,
	type FuturesMarkStream,
	eventToFuturesPositionStream,
	streamToFuturesPositionEvent,
	type FuturesPositionEvent,
	type FuturesPositionStream,
	eventToFuturesLiquidationStream,
	streamToFuturesLiquidationEvent,
	type FuturesLiquidationEvent,
	type FuturesLiquidationStream,
} from "./futures";
import { SpotOrder } from "../tables/orderbooks/orders";
export * from "./orderbook";
export * from "./bars";
export * from "./orders";
export * from "./trades";
export * from "./orderhistories";
export * from "./futures";
export type StreamableObject =
	| SpotOrderBlockEvent
	| SpotBarEvent
	| SpotOrderEvent
	| SpotOrderMatchedEvent
	| SpotDeleteOrderItemEvent
	| SpotTradeEvent
	| SpotFillSummaryEvent
	| SpotOrderHistoryEvent
	| FuturesMarkEvent
	| FuturesPositionEvent
	| FuturesLiquidationEvent;
export type stream =
	| SpotOrderBlockStream
	| SpotBarStream
	| SpotOrderStream
	| SpotOrderMatchedStream
	| SpotDeleteOrderItemStream
	| SpotTradeStream
	| SpotFillSummaryStream
	| SpotOrderHistoryStream
	| FuturesMarkStream
	| FuturesPositionStream
	| FuturesLiquidationStream;

export function eventToStream<T extends StreamableObject>(
	obj: T,
): stream | null {
	const eventId = obj.eventId;
	switch (eventId) {
		case "spotOrderBlock":
			return eventToSpotOrderBlockStream(obj as SpotOrderBlockEvent);
		case "spotBar":
			return eventToSpotBarStream(obj as SpotBarEvent);
		case "spotOrder":
			return eventToSpotOrderStream(obj as SpotOrderEvent);
		// Had an encoder, a decoder and a schema but no case in either dispatcher until
		// 2026-08-02, so the broker's partial-fill emission encoded to null and was
		// never published — leaving the web's own `case "spotOrderMatched"` handler
		// unreachable and a partially-filled resting order stale until the next refetch.
		case "spotOrderMatched":
			return eventToSpotOrderMatchedStream(obj as SpotOrderMatchedEvent);
		case "spotTrade":
			return eventToSpotTradeStream(obj as SpotTradeEvent);
		// Synthesized by the gateway coalescer, never by the broker. It still needs a
		// case here: emitEventToRoom drops any frame whose eventId has no encoder, and
		// the round-trip self-check in the broker runs through this dispatcher.
		case "spotFillSummary":
			return eventToSpotFillSummaryStream(obj as SpotFillSummaryEvent);
		case "deleteSpotOrder":
			return eventToSpotDeleteOrderItemStream(obj as SpotDeleteOrderItemEvent);
		case "deleteSpotOrderHistory":
			return eventToSpotDeleteOrderItemStream(obj as SpotDeleteOrderItemEvent);
		case "spotOrderHistory":
			return eventToSpotOrderHistoryStream(obj as SpotOrderHistoryEvent);
		case "futuresMark":
			return eventToFuturesMarkStream(obj as FuturesMarkEvent);
		case "futuresPosition":
			return eventToFuturesPositionStream(obj as FuturesPositionEvent);
		case "futuresLiquidation":
			return eventToFuturesLiquidationStream(obj as FuturesLiquidationEvent);
		default:
			return null;
	}
}

/**
 * Decode a wire tuple into an event.
 *
 * Each branch PARSES with the schema rather than casting to it. A cast is what let the
 * decoder and the encoder drift apart unnoticed: the tuples are positional, so a schema
 * that has gained a field shifts every slot after it, and a cast asserts the old layout is
 * still true while quietly reading a fee where an address belongs. Parsing turns that into
 * a loud failure on the first frame.
 *
 * A frame that fails validation returns null rather than throwing — one malformed message
 * should not tear down a socket carrying every other market — but it is `console.warn`ed,
 * because silence is exactly how the last drift survived.
 */
function parseOrWarn<T>(schema: { parse: (v: unknown) => T }, stream: unknown, eventId: string): T | null {
	try {
		return schema.parse(stream);
	} catch (error) {
		console.warn(`streamToEvent: ${eventId} frame did not match its schema`, error);
		return null;
	}
}

/** Parse, then decode. Null when the frame does not match, so one bad message is dropped
 * rather than taking down a socket carrying every other market. */
function wrap<S, E>(
	schema: { parse: (v: unknown) => S },
	stream: unknown,
	eventId: string,
	decode: (parsed: S) => E,
): E | null {
	const parsed = parseOrWarn(schema, stream, eventId);
	return parsed === null ? null : decode(parsed);
}

export function streamToEvent(stream: stream): StreamableObject | null {
	const eventId = stream[0];
	switch (eventId) {
		case "spotOrderBlock":
			return wrap(spotOrderBlockStreamSchema, stream, "spotOrderBlock", streamToSpotOrderBlockEvent);
		case "spotBar":
			return wrap(spotBarsStreamSchema, stream, "spotBar", streamToSpotBarEvent);
		case "spotOrder":
			return wrap(orderSchema, stream, "spotOrder", streamToSpotOrderEvent);
		case "spotOrderMatched":
			return wrap(matchedSchema, stream, "spotOrderMatched", streamToSpotOrderMatchedEvent);
		case "spotTrade":
			return wrap(tradeSchema, stream, "spotTrade", streamToSpotTradeEvent);
		case "spotFillSummary":
			return wrap(fillSummarySchema, stream, "spotFillSummary", streamToSpotFillSummaryEvent);
		case "spotOrderHistory":
			return wrap(historySchema, stream, "spotOrderHistory", streamToSpotOrderHistoryEvent);
		// Both ids share one tuple shape, hence one schema.
		case "deleteSpotOrder":
			return wrap(deleteSchema, stream, "deleteSpotOrder", streamToSpotDeleteOrderItemEvent);
		case "deleteSpotOrderHistory":
			return wrap(
				deleteSchema,
				stream,
				"deleteSpotOrderHistory",
				streamToSpotDeleteOrderItemEvent,
			);
		case "futuresMark":
			return wrap(futuresMarkStreamSchema, stream, "futuresMark", streamToFuturesMarkEvent);
		case "futuresPosition":
			return wrap(futuresPositionStreamSchema, stream, "futuresPosition", streamToFuturesPositionEvent);
		case "futuresLiquidation":
			return wrap(
				futuresLiquidationStreamSchema,
				stream,
				"futuresLiquidation",
				streamToFuturesLiquidationEvent,
			);
		default:
			return null;
	}
}

// The matched-order event and the raw schemas were declared in ./orders but never
// re-exported here, so consumers of the package could not reach them — which is part of
// why apps/web kept its own copy. Re-exported now that the web imports this surface.
export {
	eventToSpotOrderMatchedStream,
	streamToSpotOrderMatchedEvent,
	spotOrderMatchedStreamSchema,
	spotOrderStreamSchema,
	spotDeleteOrderItemStreamSchema,
	type SpotOrderMatchedEvent,
	type SpotOrderMatchedStream,
} from "./orders/spot";
