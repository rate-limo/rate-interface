/** Schema-only round-trip unit test for the futures stream tuples — no
 * network/db needed. @iter/types has no vitest setup, so this mirrors
 * the repo's tsx assert harness pattern (see packages/queue/src/futures.test.ts)
 * and borrows a workspace tsx install to run it:
 * apps/broker/node_modules/.bin/tsx packages/types/src/streams/futures/futures.test.ts */
import assert from "node:assert/strict";
import {
	eventToFuturesMarkStream,
	streamToFuturesMarkEvent,
	futuresMarkStreamSchema,
	type FuturesMarkEvent,
} from "./mark";
import {
	eventToFuturesPositionStream,
	streamToFuturesPositionEvent,
	futuresPositionStreamSchema,
	type FuturesPositionEvent,
} from "./position";
import {
	eventToFuturesLiquidationStream,
	streamToFuturesLiquidationEvent,
	futuresLiquidationStreamSchema,
	type FuturesLiquidationEvent,
} from "./liquidation";

let assertions = 0;
function check(label: string, fn: () => void): void {
	fn();
	assertions++;
	console.log(`ok - ${label}`);
}

// --- futuresMark ---

const markEvent: FuturesMarkEvent = {
	eventId: "futuresMark",
	symbol: "ETH/USDC-PERP",
	pool: "0x11111111111111111111111111111111111111",
	mark: 3450.12,
	indexPrice: 3449.5,
	fundingRate: 0.0001,
	fundingIndicative: true,
	longOI: 1200.5,
	shortOI: 980.25,
	timestamp: 1_753_000_000,
	updatedAt: 1_753_000_001,
};

check("futuresMark: tuple has 11 fields", () => {
	assert.equal(eventToFuturesMarkStream(markEvent).length, 11);
});

check("futuresMark: encode -> decode round-trips to an identical event", () => {
	const stream = eventToFuturesMarkStream(markEvent);
	assert.deepEqual(streamToFuturesMarkEvent(stream), markEvent);
});

check("futuresMark: encoded tuple parses against its own schema", () => {
	const stream = eventToFuturesMarkStream(markEvent);
	assert.deepEqual(futuresMarkStreamSchema.parse(stream), stream);
});

check("futuresMark: wrong-arity tuple is rejected", () => {
	const stream = eventToFuturesMarkStream(markEvent);
	assert.throws(() => futuresMarkStreamSchema.parse(stream.slice(0, -1)));
	assert.throws(() => futuresMarkStreamSchema.parse([...stream, 0]));
});

// --- futuresPosition ---

const positionEvent: FuturesPositionEvent = {
	eventId: "futuresPosition",
	positionId: 42,
	pool: "0x22222222222222222222222222222222222222",
	symbol: "ETH/USDC-PERP",
	trader: "0x33333333333333333333333333333333333333",
	isLong: true,
	status: "closed",
	entryPrice: 3400,
	margin: 500,
	leverage: 5,
	exitPrice: 3500,
	pnl: 147.06,
	payout: 647.06,
	timestamp: 1_753_000_100,
	txHash: "0xabc123",
	updatedAt: 1_753_000_101,
};

check("futuresPosition: tuple has 16 fields", () => {
	assert.equal(eventToFuturesPositionStream(positionEvent).length, 16);
});

check(
	"futuresPosition: encode -> decode round-trips to an identical event",
	() => {
		const stream = eventToFuturesPositionStream(positionEvent);
		assert.deepEqual(streamToFuturesPositionEvent(stream), positionEvent);
	},
);

check("futuresPosition: encoded tuple parses against its own schema", () => {
	const stream = eventToFuturesPositionStream(positionEvent);
	assert.deepEqual(futuresPositionStreamSchema.parse(stream), stream);
});

check("futuresPosition: wrong-arity tuple is rejected", () => {
	const stream = eventToFuturesPositionStream(positionEvent);
	assert.throws(() => futuresPositionStreamSchema.parse(stream.slice(0, -1)));
	assert.throws(() => futuresPositionStreamSchema.parse([...stream, 0]));
});

// --- futuresLiquidation ---

const liquidationEvent: FuturesLiquidationEvent = {
	eventId: "futuresLiquidation",
	positionId: 7,
	pool: "0x4444444444444444444444444444444444444444",
	symbol: "BTC/USDC-PERP",
	trader: "0x5555555555555555555555555555555555555555",
	markPrice: 61000.5,
	feeFund: 12.3,
	poolFund: 45.6,
	byKeeper: true,
	timestamp: 1_753_000_200,
	txHash: "0xdef456",
	updatedAt: 1_753_000_201,
};

check("futuresLiquidation: tuple has 12 fields", () => {
	assert.equal(eventToFuturesLiquidationStream(liquidationEvent).length, 12);
});

check(
	"futuresLiquidation: encode -> decode round-trips to an identical event",
	() => {
		const stream = eventToFuturesLiquidationStream(liquidationEvent);
		assert.deepEqual(
			streamToFuturesLiquidationEvent(stream),
			liquidationEvent,
		);
	},
);

check(
	"futuresLiquidation: encoded tuple parses against its own schema",
	() => {
		const stream = eventToFuturesLiquidationStream(liquidationEvent);
		assert.deepEqual(futuresLiquidationStreamSchema.parse(stream), stream);
	},
);

check("futuresLiquidation: wrong-arity tuple is rejected", () => {
	const stream = eventToFuturesLiquidationStream(liquidationEvent);
	assert.throws(() =>
		futuresLiquidationStreamSchema.parse(stream.slice(0, -1)),
	);
	assert.throws(() => futuresLiquidationStreamSchema.parse([...stream, 0]));
});

console.log(`\n${assertions} assertions passed`);
