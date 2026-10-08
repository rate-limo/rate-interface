/**
 * Own-order marks land on the level the SERVER grouped the order into: bids
 * floor to the step, asks ceil — and float division must not knock an on-grid
 * price one level down.
 */
import { describe, expect, it } from "vitest";
import { bucketPrice, ownLevels } from "./ownLevels";
import { levelKey } from "./flash";

const MARKET = { base: "0xBase", quote: "0xQuote" };
const order = (isBid: boolean, price: number, placed: number, extra: Record<string, unknown> = {}) => ({
  isBid,
  price,
  placed,
  assetSymbol: isBid ? "tUSD" : "KPRF",
  base: "0xbase",
  quote: "0xquote",
  ...extra,
});

describe("bucketPrice", () => {
  it("keeps on-grid millionths on their own level, both sides", () => {
    // 0.000005 / 0.000001 is 4.999999999999999 in float64; a bare floor marks 0.000004.
    for (const p of [0.000003, 0.000005, 0.000009]) {
      expect(bucketPrice(p, "0.000001", true)).toBe(p);
      expect(bucketPrice(p, "0.000001", false)).toBe(p);
    }
  });

  it("floors an off-grid bid and ceils an off-grid ask", () => {
    expect(bucketPrice(0.0000055, "0.000001", true)).toBe(0.000005);
    expect(bucketPrice(0.0000055, "0.000001", false)).toBe(0.000006);
  });

  it("follows a coarser step the way the gateway groups", () => {
    expect(bucketPrice(0.000005, "0.00001", true)).toBe(0);
    expect(bucketPrice(0.000005, "0.00001", false)).toBe(0.00001);
    expect(bucketPrice(1999.7, "0.5", true)).toBe(1999.5);
    expect(bucketPrice(1999.7, "0.5", false)).toBe(2000);
  });

  it("refuses a bad step or price", () => {
    expect(bucketPrice(1, "0", true)).toBeNull();
    expect(bucketPrice("x", "0.1", true)).toBeNull();
  });
});

describe("ownLevels", () => {
  it("maps each order to its side's level, keyed like the rows", () => {
    const own = ownLevels(
      [order(true, 0.000003, 200), order(false, 0.000005, 10_000_000), order(false, 0.000009, 15_000_000)],
      "0.000001",
      MARKET,
    );
    expect([...own.bids.keys()]).toEqual([levelKey("0.000003")]);
    expect([...own.asks.keys()].sort()).toEqual([levelKey("0.000005"), levelKey("0.000009")].sort());
    expect(own.bids.get(levelKey("0.000003"))).toEqual({ size: 200, symbol: "tUSD", count: 1 });
    expect(own.asks.get(levelKey(0.000009))?.size).toBe(15_000_000);
    // A bid at 0.000005 does not exist: sides never bleed into each other.
    expect(own.bids.has(levelKey("0.000005"))).toBe(false);
  });

  it("sums two orders on one level", () => {
    const own = ownLevels([order(false, 0.000005, 10), order(false, 0.0000046, 5)], "0.000001", MARKET);
    expect(own.asks.get(levelKey("0.000005"))).toEqual({ size: 15, symbol: "KPRF", count: 2 });
  });

  it("ignores other markets and orders with nothing resting", () => {
    const own = ownLevels(
      [order(true, 0.000003, 200, { base: "0xother" }), order(true, 0.000004, 0)],
      "0.000001",
      MARKET,
    );
    expect(own.bids.size).toBe(0);
    expect(own.asks.size).toBe(0);
  });

  it("marks nothing with no orders", () => {
    expect(ownLevels(undefined, "0.000001", MARKET).bids.size).toBe(0);
    expect(ownLevels([], "0.000001", MARKET).asks.size).toBe(0);
  });
});
