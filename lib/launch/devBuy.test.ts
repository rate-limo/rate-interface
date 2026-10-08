import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import {
  checkDevBuy,
  clearsListingFloor,
  devBuyCapRaw,
  devBuyCoinsRaw,
  listingPriceRaw,
  devBuyView,
  ladderMarketCaps,
  ladderSteps,
  maxDevBuyQuoteRaw,
} from "./devBuy";

const usdc = (n: string) => parseUnits(n, 6);
const coins = (n: string) => parseUnits(n, 18);

describe("launch price and dev buy, mirrored from AssetLaunchLib", () => {
  it("prices 1B coins at a $5,000 start to 500 on the 1e8 grid (the contract test's number)", () => {
    expect(listingPriceRaw(usdc("5000"), coins("1000000000"), 6)).toBe(BigInt(500));
  });

  it("$5 buys 0.1% of a 1B supply at that price", () => {
    const price = listingPriceRaw(usdc("5000"), coins("1000000000"), 6);
    expect(devBuyCoinsRaw(usdc("5"), price, 6)).toBe(coins("1000000"));
  });

  it("the max quote fills the 10% cap without crossing it", () => {
    const supply = coins("1000000000");
    const price = listingPriceRaw(usdc("5000"), supply, 6);
    const max = maxDevBuyQuoteRaw(supply, price, 6);
    expect(max).toBe(usdc("500"));
    expect(devBuyCoinsRaw(max, price, 6) <= devBuyCapRaw(supply)).toBe(true);
    expect(devBuyCoinsRaw(max + BigInt(1), price, 6) > devBuyCapRaw(supply)).toBe(true);
  });

  it("an 18-decimal quote uses the same grid", () => {
    const supply = coins("1000000000");
    const price = listingPriceRaw(coins("5000"), supply, 18);
    expect(price).toBe(BigInt(500));
    expect(devBuyCoinsRaw(coins("5"), price, 18)).toBe(coins("1000000"));
  });

  it("refuses in the contract's order: price, minimum, cap", () => {
    const base = { marketCap: usdc("5000"), minDevBuy: usdc("5"), quoteDecimals: 6 };
    // 1T coins at $5,000 is 0.5 on the grid: below MIN_LISTING_PRICE.
    expect(checkDevBuy({ ...base, supply: coins("1000000000000"), quoteIn: usdc("5") })).toMatchObject({
      ok: false,
      reason: "priceTooLow",
    });
    expect(checkDevBuy({ ...base, supply: coins("1000000000"), quoteIn: usdc("4.99") })).toMatchObject({
      ok: false,
      reason: "belowMinimum",
    });
    expect(checkDevBuy({ ...base, supply: coins("1000000000"), quoteIn: usdc("500.01") })).toMatchObject({
      ok: false,
      reason: "aboveCap",
    });
    expect(checkDevBuy({ ...base, supply: coins("1000000000"), quoteIn: usdc("50") })).toEqual({
      ok: true,
      coins: coins("10000000"),
      shareBps: 100,
    });
  });
});

describe("devBuyView", () => {
  const usdcOption = { decimals: 6, startingMarketCap: usdc("5000"), minDevBuy: usdc("5"), graduationMarketCap: usdc("25000") };
  it("reads the form's text the way the transaction will", () => {
    const v = devBuyView(usdcOption, "1,000,000,000", "50");
    expect(v.price).toBeCloseTo(0.000005, 12);
    expect(v.min).toBe(5);
    expect(v.max).toBe(500);
    expect(v.coins).toBe(10_000_000);
    expect(v.sharePct).toBe(1);
    expect(v.check.ok).toBe(true);
  });
  it("treats an unparseable amount as zero, which is below the minimum", () => {
    expect(devBuyView(usdcOption, "1,000,000,000", "abc").check).toMatchObject({ ok: false, reason: "belowMinimum" });
  });
});

describe("the sell ladder, mirrored from AssetLaunchLib.ladderPrices / _placeLadder", () => {
  it("runs geometrically from the start cap to the graduation cap", () => {
    const caps = ladderMarketCaps(usdc("5000"), usdc("25000"));
    expect(caps[0]).toBe(usdc("5000"));
    expect(caps[4]).toBe(usdc("25000"));
    // mid = floor(sqrt(5000 * 25000)) in raw units
    expect(caps[2]).toBe(BigInt(11180339887));
    for (let i = 1; i < 5; i++) expect(caps[i]! > caps[i - 1]!).toBe(true);
  });

  it("places 80% of supply, 16% a step, the last taking the remainder", () => {
    const supply = coins("1000000000");
    const steps = ladderSteps(usdc("5000"), usdc("25000"), supply, 6);
    expect(steps.map((s) => s.coins)).toEqual(Array(5).fill(coins("160000000")));
    expect(steps[0]!.price).toBe(BigInt(500));
    expect(steps[4]!.price).toBe(BigInt(2500));
  });

  it("the view reports each step as a share of supply", () => {
    const v = devBuyView(
      { decimals: 6, startingMarketCap: usdc("5000"), minDevBuy: usdc("5"), graduationMarketCap: usdc("25000") },
      "1,000,000,000",
      "5",
    );
    expect(v.ladder.map((s) => s.supplyPct)).toEqual([16, 16, 16, 16, 16]);
    expect(v.ladder[4]!.marketCap).toBe(25000);
  });
});

describe("clearsListingFloor — fixed 1B /create launches", () => {
  it("accepts USDC at a $5k start (price 500 units)", () => {
    expect(clearsListingFloor({ decimals: 6, startingMarketCap: BigInt(5_000e6) })).toBe(true);
  });

  it("accepts the floor: 1,000 quote tokens prices 1B coins at 100 units (price rounds UP, as the contract does)", () => {
    expect(clearsListingFloor({ decimals: 18, startingMarketCap: BigInt(1_000) * BigInt(10) ** BigInt(18) })).toBe(true);
    // 999 tokens is 99.9 units, which the ceiling lifts to 100 — still allowed.
    expect(clearsListingFloor({ decimals: 18, startingMarketCap: BigInt(999) * BigInt(10) ** BigInt(18) })).toBe(true);
    expect(clearsListingFloor({ decimals: 18, startingMarketCap: BigInt(990) * BigInt(10) ** BigInt(18) })).toBe(false);
  });

  it("refuses an ETH-like quote at ≈$5k (1.85 ETH): the price rounds under the floor", () => {
    expect(clearsListingFloor({ decimals: 18, startingMarketCap: BigInt(185) * BigInt(10) ** BigInt(16) })).toBe(false);
  });

  it("refuses a zero start", () => {
    expect(clearsListingFloor({ decimals: 6, startingMarketCap: BigInt(0) })).toBe(false);
  });
});
