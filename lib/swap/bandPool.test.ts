import { describe, expect, it } from "vitest";
import { bandSwapIneligibleReason, resolveBandPool, ZERO_ADDRESS } from "./bandPool";

const POOL = "0xFc02B71470aD1D8c43B40C3129CA8A9112035483";

describe("resolveBandPool", () => {
  it("resolves quoteToBase=false when getPool(pay, get) is the real one", () => {
    const r = resolveBandPool(POOL, ZERO_ADDRESS);
    expect(r).toEqual({ pool: POOL, quoteToBase: false });
  });

  it("resolves quoteToBase=true when getPool(get, pay) is the real one", () => {
    const r = resolveBandPool(ZERO_ADDRESS, POOL);
    expect(r).toEqual({ pool: POOL, quoteToBase: true });
  });

  it("is null when neither order has a pool", () => {
    expect(resolveBandPool(ZERO_ADDRESS, ZERO_ADDRESS)).toBeNull();
  });

  it("is null while both reads are still loading (undefined)", () => {
    expect(resolveBandPool(undefined, undefined)).toBeNull();
  });

  it("prefers the pay-is-base answer when (implausibly) both resolve", () => {
    // Cannot happen against a real factory -- a pair lists in one order, once --
    // but the function must still be total rather than throwing on it.
    const other = "0x1111111111111111111111111111111111111111";
    expect(resolveBandPool(POOL, other)).toEqual({ pool: POOL, quoteToBase: false });
  });

  it("is case-insensitive against a lowercased zero address", () => {
    expect(resolveBandPool("0x0000000000000000000000000000000000000000", POOL)).toEqual({
      pool: POOL,
      quoteToBase: true,
    });
  });
});

describe("bandSwapIneligibleReason", () => {
  it("is null — eligible — for a single-hop, no-remainder quote", () => {
    expect(bandSwapIneligibleReason(1, "none")).toBeNull();
  });

  it("names multi-hop as the reason, even with no remainder", () => {
    expect(bandSwapIneligibleReason(2, "none")).toMatch(/more than one market/);
    expect(bandSwapIneligibleReason(3, "none")).toMatch(/more than one market/);
  });

  it("permits a remainder disposition, which is now a SECOND transaction", () => {
    // It used to refuse both, because `BandSwapRouter.swap` has no resting mode
    // and no partial-fill placement — still true. What changed is the shape of
    // the answer: the swap sends only what the quote says fills now, and the
    // leftover goes out as `limitBuy`/`limitSell` or `addLiquiditySingleSided`.
    // Refusing here would block a flow the contracts can actually serve.
    expect(bandSwapIneligibleReason(1, "limit")).toBeNull();
    expect(bandSwapIneligibleReason(1, "lp")).toBeNull();
  });

  it("still refuses multi-hop, whatever the disposition", () => {
    // One band pool cannot serve two markets, and no second transaction fixes
    // that — the route itself is unservable.
    expect(bandSwapIneligibleReason(2, "none")).toMatch(/one market|more than one/);
    expect(bandSwapIneligibleReason(2, "limit")).toMatch(/one market|more than one/);
  });

  it("multi-hop wins when both apply", () => {
    expect(bandSwapIneligibleReason(2, "limit")).toMatch(/more than one market/);
  });
});
