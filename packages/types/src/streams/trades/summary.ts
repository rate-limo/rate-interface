import { z } from "zod";
import type { SpotTradeEvent } from "./spot";

/**
 * One transaction's fills for one account, as a single frame.
 *
 * `MatchingLib.matchAt` emits one `OrderMatched` per resting order consumed, so a
 * taker sweeping the book produced up to `maxMatches` separate `spotTrade` frames
 * on `spotAccount:{sender}` — each one a full 26-field tuple repeating the same
 * addresses, symbols, logos, pair and txHash. Twenty of them is ~10.8 KB on the
 * wire and, on the client, twenty decodes and twenty `setQueryData` rebuilds of a
 * whole page of rows.
 *
 * This frame replaces them on the ACCOUNT topic only. It is an envelope, not a
 * digest: every fill is still here, in `fills`. What is removed is the repetition
 * — the fields identical across the transaction are hoisted into the header and
 * each fill carries only what actually varies. Measured on a 20-fill sweep:
 * 10,831 → 2,220 bytes, gateway 14.7 → 7.0 µs, browser parse 13.1 → 5.3 µs.
 *
 * Applies to the account topics AND the public feeds (`spotTrade:{pair}`,
 * `spotTrade:allPairs`). The public ones were excluded at first, on the grounds
 * that recent-trades renders each fill from a store outside React — but that is
 * a claim about what the consumer does with the fills, and expanding the
 * envelope hands it the identical list. Those feeds are the widest fanouts on
 * the gateway, so the same sweep was being paid for once per subscriber.
 *
 * Grouping stays `(txHash, pair, isBid, account)` rather than txHash alone, and
 * on `allPairs` that is load-bearing: a routed multi-hop swap settles across
 * several markets in ONE transaction, so a hash-keyed envelope would sum base
 * sizes in different tokens and average a price across unrelated books.
 *
 * `expandFillSummary` reconstructs the exact `SpotTradeEvent[]` those frames would
 * have carried, so a consumer that wants rows is not made to think about envelopes.
 */

/** [orderId, price, amount, valueUSD, baseAmount, quoteAmount, baseFee, quoteFee, maker] */
export const spotFillRowSchema = z.tuple([
	z.number(), // orderId
	z.number(), // price
	z.number(), // amount
	z.number(), // valueUSD
	z.number(), // baseAmount
	z.number(), // quoteAmount
	z.number(), // baseFee
	z.number(), // quoteFee
	z.string(), // maker
]);

export type SpotFillRow = z.infer<typeof spotFillRowSchema>;

export const spotFillSummaryStreamSchema = z.tuple([
	z.string(), // eventId
	z.string(), // txHash
	z.string(), // pair
	z.string(), // pairSymbol
	z.string(), // base
	z.string(), // quote
	z.string(), // baseSymbol
	z.string(), // quoteSymbol
	z.string(), // baseLogoURI
	z.string(), // quoteLogoURI
	z.string(), // account
	z.string(), // asset
	z.string(), // assetSymbol
	z.boolean(), // isBid
	z.string(), // taker
	z.number(), // matched -- summed `amount` across the fills
	z.number(), // avgPrice -- size-weighted
	z.number(), // valueUSD -- summed
	z.number(), // timestamp -- block timestamp, shared by every fill in the tx
	z.number(), // updatedAt
	z.array(spotFillRowSchema), // fills
]);

export type SpotFillSummaryStream = z.infer<typeof spotFillSummaryStreamSchema>;

export type SpotFillSummaryEvent = {
	eventId: "spotFillSummary";
	txHash: string;
	pair: string;
	pairSymbol: string;
	base: string;
	quote: string;
	baseSymbol: string;
	quoteSymbol: string;
	baseLogoURI: string;
	quoteLogoURI: string;
	account: string;
	asset: string;
	assetSymbol: string;
	isBid: boolean;
	taker: string;
	/** Summed `amount` across `fills`. */
	matched: number;
	/** Size-weighted mean. Falls back to the last fill's price when `matched` is 0,
	 * because dust fills can round to nothing and a reported 0 reads as a real
	 * (catastrophic) execution rather than as "no size". */
	avgPrice: number;
	valueUSD: number;
	timestamp: number;
	updatedAt: number;
	fills: SpotFillRow[];
};

export function eventToSpotFillSummaryStream(
	obj: SpotFillSummaryEvent,
): SpotFillSummaryStream {
	return [
		obj.eventId,
		obj.txHash,
		obj.pair,
		obj.pairSymbol,
		obj.base,
		obj.quote,
		obj.baseSymbol,
		obj.quoteSymbol,
		obj.baseLogoURI,
		obj.quoteLogoURI,
		obj.account,
		obj.asset,
		obj.assetSymbol,
		obj.isBid,
		obj.taker,
		obj.matched,
		obj.avgPrice,
		obj.valueUSD,
		obj.timestamp,
		obj.updatedAt,
		obj.fills,
	];
}

export function streamToSpotFillSummaryEvent(
	data: SpotFillSummaryStream,
): SpotFillSummaryEvent {
	return {
		eventId: data[0] as "spotFillSummary",
		txHash: data[1],
		pair: data[2],
		pairSymbol: data[3],
		base: data[4],
		quote: data[5],
		baseSymbol: data[6],
		quoteSymbol: data[7],
		baseLogoURI: data[8],
		quoteLogoURI: data[9],
		account: data[10],
		asset: data[11],
		assetSymbol: data[12],
		isBid: data[13],
		taker: data[14],
		matched: data[15],
		avgPrice: data[16],
		valueUSD: data[17],
		timestamp: data[18],
		updatedAt: data[19],
		fills: data[20],
	};
}

/**
 * Rebuilds the per-fill events the envelope stands in for.
 *
 * Lossless by construction: every field is either hoisted in the header or present
 * on the row. This is what lets the trade-history table keep applying rows
 * incrementally — replacing the frames on the wire does not mean losing them.
 */
export function expandFillSummary(
	summary: SpotFillSummaryEvent,
): SpotTradeEvent[] {
	return summary.fills.map((row) => ({
		eventId: "spotTrade" as const,
		orderId: row[0],
		base: summary.base,
		quote: summary.quote,
		baseSymbol: summary.baseSymbol,
		quoteSymbol: summary.quoteSymbol,
		baseLogoURI: summary.baseLogoURI,
		quoteLogoURI: summary.quoteLogoURI,
		pair: summary.pair,
		pairSymbol: summary.pairSymbol,
		isBid: summary.isBid,
		price: row[1],
		account: summary.account,
		asset: summary.asset,
		assetSymbol: summary.assetSymbol,
		amount: row[2],
		valueUSD: row[3],
		baseAmount: row[4],
		quoteAmount: row[5],
		baseFee: row[6],
		quoteFee: row[7],
		timestamp: summary.timestamp,
		taker: summary.taker,
		maker: row[8],
		txHash: summary.txHash,
		updatedAt: summary.updatedAt,
	}));
}

/**
 * The envelope as ONE trade — a transaction's fills folded into the single row a
 * taker actually placed.
 *
 * The counterpart to `expandFillSummary`, and the one to use on any surface whose
 * REST equivalent is grouped. `/api/trades/*` and `/api/tradehistory` return
 * grouped rows (gateway api/tradeGrouping.ts), so a client that expands the live
 * envelope into N rows renders the same transaction two different ways depending
 * on how it arrived: one row on page load, twenty appended on the next sweep.
 *
 * Every aggregate mirrors `groupedTradeSelection` deliberately, field for field,
 * because the two describe the same transaction and must agree:
 *
 *   price      size-weighted mean (`avgPrice`), not the last fill's
 *   amount     summed (`matched`)
 *   fees, USD  summed
 *   timestamp  the last fill's, i.e. when the sweep completed
 *   orderId    MIN, matching the SQL's `min(orderId)` — arrival order over the
 *   maker      MIN, likewise    socket is not the table's order, so "first seen"
 *                               would disagree with the fetched row
 *
 * `fills` is the honest replacement for what the fold gives up: the per-match
 * counterparties and prices. `expandFillSummary` stays for callers that want them.
 *
 * ## TAKER PERSPECTIVE ONLY — do not use this for a maker's own fills
 *
 * The envelope is keyed on `(txHash, pair, isBid, account)`, and `account` is the
 * TAKER. That is right for every topic it reaches today: `Trade.ts` publishes to
 * `spotAccount:{sender}` and the two public feeds, so a maker never receives one.
 *
 * If a trade frame is ever published to `spotAccount:{maker}` — the obvious fix
 * for maker rows not arriving live, now that `/api/tradehistory` matches on
 * `maker` too — this function must NOT be pointed at it unchanged. A taker
 * sweeping five of one maker's resting orders produces five frames sharing that
 * taker, so folding them would report the maker's five separate orders, placed at
 * five different prices on purpose, as one line averaging a price they never
 * quoted. The server already refuses that: `makerOrderKey` in the gateway's
 * api/tradeGrouping.ts appends the viewer's own order id when the viewer is the
 * maker. The wire would need the same split before this could be used there.
 */
export function collapseFillSummary(
	summary: SpotFillSummaryEvent,
): SpotTradeEvent & { fills: number } {
	const rows = summary.fills;
	const sum = (pick: (r: SpotFillRow) => number) =>
		rows.reduce((total, r) => total + pick(r), 0);

	return {
		eventId: "spotTrade" as const,
		orderId: rows.reduce((m, r) => (r[0] < m ? r[0] : m), rows[0]?.[0] ?? 0),
		base: summary.base,
		quote: summary.quote,
		baseSymbol: summary.baseSymbol,
		quoteSymbol: summary.quoteSymbol,
		baseLogoURI: summary.baseLogoURI,
		quoteLogoURI: summary.quoteLogoURI,
		pair: summary.pair,
		pairSymbol: summary.pairSymbol,
		isBid: summary.isBid,
		price: summary.avgPrice,
		account: summary.account,
		asset: summary.asset,
		assetSymbol: summary.assetSymbol,
		amount: summary.matched,
		valueUSD: summary.valueUSD,
		baseAmount: sum((r) => r[4]),
		quoteAmount: sum((r) => r[5]),
		baseFee: sum((r) => r[6]),
		quoteFee: sum((r) => r[7]),
		timestamp: summary.timestamp,
		taker: summary.taker,
		maker: rows.reduce((m, r) => (r[8] < m ? r[8] : m), rows[0]?.[8] ?? ""),
		txHash: summary.txHash,
		updatedAt: summary.updatedAt,
		fills: rows.length,
	};
}

/**
 * Folds per-fill events into one envelope. Shared so the gateway reducer and any
 * test build the same shape, and so the weighting rule lives in one place.
 *
 * Every input must belong to the same (txHash, pair, isBid, account) — grouping is
 * the caller's job, because that key is also the topic-level identity the gateway
 * buckets on.
 */
export function summarizeFills(
	trades: SpotTradeEvent[],
): SpotFillSummaryEvent | null {
	if (trades.length === 0) return null;
	const head = trades[0] as SpotTradeEvent;

	let matched = 0;
	let notional = 0;
	let valueUSD = 0;
	let updatedAt = 0;
	const fills: SpotFillRow[] = [];

	for (const t of trades) {
		matched += t.amount;
		notional += t.amount * t.price;
		valueUSD += t.valueUSD;
		if (t.updatedAt > updatedAt) updatedAt = t.updatedAt;
		fills.push([
			t.orderId,
			t.price,
			t.amount,
			t.valueUSD,
			t.baseAmount,
			t.quoteAmount,
			t.baseFee,
			t.quoteFee,
			t.maker,
		]);
	}

	return {
		eventId: "spotFillSummary",
		txHash: head.txHash,
		pair: head.pair,
		pairSymbol: head.pairSymbol,
		base: head.base,
		quote: head.quote,
		baseSymbol: head.baseSymbol,
		quoteSymbol: head.quoteSymbol,
		baseLogoURI: head.baseLogoURI,
		quoteLogoURI: head.quoteLogoURI,
		account: head.account,
		asset: head.asset,
		assetSymbol: head.assetSymbol,
		isBid: head.isBid,
		taker: head.taker,
		matched,
		avgPrice:
			matched > 0
				? notional / matched
				: (trades[trades.length - 1] as SpotTradeEvent).price,
		valueUSD,
		timestamp: head.timestamp,
		updatedAt,
		fills,
	};
}

/** The grouping key an envelope covers. Pair and side are in it for the same
 * reason they are in the client aggregators: one transaction can settle across
 * markets, and summing sizes across them adds quantities in different tokens. */
export function fillSummaryKey(
	t: Pick<SpotTradeEvent, "txHash" | "pair" | "isBid" | "account">,
): string {
	return `${t.txHash}:${t.pair}:${t.isBid}:${t.account}`;
}
