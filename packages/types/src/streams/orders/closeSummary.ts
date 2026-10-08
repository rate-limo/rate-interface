import { z } from "zod";
import type { SpotDeleteOrderItemEvent } from "./spot";

/**
 * One transaction's order CLOSURES for one account, as a single frame.
 *
 * A sweep consumes a maker's resting orders whole, and each one closes with its
 * own `deleteSpotOrderHistory` (`status: "filled"`) on `spotAccount:{owner}` —
 * so a taker lifting ten of one maker's orders sends that maker ten closure
 * frames. `cancelOrders` does the same with `status: "canceled"`. This frame
 * carries a transaction's closures together.
 *
 * An envelope, not a digest: every closure is a row, in arrival order, and
 * `expandOrderCloseSummary` rebuilds exactly the `SpotDeleteOrderItemEvent[]`
 * the frames decode to. The header holds only what is IDENTICAL across the
 * group; `summarizeOrderCloses` checks that rather than assuming it and returns
 * null (the caller sends the raw frames) when anything hoisted differs.
 *
 * Keyed `(txHash, pair, status, account)`. Status is in the key so a fill and a
 * cancellation never share a frame (they are different news), pair because one
 * transaction can close orders in several markets. Side is NOT in the key — a
 * cancel-all closes both sides in one transaction — so `isBid` rides each row.
 *
 * `deleteSpotOrderHistory` only. `deleteSpotOrder` (the open-orders twin a
 * cancel also sends) is left per frame.
 */

/** [orderId, isBid, updatedAt] */
export const spotOrderCloseRowSchema = z.tuple([
	z.number(), // orderId
	z.boolean(), // isBid -- per row: a cancel-all closes both sides at once
	z.number(), // updatedAt -- per frame
]);

export type SpotOrderCloseRow = z.infer<typeof spotOrderCloseRowSchema>;

export const spotOrderCloseSummaryStreamSchema = z.tuple([
	z.string(), // eventId
	z.string(), // txHash
	z.string(), // pair
	z.string(), // account
	z.string(), // status -- "filled" | "canceled", as the per-order frames spell it
	z.number(), // timestamp -- block timestamp, shared by the transaction
	z.array(spotOrderCloseRowSchema), // rows, in arrival order
]);

export type SpotOrderCloseSummaryStream = z.infer<typeof spotOrderCloseSummaryStreamSchema>;

export type SpotOrderCloseSummaryEvent = {
	eventId: "spotOrderCloseSummary";
	txHash: string;
	pair: string;
	account: string;
	status: SpotDeleteOrderItemEvent["status"];
	timestamp: number;
	rows: SpotOrderCloseRow[];
};

export function eventToSpotOrderCloseSummaryStream(
	obj: SpotOrderCloseSummaryEvent,
): SpotOrderCloseSummaryStream {
	return [obj.eventId, obj.txHash, obj.pair, obj.account, obj.status, obj.timestamp, obj.rows];
}

export function streamToSpotOrderCloseSummaryEvent(
	data: SpotOrderCloseSummaryStream,
): SpotOrderCloseSummaryEvent {
	return {
		eventId: data[0] as "spotOrderCloseSummary",
		txHash: data[1],
		pair: data[2],
		account: data[3],
		status: data[4] as SpotDeleteOrderItemEvent["status"],
		timestamp: data[5],
		rows: data[6],
	};
}

/** Rebuilds the per-order closure events the envelope stands in for, in arrival order. */
export function expandOrderCloseSummary(
	summary: SpotOrderCloseSummaryEvent,
): SpotDeleteOrderItemEvent[] {
	return summary.rows.map((row) => ({
		eventId: "deleteSpotOrderHistory" as const,
		isBid: row[1],
		pair: summary.pair,
		account: summary.account,
		orderId: row[0],
		txHash: summary.txHash,
		timestamp: summary.timestamp,
		status: summary.status,
		updatedAt: row[2],
	}));
}

const HOISTED = ["eventId", "txHash", "pair", "account", "status", "timestamp"] as const satisfies readonly (
	keyof SpotDeleteOrderItemEvent
)[];

/**
 * Folds closure events into one envelope, or null when they cannot be folded
 * exactly: no events, an event that is not a `deleteSpotOrderHistory`, or a
 * hoisted field that differs. Grouping is the caller's job (`orderCloseSummaryKey`).
 */
export function summarizeOrderCloses(
	events: SpotDeleteOrderItemEvent[],
): SpotOrderCloseSummaryEvent | null {
	const head = events[0];
	if (head === undefined || head.eventId !== "deleteSpotOrderHistory") return null;
	for (const e of events) {
		for (const field of HOISTED) {
			if (e[field] !== head[field]) return null;
		}
	}
	return {
		eventId: "spotOrderCloseSummary",
		txHash: head.txHash,
		pair: head.pair,
		account: head.account,
		status: head.status,
		timestamp: head.timestamp,
		rows: events.map((e) => [e.orderId, e.isBid, e.updatedAt]),
	};
}

export function orderCloseSummaryKey(
	e: Pick<SpotDeleteOrderItemEvent, "txHash" | "pair" | "status" | "account">,
): string {
	return `${e.txHash}:${e.pair}:${e.status}:${e.account.toLowerCase()}`;
}
