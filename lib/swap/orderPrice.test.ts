import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { ORDER_PRICE_DECIMALS, encodeOrderPrice, engineRate } from "./orderPrice";

describe("encodeOrderPrice", () => {
  it("encodes at 1e8 regardless of either token's decimals", () => {
    expect(encodeOrderPrice(1.5)).toBe(parseUnits("1.5", 8));
    expect(ORDER_PRICE_DECIMALS).toBe(8);
  });

  it("agrees with the two call sites that were already right", () => {
    // `TradePageProvider` uses parseUnits(price, 8); the swap card's limit form
    // uses parseUnits(v.toFixed(8), 8). A third encoding is how one of them
    // quietly stops matching the engine.
    expect(encodeOrderPrice(1.0210236)).toBe(parseUnits("1.02102360", 8));
  });

  it("does NOT scale by the get token's decimals, which was the bug", () => {
    // 6-decimal quote: the old encoding was 100x too small.
    expect(encodeOrderPrice(1.5)).not.toBe(parseUnits("1.5", 6));
    // 18-decimal quote: 1e10x too large.
    expect(encodeOrderPrice(1.5)).not.toBe(parseUnits("1.5", 18));
  });

  it("truncates beyond 1e8 rather than throwing on a long rate", () => {
    // `restPrice` is a division and routinely carries more digits than the
    // engine can hold.
    expect(encodeOrderPrice(1 / 3)).toBe(parseUnits("0.33333333", 8));
  });
});

describe("engineRate", () => {
  it("leaves a SELL alone: base is what is paid, so get-per-pay is quote-per-base", () => {
    expect(engineRate(1.5, false)).toBe(1.5);
  });

  it("inverts a BUY: base is what is RECEIVED, so the engine wants pay-per-get", () => {
    // Every resting buy from the remainder path was priced at the reciprocal of
    // the number the user agreed to.
    expect(engineRate(2, true)).toBe(0.5);
  });

  it("round-trips, so the two sides cannot drift apart", () => {
    expect(engineRate(engineRate(1.25, true), true)).toBeCloseTo(1.25, 12);
  });

  it("refuses a nonsense rate rather than dividing by it", () => {
    expect(engineRate(0, true)).toBe(0);
    expect(engineRate(Number.NaN, false)).toBe(0);
    expect(engineRate(-1, true)).toBe(0);
  });
});
