import { describe, expect, it } from "vitest";
import { qualifies, selectThesisCandidates, THESIS_DISPLAY_MIN_USD } from "./candidates";

const TOKEN = "0xAbC0000000000000000000000000000000dEf1";

describe("selectThesisCandidates", () => {
  it("keeps a single-fill trade in the requested token", () => {
    const rows = [
      {
        base: { id: TOKEN },
        pair: "0xpair1",
        tradeId: "5",
        valueUSD: 1500,
        price: 1.2,
        timestamp: 100,
        baseSymbol: "NOVA",
        quoteSymbol: "USDC",
        isBid: true,
        fills: 1,
        txHash: "0xhash1",
      },
    ];

    const result = selectThesisCandidates(rows, TOKEN);
    expect(result).toEqual([
      {
        pair: "0xpair1",
        tradeId: "5",
        valueUsd: 1500,
        price: 1.2,
        timestamp: 100,
        baseSymbol: "NOVA",
        quoteSymbol: "USDC",
        isBid: true,
        txHash: "0xhash1",
      },
    ]);
  });

  it("matches the token case-insensitively and accepts a bare address string for base", () => {
    const rows = [
      {
        base: TOKEN.toLowerCase(),
        pair: "0xpair1",
        tradeId: "5",
        valueUSD: 2000,
        fills: 1,
      },
    ];
    expect(selectThesisCandidates(rows, TOKEN)).toHaveLength(1);
  });

  it("drops trades in a different token", () => {
    const rows = [{ base: { id: "0xsomeOtherToken" }, pair: "0xpair1", tradeId: "5", fills: 1 }];
    expect(selectThesisCandidates(rows, TOKEN)).toEqual([]);
  });

  it("drops a grouped row spanning more than one fill — its tradeId is only a representative pick", () => {
    const rows = [
      {
        base: { id: TOKEN },
        pair: "0xpair1",
        tradeId: "5",
        valueUSD: 5000,
        fills: 3,
      },
    ];
    expect(selectThesisCandidates(rows, TOKEN)).toEqual([]);
  });

  it("keeps a row with no fills count — an ungrouped source that predates the field", () => {
    const rows = [{ base: { id: TOKEN }, pair: "0xpair1", tradeId: "5", valueUSD: 1200 }];
    expect(selectThesisCandidates(rows, TOKEN)).toHaveLength(1);
  });

  it("drops a row missing pair or tradeId", () => {
    const rows = [
      { base: { id: TOKEN }, pair: null, tradeId: "5", fills: 1 },
      { base: { id: TOKEN }, pair: "0xpair1", tradeId: null, fills: 1 },
    ];
    expect(selectThesisCandidates(rows, TOKEN)).toEqual([]);
  });
});

describe("qualifies", () => {
  it("clears at the display threshold", () => {
    expect(
      qualifies({
        pair: "p",
        tradeId: "1",
        valueUsd: THESIS_DISPLAY_MIN_USD,
        price: 1,
        timestamp: 1,
        baseSymbol: "A",
        quoteSymbol: "B",
        isBid: true,
        txHash: "h",
      }),
    ).toBe(true);
  });

  it("fails just below the display threshold", () => {
    expect(
      qualifies({
        pair: "p",
        tradeId: "1",
        valueUsd: THESIS_DISPLAY_MIN_USD - 0.01,
        price: 1,
        timestamp: 1,
        baseSymbol: "A",
        quoteSymbol: "B",
        isBid: true,
        txHash: "h",
      }),
    ).toBe(false);
  });
});
