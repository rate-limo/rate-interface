import { describe, expect, it } from "vitest";
import { fillSummary } from "./fills";

describe("fillSummary", () => {
  it("says when the POOL filled the order, which nothing used to show", () => {
    // The venue's liquidity is mostly band pools now; an order filled entirely
    // against one read exactly like a trade against another wallet.
    expect(fillSummary(3, { pool: 3, maker: 0 })).toBe("3 fills · all from the pool");
    expect(fillSummary(1, { pool: 1, maker: 0 })).toBe("all from the pool");
  });

  it("gives the split when an order took both", () => {
    // One order routinely takes both kinds, so a single badge would have to lie
    // about one of them.
    expect(fillSummary(3, { pool: 2, maker: 1 })).toBe("3 fills · 2 from the pool");
  });

  it("says nothing about an ordinary single fill against another trader", () => {
    expect(fillSummary(1, { pool: 0, maker: 1 })).toBeNull();
  });

  it("still reports a sweep that took no pool liquidity", () => {
    expect(fillSummary(4, { pool: 0, maker: 4 })).toBe("4 fills");
  });

  it("is null when nothing was measured, rather than claiming zero pool", () => {
    // A row from before the gateway carried origins knows nothing about its
    // counterparty — which is not the same as knowing it was not the pool.
    expect(fillSummary(undefined, undefined)).toBeNull();
    expect(fillSummary(0, undefined)).toBeNull();
  });

  it("survives counts that do not add up rather than doing arithmetic on them", () => {
    // `fills` and the origins are separate aggregates from the same query; a
    // disagreement is a bug upstream, not something to paper over here.
    expect(fillSummary(9, { pool: 1, maker: 1 })).toBe("9 fills · 1 from the pool");
  });
});
