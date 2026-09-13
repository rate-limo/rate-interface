import { describe, expect, it } from "vitest";
import { remainderSplit } from "./remainder";
import type { SwapQuote, SwapToken } from "./types";

const token = (symbol: string, priceUsd: number) =>
  ({ symbol, address: `0x${symbol}`, decimals: 18, priceUsd, chainId: 5042002 }) as unknown as SwapToken;

const DONUT = token("DONUT", 0.9927);
const USDC = token("USDC", 1);

/** The Arc quote this module was written against, field for field. */
const quote = (over: Partial<SwapQuote> = {}): SwapQuote =>
  ({
    amountIn: 9.05713,
    delivered: 6.508932115,
    route: [DONUT, USDC],
    hops: [],
    placements: [
      { from: DONUT, to: USDC, inAmount: 2.4990120000000005, outAmount: 2.4807654638820007, settlesToTarget: true },
    ],
    ...over,
  }) as unknown as SwapQuote;

describe("remainderSplit", () => {
  it("prices the remainder off the REMAINDER, never off the whole order", () => {
    /*
     * The bug: `delivered / amountIn` is 0.71865 here, because `amountIn`
     * includes the 2.499 that could not fill. Resting a sell at that price is
     * 27.6% below a market trading at 0.9927 — it crosses the book instantly.
     */
    const { restPrice } = remainderSplit(quote());
    expect(restPrice).toBeCloseTo(0.9927, 3);
    expect(restPrice).not.toBeCloseTo(6.508932115 / 9.05713, 3);
  });

  it("splits the order into what fills and what does not", () => {
    const split = remainderSplit(quote());
    expect(split.unfilled).toBeCloseTo(2.499012, 6);
    expect(split.filled).toBeCloseTo(6.558118, 6);
    // The two halves are the whole order — the invariant the fill bar draws.
    expect(split.filled + split.unfilled).toBeCloseTo(9.05713, 6);
  });

  it("reports no remainder when the book took everything", () => {
    const split = remainderSplit(quote({ placements: [] }));
    expect(split.unfilled).toBe(0);
    expect(split.filled).toBe(9.05713);
    expect(split.restPrice).toBe(0);
  });

  it("sums placements across hops rather than reading the first", () => {
    const split = remainderSplit(
      quote({
        placements: [
          { from: DONUT, to: USDC, inAmount: 1, outAmount: 0.5, settlesToTarget: false },
          { from: DONUT, to: USDC, inAmount: 3, outAmount: 1.5, settlesToTarget: true },
        ],
      } as Partial<SwapQuote>),
    );
    expect(split.unfilled).toBe(4);
    expect(split.restsTo).toBe(2);
    expect(split.restPrice).toBe(0.5);
  });

  it("answers zero for a price it cannot know, rather than guessing one", () => {
    // `outAmount` is null-ish when the gateway sent no depositToLP figure. A
    // resting order needs a price; placeRemainder refuses rather than inventing.
    const split = remainderSplit(
      quote({
        placements: [{ from: DONUT, to: USDC, inAmount: 2.5, outAmount: 0, settlesToTarget: true }],
      } as Partial<SwapQuote>),
    );
    expect(split.restPrice).toBe(0);
  });

  it("is empty for no quote at all", () => {
    expect(remainderSplit(null)).toEqual({ unfilled: 0, filled: 0, restsTo: 0, restPrice: 0 });
  });
});
