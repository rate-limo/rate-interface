import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { isLadderMarket, ladderSellFloor, quoteLadderBuy } from "./ladderBuy";
import { ladderSteps } from "./devBuy";

const USDC = "0x3600000000000000000000000000000000000000";
const rec = { creator: "0x00000000000000000000000000000000000000c1", quote: USDC, graduated: false };
const usdc = (n: string) => parseUnits(n, 6);
const coins = (n: string) => parseUnits(n, 18);

// The ladder a 1B-supply, $5k -> $25k launch places, every step full.
const fresh = ladderSteps(usdc("5000"), usdc("25000"), coins("1000000000"), 6).map((s) => ({
  price: s.price,
  remaining: s.coins,
}));

describe("isLadderMarket", () => {
  it("is true for a pre-graduation launch coin against its launch quote", () => {
    expect(isLadderMarket(rec, USDC)).toBe(true);
  });
  it("is false once graduated, for another quote, or for a coin the generator didn't launch", () => {
    expect(isLadderMarket({ ...rec, graduated: true }, USDC)).toBe(false);
    expect(isLadderMarket(rec, "0x0000000000000000000000000000000000000abc")).toBe(false);
    expect(isLadderMarket({ ...rec, creator: "0x0000000000000000000000000000000000000000" }, USDC)).toBe(false);
    expect(isLadderMarket(null, USDC)).toBe(false);
  });
});

describe("quoteLadderBuy", () => {
  it("fills within the first step at its price", () => {
    // Step 1: 160M coins at 0.000005 USDC = $800. $100 buys 20M.
    const q = quoteLadderBuy(fresh, usdc("100"), 6, 1);
    expect(q.coinsOut).toBe(coins("20000000"));
    expect(q.quoteUsed).toBe(usdc("100"));
    expect(q.topPrice).toBe(BigInt(500));
    expect(q.limitPrice).toBe(BigInt(505));
  });

  it("walks into the next step once one is exhausted, and the ceiling follows", () => {
    const q = quoteLadderBuy(fresh, usdc("1000"), 6, 0);
    // $800 takes step 1 whole; $200 buys into step 2.
    expect(q.coinsOut > coins("160000000")).toBe(true);
    expect(q.topPrice).toBe(fresh[1]!.price);
    expect(q.limitPrice).toBe(fresh[1]!.price);
  });

  it("spends only what the ladder holds and reports the rest as unspent", () => {
    const q = quoteLadderBuy(fresh, usdc("1000000"), 6, 1);
    expect(q.coinsOut).toBe(coins("800000000"));
    expect(q.quoteUsed < usdc("1000000")).toBe(true);
    expect(q.topPrice).toBe(fresh[4]!.price);
  });

  it("skips sold steps", () => {
    const partly = fresh.map((s, i) => (i < 2 ? { ...s, remaining: BigInt(0) } : s));
    expect(quoteLadderBuy(partly, usdc("10"), 6, 0).topPrice).toBe(fresh[2]!.price);
  });

  it("fills nothing against an empty ladder", () => {
    const q = quoteLadderBuy([], usdc("10"), 6, 1);
    expect(q).toEqual({ coinsOut: BigInt(0), netCoinsOut: BigInt(0), minBaseOut: BigInt(0), quoteUsed: BigInt(0), topPrice: BigInt(0), limitPrice: BigInt(0) });
  });

  it("nets the 1% taker fee and the slippage out of the minimum", () => {
    // $100 at step 1 is 20M coins; 1% fee leaves 19.8M; 1% slippage floors at 19.602M.
    const q = quoteLadderBuy(fresh, usdc("100"), 6, 1, 1_000_000);
    expect(q.netCoinsOut).toBe(coins("19800000"));
    expect(q.minBaseOut).toBe(coins("19602000"));
  });
});

describe("ladderSellFloor", () => {
  it("lowers the last price by the slippage, rounding down, never to zero", () => {
    expect(ladderSellFloor(BigInt(1000), 1)).toBe(BigInt(990));
    expect(ladderSellFloor(BigInt(1), 50)).toBe(BigInt(1));
  });
});
