/** Differential test: the narrow read must agree with the whole-book grouping.
 *
 * The broker publishes one price level's liquidity. It used to compute that by
 * reading every order in the book and grouping all of them; it now reads only the
 * orders `bucketRangeFor` selects. Those two must produce identical numbers, or a
 * live delta and a REST snapshot disagree about the same level — the exact drift
 * class this repo has been bitten by before (the stream tuples, `sparkline7D`,
 * why `marketCap` became a generated column).
 *
 * The aggregation is not reimplemented: both sides call `groupOrdersByStep`. What
 * is being checked here is the RANGE — whether the rows fed to it are exactly the
 * rows the whole-book grouper would have put in that bucket. Random books rather
 * than hand-written cases, because the inclusive/exclusive ends differ per side
 * and a fixed example proves nothing about the boundary.
 *
 * Run: pnpm --filter @iter/types exec tsx --test src/orderbook.bucket.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Decimal } from "decimal.js";
import {
	bucketRangeFor,
	inBucketRange,
	groupOrdersByStep,
	type Order,
} from "./orderbook";

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

function randomBook(next: () => number, count: number, step: string): Order[] {
	const stepNum = Number(step);
	const orders: Order[] = [];
	for (let i = 0; i < count; i++) {
		// Prices deliberately land ON bucket edges some of the time -- that is where
		// floor-vs-ceil actually differs, and where an off-by-one hides.
		const onEdge = next() < 0.3;
		const raw = next() * 100;
		const price = onEdge ? Math.round(raw / stepNum) * stepNum : raw;
		orders.push({
			price: Number(price.toFixed(8)),
			amount: Number((next() * 50 + 0.000001).toFixed(8)),
		});
	}
	return orders.filter((o) => o.price > 0);
}

const STEPS = ["0.01", "0.1", "0.25", "1", "2.5", "10"];
const SIDES: Array<"bid" | "ask"> = ["bid", "ask"];

describe("bucketRangeFor selects exactly the orders the grouper buckets together", () => {
	it("matches the whole-book grouping over random books, both sides, many steps", () => {
		const next = rng(20260805);
		let compared = 0;

		for (let round = 0; round < 40; round++) {
			for (const step of STEPS) {
				for (const side of SIDES) {
					const book = randomBook(next, 60, step);
					if (book.length === 0) continue;

					const whole = groupOrdersByStep(book, step, side);

					// Every bucket the grouper produced must be reproducible from a
					// narrow read around any price inside it.
					for (const bucket of whole.buckets) {
						const range = bucketRangeFor(bucket.price, step, side);
						assert.equal(
							range.bucket.toFixed(),
							new Decimal(bucket.price).toFixed(),
							`bucket price round-trip failed for step ${step} ${side}`,
						);

						const narrow = book.filter((o) => inBucketRange(o.price, range));
						const regrouped = groupOrdersByStep(narrow, step, side);

						assert.equal(
							regrouped.buckets.length,
							1,
							`a narrow read should yield exactly one bucket (step ${step}, ${side}, price ${bucket.price})`,
						);
						const only = regrouped.buckets[0]!;
						assert.equal(only.price, bucket.price);
						assert.equal(
							only.baseLiquidity,
							bucket.baseLiquidity,
							`baseLiquidity drift at ${bucket.price} (step ${step}, ${side})`,
						);
						assert.equal(
							only.quoteLiquidity,
							bucket.quoteLiquidity,
							`quoteLiquidity drift at ${bucket.price} (step ${step}, ${side})`,
						);
						compared++;
					}
				}
			}
		}

		assert.ok(compared > 500, `expected a broad comparison, only made ${compared}`);
	});

	it("puts an order exactly on a bucket edge on the same side as the grouper does", () => {
		// bid floors, so 10.00 at step 1 belongs to bucket 10 -> [10, 11).
		const bidRange = bucketRangeFor("10", "1", "bid");
		assert.equal(bidRange.bucket.toFixed(), "10");
		assert.equal(inBucketRange("10", bidRange), true);
		assert.equal(inBucketRange("10.999999", bidRange), true);
		assert.equal(inBucketRange("11", bidRange), false);
		assert.equal(inBucketRange("9.999999", bidRange), false);

		// ask ceils, so 10.00 at step 1 belongs to bucket 10 -> (9, 10].
		const askRange = bucketRangeFor("10", "1", "ask");
		assert.equal(askRange.bucket.toFixed(), "10");
		assert.equal(inBucketRange("10", askRange), true);
		assert.equal(inBucketRange("9.000001", askRange), true);
		assert.equal(inBucketRange("9", askRange), false);
		assert.equal(inBucketRange("10.000001", askRange), false);
	});

	it("agrees with the grouper on which bucket an arbitrary price lands in", () => {
		const next = rng(7);
		for (let i = 0; i < 400; i++) {
			for (const step of STEPS) {
				for (const side of SIDES) {
					const price = Number((next() * 100 + 0.0001).toFixed(8));
					const range = bucketRangeFor(price, step, side);
					// The grouper's own answer for a book of exactly this one order.
					const grouped = groupOrdersByStep([{ price, amount: 1 }], step, side);
					assert.equal(
						grouped.buckets[0]!.price,
						range.bucket.toFixed(),
						`bucket disagreement for ${price} step ${step} ${side}`,
					);
					assert.equal(inBucketRange(price, range), true);
				}
			}
		}
	});
});
