import Decimal from "decimal.js";

export const getOrderbookSteps = (price: number): string[] => {
	// Convert number price to Decimal
	const priceDecimal = new Decimal(price);

	// Convert price to magnitude using Decimal.js
	const magnitude = priceDecimal.abs().log(10).floor();

	// For steps, ensure minimum 6 decimal places
	const startPower = Decimal.max(magnitude.minus(4), new Decimal(-6));

	// Generate 4 steps, each 10x larger than the startPower
	const lowerSteps = Array.from({ length: 4 }, (_, i) => {
		const step = new Decimal(10).pow(startPower.plus(i));
		// Format to ensure decimal string representation with proper precision
		// If step is >= 1, don't show decimal places
		// remove trailing zeros in decimal places
		return step.gte(1)
			? step.toFixed(0)
			: new Intl.NumberFormat("en-US", {
					style: "decimal",
					maximumFractionDigits: 8,
					useGrouping: false,
				}).format(step.toNumber());
	});

	// Generate 4 steps, each 10x larger than the magnitude
	const upperSteps = Array.from({ length: 4 }, (_, i) => {
		const step = new Decimal(10).pow(magnitude.plus(i));
		// If step is >= 1, don't show decimal places
		// remove trailing zeros
		return step.gte(1)
			? step.toFixed(0)
			: new Intl.NumberFormat("en-US", {
					style: "decimal",
					maximumFractionDigits: 8,
					useGrouping: false,
				}).format(step.toNumber());
	});

	// only leave the steps on upperSteps that is 10x of listing price
	const listingPrice = new Decimal(price);
	const filteredUpperSteps = upperSteps.filter((step) => {
		const stepDecimal = new Decimal(step);
		return stepDecimal.lte(listingPrice.mul(10));
	});

	// merge the two arrays
	return [...lowerSteps, ...filteredUpperSteps];
};

export interface Order {
	price: number;
	amount: number; // ask: base amount, bid: quote amount
}

export type GroupedOrder = {
	price: string;
	baseLiquidity: number;
	quoteLiquidity: number;
	percentage: number;
	accumulatedBaseLiquidity: number;
	accumulatedQuoteLiquidity: number;
	accumulatedPercentage: number;
};

export type GroupedDepthResult = {
	side: "bid" | "ask";
	totalBaseLiquidity: number;
	totalQuoteLiquidity: number;
	buckets: GroupedOrder[];
};

export type GroupedOrderbookResult = {
	bids: GroupedDepthResult;
	asks: GroupedDepthResult;
	buyPercent: number;
	sellPercent: number;
	totalLiquidityInQuote: number;
	step: string;
};

/**
 * The price window whose orders land in the same bucket as `price`.
 *
 * Lives here, immediately above `groupOrdersByStep`, because it is the inverse of
 * that function's one-line bucketing rule and the two must never drift:
 *
 *   bid -> floor(price / step) * step, so a bucket at B holds [B, B + step)
 *   ask -> ceil(price / step)  * step, so a bucket at B holds (B - step, B]
 *
 * Note the asymmetry in which end is inclusive. It falls out of floor vs ceil and
 * is easy to get backwards, which is why `orderbook.bucket.test.ts` checks the
 * range against the grouper itself over random books rather than against a
 * hand-written expectation.
 *
 * Why this exists: publishing one price level's liquidity does NOT require reading
 * the whole book. The broker used to select every bid and every ask for the pair
 * and group all of them, across every scale, to read two numbers out of a single
 * bucket — O(book x scales) of decimal.js work per event, to produce O(1) of
 * output, up to twice per matched event. With a range, the query reads only the
 * orders that can affect the bucket being published.
 *
 * The aggregation itself is deliberately NOT reimplemented anywhere: feed the rows
 * in this range to `groupOrdersByStep` and it returns the same bucket it would have
 * returned from the whole book. That matters because the running
 * `.toDecimalPlaces(6)` after every order (below) means a SQL `SUM` would round
 * differently and the delta would disagree with the snapshot.
 */
export function bucketRangeFor(
	price: Decimal.Value,
	step: string,
	side: "bid" | "ask",
): {
	/** The bucket price itself — what `groupOrdersByStep` keys on. */
	bucket: Decimal;
	lo: Decimal;
	hi: Decimal;
	/** Whether an order exactly at `lo` / `hi` belongs to this bucket. */
	loInclusive: boolean;
	hiInclusive: boolean;
} {
	const stepDecimal = new Decimal(step);
	const priceDecimal = new Decimal(price);
	const bucket =
		side === "bid"
			? priceDecimal.dividedBy(stepDecimal).floor().mul(stepDecimal)
			: priceDecimal.dividedBy(stepDecimal).ceil().mul(stepDecimal);

	return side === "bid"
		? {
				bucket,
				lo: bucket,
				hi: bucket.plus(stepDecimal),
				loInclusive: true,
				hiInclusive: false,
			}
		: {
				bucket,
				lo: bucket.minus(stepDecimal),
				hi: bucket,
				loInclusive: false,
				hiInclusive: true,
			};
}

/** Whether an order's price falls inside a range from `bucketRangeFor`. */
export function inBucketRange(
	price: Decimal.Value,
	range: ReturnType<typeof bucketRangeFor>,
): boolean {
	const p = new Decimal(price);
	const lowOk = range.loInclusive ? p.gte(range.lo) : p.gt(range.lo);
	const highOk = range.hiInclusive ? p.lte(range.hi) : p.lt(range.hi);
	return lowOk && highOk;
}

export function groupOrdersByStep(
	orders: Order[],
	step: string,
	side: "bid" | "ask",
	marketPrice?: number | null | undefined,
	depth?: number | null | undefined,
): GroupedDepthResult {
	const stepDecimal = new Decimal(step);
	const bucketsMap = new Map<string, Order[]>();

	let mkpDecimal: Decimal;
	let minPrice: number;
	let maxPrice: number;
	let filteredOrders: Order[] = [];
	if (marketPrice && depth) {
		mkpDecimal = new Decimal(marketPrice);
		minPrice = Math.max(mkpDecimal.minus(stepDecimal.mul(depth)).toNumber(), 0);
		maxPrice = mkpDecimal.plus(stepDecimal.mul(depth)).toNumber();
		// filter orders by price and amount
		filteredOrders = orders.filter((order) => {
			const price = new Decimal(order.price);
			const amount = new Decimal(order.amount);
			return price.gte(minPrice) && price.lte(maxPrice) && amount.gt(0.000001);
		});
	} else {
		filteredOrders = orders;
	}

	for (const order of filteredOrders) {
		const price = new Decimal(order.price);
		const bucket = side === "bid" ? price.dividedBy(stepDecimal).floor().mul(stepDecimal) : price.dividedBy(stepDecimal).ceil().mul(stepDecimal);
		const bucketKey = bucket.toFixed();

		const current = bucketsMap.get(bucketKey) || [];

		current.push(order);
		bucketsMap.set(bucketKey, current);
	}

	const sortedBuckets = Array.from(bucketsMap.entries())
		.map(([priceStr, orders]) => {
			const price = new Decimal(priceStr);
			let baseLiq = new Decimal(0);
			let quoteLiq = new Decimal(0);

			for (const { price, amount } of orders) {
				const s = new Decimal(amount);
				const p = new Decimal(price);
				if (side === "ask") {
					// Ask side: amount = base
					baseLiq = baseLiq.plus(s).toDecimalPlaces(6);
					quoteLiq = quoteLiq.plus(p.mul(s)).toDecimalPlaces(6);
				} else {
					// Bid side: amount = quote
					quoteLiq = quoteLiq.plus(s).toDecimalPlaces(6);
					baseLiq = baseLiq.plus(s.dividedBy(p)).toDecimalPlaces(6);
				}
			}

			return {
				price: price.toFixed(),
				baseLiquidity: baseLiq.toNumber(),
				quoteLiquidity: quoteLiq.toNumber(),
				percentage: 0,
				accumulatedBaseLiquidity: 0,
				accumulatedQuoteLiquidity: 0,
				accumulatedPercentage: 0,
			};
		})
		.sort(
			(a, b) =>
				side === "ask"
					? new Decimal(a.price).cmp(b.price) // low to high
					: new Decimal(b.price).cmp(a.price), // high to low
		);

	const totalBase = sortedBuckets.reduce((sum, b) => sum + b.baseLiquidity, 0);
	const totalQuote = sortedBuckets.reduce(
		(sum, b) => sum + b.quoteLiquidity,
		0,
	);

	let accBase = 0;
	let accQuote = 0;
	let accPercent = 0;

	const enriched = sortedBuckets.map((b) => {
		const percent =
			totalBase === 0
				? 0
				: Number(((b.baseLiquidity / totalBase) * 100).toFixed(4));
		accBase += b.baseLiquidity;
		accQuote += b.quoteLiquidity;
		accPercent += percent;

		return {
			...b,
			percentage: percent,
			accumulatedBaseLiquidity: Number(accBase.toFixed(8)),
			accumulatedQuoteLiquidity: Number(accQuote.toFixed(8)),
			accumulatedPercentage: Number(accPercent.toFixed(4)),
		};
	});

	return {
		side,
		totalBaseLiquidity: Number(totalBase.toFixed(8)),
		totalQuoteLiquidity: Number(totalQuote.toFixed(8)),
		buckets: enriched,
	};
}

export function getGroupedOrderbookWithLiquidityShare(
	bidOrders: Order[],
	askOrders: Order[],
	step: string,
	marketPrice?: number | null | undefined,
	depth?: number | null | undefined,
): GroupedOrderbookResult {
	const bids = groupOrdersByStep(bidOrders, step, "bid", marketPrice, depth);
	const asks = groupOrdersByStep(askOrders, step, "ask", marketPrice, depth);

	const totalLiquidityInQuote =
		bids.totalQuoteLiquidity + asks.totalQuoteLiquidity;

	const sellPercent =
		totalLiquidityInQuote === 0
			? 0
			: Number(
					((asks.totalQuoteLiquidity / totalLiquidityInQuote) * 100).toFixed(2),
				);

	const buyPercent =
		totalLiquidityInQuote === 0
			? 0
			: Number(
					((bids.totalQuoteLiquidity / totalLiquidityInQuote) * 100).toFixed(2),
				);

	return {
		bids,
		asks,
		buyPercent,
		sellPercent,
		totalLiquidityInQuote,
		step,
	};
}
