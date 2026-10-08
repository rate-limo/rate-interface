/** Encode ↔ decode agreement for every stream type on the wire.
 *
 * This is the test that would have caught the drift. `apps/web` used to keep a second,
 * hand-written copy of these tuples; three of them were missing a field the schema here
 * had gained, so every slot after it decoded one position off — a fee read as a taker
 * address, `amount` read as `assetDecimals`. Nothing failed, because the tuples are
 * positional and the web's decoder cast instead of parsing. The web's copy is gone now,
 * but the encoder, the decoder and the zod schema in THIS package are still three
 * hand-maintained descriptions of one layout, and any two of them can still drift.
 *
 * Three properties per type, and between them the drift becomes loud:
 *
 *  1. **Round-trip identity** — decode(encode(x)) deep-equals x, so a field the encoder
 *     writes at one index and the decoder reads at another cannot pass.
 *  2. **Schema accepts the encoder's output** — catches a schema that has gained or lost
 *     a slot relative to what is actually sent.
 *  3. **Arity agreement** — the tuple's declared length equals what the encoder emits, so
 *     appending to the event type without extending the schema fails here.
 *
 * A fourth check runs each case through `eventToStream`/`streamToEvent` rather than the
 * per-type functions, because a type can have a correct encoder, decoder AND schema and
 * still be unreachable: `spotOrderMatched` had all three and no case in either dispatcher,
 * so the broker's partial-fill frame encoded to null and was silently never published.
 *
 * All ten schemas are covered, not just the three that drifted.
 *
 * Run: pnpm --filter @iter/types test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";


import {
	eventToSpotTradeStream,
	streamToSpotTradeEvent,
	spotTradeStreamSchema,
	type SpotTradeEvent,
} from "./trades/spot";
import {
	eventToSpotOrderStream,
	streamToSpotOrderEvent,
	spotOrderStreamSchema,
	eventToSpotOrderMatchedStream,
	streamToSpotOrderMatchedEvent,
	spotOrderMatchedStreamSchema,
	eventToSpotDeleteOrderItemStream,
	streamToSpotDeleteOrderItemEvent,
	spotDeleteOrderItemStreamSchema,
	type SpotOrderEvent,
	type SpotOrderMatchedEvent,
	type SpotDeleteOrderItemEvent,
} from "./orders/spot";
import {
	eventToSpotOrderHistoryStream,
	streamToSpotOrderHistoryEvent,
	spotOrderHistoryStreamSchema,
	type SpotOrderHistoryEvent,
} from "./orderhistories/spot";
import {
	eventToSpotFillSummaryStream,
	streamToSpotFillSummaryEvent,
	spotFillSummaryStreamSchema,
	summarizeFills,
	expandFillSummary,
	collapseFillSummary,
	type SpotFillSummaryEvent,
} from "./trades/summary";
import { makerOrderIdFromWire } from "./trades/makerOrderId";
import {
	eventToSpotOrderCloseSummaryStream,
	streamToSpotOrderCloseSummaryEvent,
	spotOrderCloseSummaryStreamSchema,
	summarizeOrderCloses,
	expandOrderCloseSummary,
	type SpotOrderCloseSummaryEvent,
} from "./orders/closeSummary";
import {
	eventToSpotBarStream,
	streamToSpotBarEvent,
	spotBarsStreamSchema,
	type SpotBarEvent,
} from "./bars/spot";
import {
	eventToSpotOrderBlockStream,
	streamToSpotOrderBlockEvent,
	spotOrderBlockStreamSchema,
	type SpotOrderBlockEvent,
} from "./orderbook/spot";
import {
	eventToFuturesMarkStream,
	streamToFuturesMarkEvent,
	futuresMarkStreamSchema,
	type FuturesMarkEvent,
} from "./futures/mark";
import {
	eventToFuturesPositionStream,
	streamToFuturesPositionEvent,
	futuresPositionStreamSchema,
	type FuturesPositionEvent,
} from "./futures/position";
import {
	eventToFuturesLiquidationStream,
	streamToFuturesLiquidationEvent,
	futuresLiquidationStreamSchema,
	type FuturesLiquidationEvent,
} from "./futures/liquidation";
import {
	streamToEvent,
	eventToStream,
	type StreamableObject,
	type stream,
} from "./index";

/** One wire type: a sample event, the two functions that move it across the socket, and
 * the schema that is supposed to describe what they produce. */
type Case<E extends StreamableObject, S> = {
	name: string;
	event: E;
	encode: (event: E) => S;
	decode: (stream: S) => E;
	schema: { parse: (value: unknown) => unknown; items: readonly unknown[] };
	/** Slots the encoder emits BEYOND `schema.items` — i.e. `.rest()` entries.
	 *
	 * Declared per case rather than inferred, so the arity check stays strict: a
	 * schema with `.rest()` accepts any trailing count, and without this the check
	 * would have to be loosened to `>=` and would stop catching an encoder that
	 * silently gained or lost a slot. */
	restSlots?: number;
};

/** The four assertions, pre-bound as closures.
 *
 * They are closures rather than data because the cases below have ten different event
 * types: held as a `Case<E, S>[]`, TypeScript unifies the array into a union and every
 * `encode` then demands the INTERSECTION of all ten events, which reduces to `never`.
 * Capturing each case's concrete types here keeps the array homogeneous. */
type Check = {
	name: string;
	roundTrip: () => void;
	schemaAccepts: () => void;
	arity: () => void;
	dispatch: () => void;
};

/** Values in each sample are deliberately all-distinct — a duplicated 0 or "" would let a
 * transposed pair of adjacent slots round-trip cleanly and hide the exact bug this
 * catches. */
function testCase<E extends StreamableObject, S>(c: Case<E, S>): Check {
	return {
		name: c.name,
		roundTrip: () => {
			assert.deepEqual(c.decode(c.encode(c.event)), c.event);
		},
		schemaAccepts: () => {
			// Throws naming the offending index if schema and encoder disagree.
			c.schema.parse(c.encode(c.event));
		},
		arity: () => {
			const encoded = c.encode(c.event) as unknown as unknown[];
			const expected = c.schema.items.length + (c.restSlots ?? 0);
			assert.equal(
				encoded.length,
				expected,
				`${c.name}: encoder emits ${encoded.length} slots, schema declares ${expected}`,
			);
		},
		dispatch: () => {
			const encoded = eventToStream(c.event);
			assert.notEqual(encoded, null, `${c.name} is unhandled by eventToStream`);
			assert.deepEqual(streamToEvent(encoded as stream), c.event);
		},
	};
}

const trade: SpotTradeEvent = {
	eventId: "spotTrade",
	orderId: 7,
	makerOrderId: 7,
	base: "0xbase",
	quote: "0xquote",
	baseSymbol: "NOVA",
	quoteSymbol: "USDC",
	baseLogoURI: "https://logo/base.png",
	quoteLogoURI: "https://logo/quote.png",
	pair: "0xpair",
	pairSymbol: "NOVA/USDC",
	isBid: true,
	price: 1635.11,
	account: "0xaccount",
	asset: "0xasset",
	assetSymbol: "NOVA",
	amount: 12.5,
	valueUSD: 20438,
	baseAmount: 12.25,
	quoteAmount: 20437,
	baseFee: 0.0125,
	quoteFee: 20.4,
	timestamp: 1785600000,
	taker: "0xtaker",
	maker: "0xmaker",
	txHash: "0xhash",
	updatedAt: 1785600001,
};

/** Built through `summarizeFills` rather than hand-written: the envelope's whole
 * job is to stand in for per-fill frames losslessly, so the fixture should be what
 * the folder actually produces from real trades. */
const fillSummary = summarizeFills([
	trade,
	{ ...trade, orderId: 8, makerOrderId: 8, price: 1636.5, amount: 4, valueUSD: 6546, maker: "0xmaker2" },
]) as SpotFillSummaryEvent;

const order: SpotOrderEvent = {
	eventId: "spotOrder",
	isBid: false,
	orderId: 42,
	base: "0xbase",
	baseSymbol: "NOVA",
	baseLogoURI: "https://logo/base.png",
	quote: "0xquote",
	quoteSymbol: "USDC",
	quoteLogoURI: "https://logo/quote.png",
	pairSymbol: "NOVA/USDC",
	pair: "0xpair",
	price: 1635.11,
	asset: "0xasset",
	assetSymbol: "NOVA",
	assetDecimals: 18,
	amount: 3,
	placed: 2,
	timestamp: 1785600000,
	account: "0xaccount",
	txHash: "0xhash",
	updatedAt: 1785600001,
	amountBN: "3000000000000000000",
	placedBN: "1500000000000000000",
};

const matched: SpotOrderMatchedEvent = {
	eventId: "spotOrderMatched",
	isBid: true,
	orderId: 43,
	base: "0xbase",
	baseSymbol: "NOVA",
	baseLogoURI: "https://logo/base.png",
	quote: "0xquote",
	quoteSymbol: "USDC",
	quoteLogoURI: "https://logo/quote.png",
	pairSymbol: "NOVA/USDC",
	pair: "0xpair",
	price: 1635.11,
	asset: "0xasset",
	assetSymbol: "NOVA",
	assetDecimals: 18,
	amount: 6,
	placed: 4,
	matched: 2,
	timestamp: 1785600000,
	account: "0xaccount",
	txHash: "0xhash",
	updatedAt: 1785600001,
	amountBN: "3000000000000000000",
	placedBN: "1500000000000000000",
};

const deleted: SpotDeleteOrderItemEvent = {
	eventId: "deleteSpotOrder",
	isBid: false,
	pair: "0xpair",
	account: "0xaccount",
	orderId: 44,
	txHash: "0xhash",
	timestamp: 1785600000,
	status: "canceled",
	updatedAt: 1785600001,
};

/** Two orders of one maker cleared by one sweep, as the folder builds it. */
const closeSummary = summarizeOrderCloses([
	{ ...deleted, eventId: "deleteSpotOrderHistory", status: "filled" },
	{ ...deleted, eventId: "deleteSpotOrderHistory", status: "filled", orderId: 45, isBid: true, updatedAt: 1785600002 },
]) as SpotOrderCloseSummaryEvent;

const history: SpotOrderHistoryEvent = {
	eventId: "spotOrderHistory",
	isBid: true,
	orderId: 9,
	base: "0xbase",
	baseSymbol: "NOVA",
	quote: "0xquote",
	quoteSymbol: "USDC",
	pairSymbol: "NOVA/USDC",
	pair: "0xpair",
	price: 1635.11,
	asset: "0xasset",
	assetSymbol: "NOVA",
	assetDecimals: 18,
	amount: 5,
	timestamp: 1785600000,
	account: "0xaccount",
	txHash: "0xhash",
	gasUsed: 21000,
	status: "filled",
	updatedAt: 1785600001,
};

const bar: SpotBarEvent = {
	eventId: "spotBar",
	id: "0xpair-60",
	price: 1635.11,
	timestamp: 1785600000,
	volume: 91234,
	updatedAt: 1785600001,
};

const block: SpotOrderBlockEvent = {
	eventId: "spotOrderBlock",
	isBid: true,
	price: 1635.11,
	baseLiquidity: 12.5,
	quoteLiquidity: 20438,
	scale: "0.01",
	timestamp: 1785600000,
	updatedAt: 1785600001,
};

const mark: FuturesMarkEvent = {
	eventId: "futuresMark",
	symbol: "ETH-PERP",
	pool: "0xpool",
	mark: 1635.11,
	indexPrice: 1634.02,
	fundingRate: 0.0001,
	fundingIndicative: true,
	longOI: 4200,
	shortOI: 3900,
	timestamp: 1785600000,
	updatedAt: 1785600001,
};

const position: FuturesPositionEvent = {
	eventId: "futuresPosition",
	positionId: 88,
	pool: "0xpool",
	symbol: "ETH-PERP",
	trader: "0xtrader",
	isLong: true,
	status: "open",
	entryPrice: 1630.5,
	margin: 500,
	leverage: 5,
	exitPrice: 1640.25,
	pnl: 48.75,
	payout: 548.75,
	timestamp: 1785600000,
	txHash: "0xhash",
	updatedAt: 1785600001,
};

const liquidation: FuturesLiquidationEvent = {
	eventId: "futuresLiquidation",
	positionId: 89,
	pool: "0xpool",
	symbol: "ETH-PERP",
	trader: "0xtrader",
	markPrice: 1500.75,
	feeFund: 12.5,
	poolFund: 30.25,
	byKeeper: true,
	timestamp: 1785600000,
	txHash: "0xhash",
	updatedAt: 1785600001,
};

const cases = [
	testCase({
		name: "spotTrade",
		event: trade,
		encode: eventToSpotTradeStream,
		decode: streamToSpotTradeEvent,
		schema: spotTradeStreamSchema,
	}),
	testCase({
		name: "spotOrder",
		event: order,
		restSlots: 2,
		encode: eventToSpotOrderStream,
		decode: streamToSpotOrderEvent,
		schema: spotOrderStreamSchema,
	}),
	testCase({
		name: "spotOrderMatched",
		event: matched,
		restSlots: 2,
		encode: eventToSpotOrderMatchedStream,
		decode: streamToSpotOrderMatchedEvent,
		schema: spotOrderMatchedStreamSchema,
	}),
	testCase({
		name: "deleteSpotOrder",
		event: deleted,
		encode: eventToSpotDeleteOrderItemStream,
		decode: streamToSpotDeleteOrderItemEvent,
		schema: spotDeleteOrderItemStreamSchema,
	}),
	testCase({
		name: "spotOrderCloseSummary",
		event: closeSummary,
		encode: eventToSpotOrderCloseSummaryStream,
		decode: streamToSpotOrderCloseSummaryEvent,
		schema: spotOrderCloseSummaryStreamSchema,
	}),
	testCase({
		name: "spotFillSummary",
		event: fillSummary,
		encode: eventToSpotFillSummaryStream,
		decode: streamToSpotFillSummaryEvent,
		schema: spotFillSummaryStreamSchema,
	}),
	testCase({
		name: "spotOrderHistory",
		event: history,
		encode: eventToSpotOrderHistoryStream,
		decode: streamToSpotOrderHistoryEvent,
		schema: spotOrderHistoryStreamSchema,
	}),
	testCase({
		name: "spotBar",
		event: bar,
		encode: eventToSpotBarStream,
		decode: streamToSpotBarEvent,
		schema: spotBarsStreamSchema,
	}),
	testCase({
		name: "spotOrderBlock",
		event: block,
		encode: eventToSpotOrderBlockStream,
		decode: streamToSpotOrderBlockEvent,
		schema: spotOrderBlockStreamSchema,
	}),
	testCase({
		name: "futuresMark",
		event: mark,
		encode: eventToFuturesMarkStream,
		decode: streamToFuturesMarkEvent,
		schema: futuresMarkStreamSchema,
	}),
	testCase({
		name: "futuresPosition",
		event: position,
		encode: eventToFuturesPositionStream,
		decode: streamToFuturesPositionEvent,
		schema: futuresPositionStreamSchema,
	}),
	testCase({
		name: "futuresLiquidation",
		event: liquidation,
		encode: eventToFuturesLiquidationStream,
		decode: streamToFuturesLiquidationEvent,
		schema: futuresLiquidationStreamSchema,
	}),
];

for (const c of cases) {
	describe(`${c.name} wire format`, () => {
		it("survives encode → decode unchanged", c.roundTrip);
		it("produces a tuple its own schema accepts", c.schemaAccepts);
		it("emits exactly as many slots as the schema declares", c.arity);
		it("round-trips through the eventToStream / streamToEvent dispatchers", c.dispatch);
	});
}

/** The three fields whose slots moved when `baseFee`/`quoteFee` were inserted at 19–20.
 * Named explicitly so a regression reports the actual symptom, not just "deepEqual". */
describe("the fields that drifted", () => {
	it("keeps trade taker/maker/txHash as addresses after the fee slots", () => {
		const decoded = streamToSpotTradeEvent(eventToSpotTradeStream(trade));
		assert.equal(decoded.baseFee, 0.0125);
		assert.equal(decoded.quoteFee, 20.4);
		assert.equal(decoded.taker, "0xtaker");
		assert.equal(decoded.maker, "0xmaker");
		assert.equal(decoded.txHash, "0xhash");
	});

	it("keeps assetDecimals distinct from amount on orders and history", () => {
		const o = streamToSpotOrderEvent(eventToSpotOrderStream(order));
		assert.equal(o.assetDecimals, 18);
		assert.equal(o.amount, 3);

		const h = streamToSpotOrderHistoryEvent(eventToSpotOrderHistoryStream(history));
		assert.equal(h.assetDecimals, 18);
		assert.equal(h.amount, 5);
	});
});

describe("streamToEvent parses rather than casts", () => {
	it("drops a malformed frame instead of decoding garbage", () => {
		assert.equal(streamToEvent(["spotTrade", "not-a-number"] as never), null);
	});

	it("returns null for an unknown eventId", () => {
		assert.equal(streamToEvent(["somethingElse"] as never), null);
	});
});

/** The envelope replaces per-fill frames on the account topic, so "no rows are lost"
 * is not a nice property — it is the precondition for replacing them at all. */
describe("spotFillSummary is a lossless stand-in for the frames it replaces", () => {
	it("expands back to exactly the trades it was folded from", () => {
		const trades = [
			trade,
			{ ...trade, orderId: 8, makerOrderId: 8, price: 1636.5, amount: 4, valueUSD: 6546, maker: "0xmaker2" },
		];
		assert.deepEqual(expandFillSummary(summarizeFills(trades) as SpotFillSummaryEvent), trades);
	});

	it("survives the wire, not just the fold", () => {
		const trades = [
			trade,
			{ ...trade, orderId: 8, makerOrderId: 8, price: 1636.5, amount: 4, valueUSD: 6546, maker: "0xmaker2" },
		];
		const onWire = eventToSpotFillSummaryStream(summarizeFills(trades) as SpotFillSummaryEvent);
		const decoded = streamToEvent(onWire) as SpotFillSummaryEvent;
		assert.deepEqual(expandFillSummary(decoded), trades);
	});

	it("weights the average price by size rather than averaging the prices", () => {
		// 12.5 @ 1635.11 and 4 @ 1636.5 -> the small fill must not pull it halfway.
		const s = summarizeFills([
			trade,
			{ ...trade, orderId: 8, makerOrderId: 8, price: 1636.5, amount: 4, valueUSD: 6546, maker: "0xmaker2" },
		]) as SpotFillSummaryEvent;
		const expected = (12.5 * 1635.11 + 4 * 1636.5) / 16.5;
		assert.ok(Math.abs(s.avgPrice - expected) < 1e-9);
		assert.notEqual(s.avgPrice, (1635.11 + 1636.5) / 2);
		assert.equal(s.matched, 16.5);
	});

	it("reports the last price rather than 0 when every fill rounded to no size", () => {
		// A reported price of 0 reads as a catastrophic execution, not as "no size".
		const s = summarizeFills([{ ...trade, amount: 0, price: 99 }]) as SpotFillSummaryEvent;
		assert.equal(s.matched, 0);
		assert.equal(s.avgPrice, 99);
	});

	it("returns null for no fills rather than an envelope describing nothing", () => {
		assert.equal(summarizeFills([]), null);
	});
});

/** The wire spells "no resting order" (a pool fill) as orderId 0, because the
 * column is NOT NULL and the slot a plain number. The decoders translate it, so
 * no reader compares against 0 — and REST does the same translation, so a live
 * row and a fetched row for the same fill agree. */
describe("makerOrderId: the wire's 0 becomes null at decode", () => {
	const poolFill: SpotTradeEvent = { ...trade, orderId: 0, makerOrderId: null, maker: "0xpool" };

	it("a per-fill pool frame decodes to makerOrderId null, keeping the legacy orderId 0", () => {
		const decoded = streamToSpotTradeEvent(eventToSpotTradeStream(poolFill));
		assert.equal(decoded.makerOrderId, null);
		assert.equal(decoded.orderId, 0);
	});

	it("a book fill decodes to its resting order's id", () => {
		assert.equal(streamToSpotTradeEvent(eventToSpotTradeStream(trade)).makerOrderId, 7);
	});

	it("expanding an envelope translates each fill on its own", () => {
		const out = expandFillSummary(summarizeFills([trade, poolFill]) as SpotFillSummaryEvent);
		assert.deepEqual(
			out.map((t) => t.makerOrderId),
			[7, null],
		);
	});

	it("collapsing takes MIN over every fill, the pool's 0 included, like the SQL", () => {
		// `groupedTradeSelection.orderId` is `min(spotTrades.orderId)`. If this side
		// skipped the 0, a mixed sweep would key differently live and on refetch.
		const mixed = collapseFillSummary(summarizeFills([trade, poolFill]) as SpotFillSummaryEvent);
		assert.equal(mixed.orderId, 0);
		assert.equal(mixed.makerOrderId, null);

		const book = collapseFillSummary(
			summarizeFills([trade, { ...trade, orderId: 3, makerOrderId: 3 }]) as SpotFillSummaryEvent,
		);
		assert.equal(book.orderId, 3);
		assert.equal(book.makerOrderId, 3);
	});

	it("makerOrderIdFromWire refuses everything that is not an engine id", () => {
		for (const v of [0, "0", null, undefined, "", -1, 1.5, Number.NaN]) {
			assert.equal(makerOrderIdFromWire(v as never), null, String(v));
		}
		assert.equal(makerOrderIdFromWire(1), 1);
		assert.equal(makerOrderIdFromWire("12"), 12);
		assert.equal(makerOrderIdFromWire(BigInt(9)), 9);
	});
});

/** A maker's closures from one sweep: replacing the frames is only allowed because
 * the envelope gives back exactly what they decode to. */
describe("spotOrderCloseSummary is a lossless stand-in for the frames it replaces", () => {
	const closure = (over: Partial<SpotDeleteOrderItemEvent>): SpotDeleteOrderItemEvent => ({
		...deleted,
		eventId: "deleteSpotOrderHistory",
		status: "filled",
		...over,
	});
	const frames = [
		closure({ orderId: 44 }),
		closure({ orderId: 45, isBid: true, updatedAt: 1785600002 }),
		closure({ orderId: 46, updatedAt: 1785600003 }),
	].map(eventToSpotDeleteOrderItemStream);
	const perOrder = frames.map((f) => streamToEvent(f as never) as SpotDeleteOrderItemEvent);

	it("expands back to exactly the per-order closures, in arrival order, through the wire", () => {
		assert.equal(perOrder.length, 3);
		const summary = summarizeOrderCloses(perOrder) as SpotOrderCloseSummaryEvent;
		const decoded = streamToEvent(
			JSON.parse(JSON.stringify(eventToSpotOrderCloseSummaryStream(summary))),
		) as SpotOrderCloseSummaryEvent;
		assert.equal(decoded.eventId, "spotOrderCloseSummary");
		assert.deepEqual(expandOrderCloseSummary(decoded), perOrder);
	});

	it("keeps side and updatedAt per row — a cancel-all closes both sides", () => {
		const summary = summarizeOrderCloses(perOrder) as SpotOrderCloseSummaryEvent;
		assert.deepEqual(summary.rows, [
			[44, false, 1785600001],
			[45, true, 1785600002],
			[46, false, 1785600003],
		]);
	});

	it("declines rather than hoist a field that differs, or fold a deleteSpotOrder", () => {
		assert.equal(summarizeOrderCloses([closure({}), closure({ status: "canceled" })]), null);
		assert.equal(summarizeOrderCloses([closure({}), closure({ timestamp: 1 })]), null);
		assert.equal(summarizeOrderCloses([deleted, { ...deleted, orderId: 45 }]), null);
		assert.equal(summarizeOrderCloses([]), null);
	});

	it("drops a malformed envelope rather than decoding garbage", () => {
		assert.equal(streamToEvent(["spotOrderCloseSummary", "0xhash"] as never), null);
	});
});

/** The fill envelope on a MAKER's topic: the same transaction's fills, every one
 * against a different resting order of theirs. Exact means each row keeps its own
 * maker order id, so the maker's per-order rows survive the fold. */
describe("spotFillSummary carries a maker's fills without merging their orders", () => {
	it("expands to the per-fill events, each keeping its own order id and price", () => {
		const fills = [
			{ ...trade, orderId: 9, makerOrderId: 9, price: 5e-6, maker: "0xmaker" },
			{ ...trade, orderId: 10, makerOrderId: 10, price: 5.01e-6, maker: "0xmaker" },
		];
		const frames = fills.map((t) => streamToEvent(eventToSpotTradeStream(t) as never) as SpotTradeEvent);
		const onWire = JSON.parse(JSON.stringify(eventToSpotFillSummaryStream(summarizeFills(frames) as SpotFillSummaryEvent)));
		const out = expandFillSummary(streamToEvent(onWire) as SpotFillSummaryEvent);
		assert.deepEqual(out, frames);
		assert.deepEqual(out.map((t) => [t.makerOrderId, t.price]), [[9, 5e-6], [10, 5.01e-6]]);
	});
});

/** The broker and the web deploy separately, so both directions of version skew
 * happen in production. A strict tuple would make one of them drop every frame —
 * silently, since a failed parse is an absence, not an error. */
describe("order frames survive a broker and a client at different versions", () => {
	it("a frame WITHOUT the exact slots still decodes", () => {
		// What a broker deployed before migration 0031 emits.
		const old = eventToSpotOrderStream(order).slice(0, -2) as never;
		const decoded = streamToSpotOrderEvent(old);
		assert.equal(decoded.amountBN, null);
		assert.equal(decoded.placedBN, null);
		assert.equal(decoded.placed, order.placed, "the float still carries the value");
	});

	it("and its schema accepts it", () => {
		const old = eventToSpotOrderStream(order).slice(0, -2);
		assert.doesNotThrow(() => spotOrderStreamSchema.parse(old));
	});

	it("the dispatcher decodes the short frame too, rather than dropping it", () => {
		const old = eventToSpotOrderStream(order).slice(0, -2) as never;
		const via = streamToEvent(old) as SpotOrderEvent | null;
		assert.ok(via, "a shorter frame must not decode to null -- that is a silent drop");
		assert.equal(via.orderId, order.orderId);
	});

	it("a NULL exact value round-trips as null, not as the string \"null\"", () => {
		const withNulls = { ...order, amountBN: null, placedBN: null };
		const back = streamToSpotOrderEvent(eventToSpotOrderStream(withNulls));
		assert.equal(back.amountBN, null);
		assert.equal(back.placedBN, null);
	});
});

import {
	eventToSpotAccountActivityStream,
	streamToSpotAccountActivityEvent,
	spotAccountActivityStreamSchema,
	type SpotAccountActivityEvent,
} from "./account/spot";

describe("spotAccountActivity", () => {
	it("round-trips, and the decoded kind is what was encoded", () => {
		const event: SpotAccountActivityEvent = {
			eventId: "spotAccountActivity",
			kind: "bandLiquidityAdded",
			account: "0x1A00000000000000000000000000000000000E01",
			ref: "0x1a00000000000000000000000000000000000f01",
			txHash: "0xabc",
			timestamp: 1_789_700_000,
			updatedAt: 1_789_700_000_123,
		};
		const wire = eventToSpotAccountActivityStream(event);
		const back = streamToSpotAccountActivityEvent(spotAccountActivityStreamSchema.parse(wire));
		assert.deepEqual(back, event);
	});
});

import {
	eventToSpotLaunchStream,
	streamToSpotLaunchEvent,
	spotLaunchStreamSchema,
	type SpotLaunchEvent,
} from "./launches/spot";

describe("spotLaunch", () => {
	const event: SpotLaunchEvent = {
		eventId: "spotLaunch",
		coin: "0x1A00000000000000000000000000000000000C01",
		symbol: "NOVA",
		name: "Nova Point",
		creator: "0x1A00000000000000000000000000000000000E01",
		quote: "0x3600000000000000000000000000000000000000",
		txHash: "0xabc",
		timestamp: 1_789_700_000,
		updatedAt: 1_789_700_000_123,
	};

	it("round-trips every field", () => {
		const wire = eventToSpotLaunchStream(event);
		assert.deepEqual(streamToSpotLaunchEvent(spotLaunchStreamSchema.parse(wire)), event);
	});

	/*
	 * The dispatcher is the half that has gone wrong before: `spotOrderMatched`
	 * went unpublished for months because the broker drops any frame whose
	 * eventId has no encoder, and nothing said so. A frame that survives its own
	 * codec but not `eventToStream` is invisible in exactly that way.
	 */
	it("survives the generic dispatcher in both directions", () => {
		const wire = eventToStream(event);
		assert.deepEqual(streamToEvent(wire as never), event);
	});

	/* Address casing crosses this wire unchanged: the gateway sends checksummed
	   ids and consumers lower-case to compare, so a codec that normalised would
	   make one of those two wrong. */
	it("does not touch address casing", () => {
		const back = streamToSpotLaunchEvent(spotLaunchStreamSchema.parse(eventToSpotLaunchStream(event)));
		assert.equal(back.coin, event.coin);
		assert.equal(back.creator, event.creator);
	});
});
