import { describe, expect, it } from "vitest";
import { accountFeeToken, chargedFeeToken, feeTokenOptions, feeUnits, gasSymbol, tip20GasToken } from "./gasToken";

describe("tip20GasToken", () => {
  it("is PathUSD on Tempo, with fees on the 1e18 scale", () => {
    expect(tip20GasToken(42431)).toEqual({
      address: "0x20c0000000000000000000000000000000000000",
      symbol: "PathUSD",
      decimals: 6,
      feeDecimals: 18,
    });
  });

  it("is null for chains with a native gas coin, and for no chain", () => {
    for (const id of [5042002, 11155931, 10143, 46630]) expect(tip20GasToken(id)).toBeNull();
    expect(tip20GasToken(undefined)).toBeNull();
  });
});

describe("accountFeeToken", () => {
  const PATH_USD = "0x20c0000000000000000000000000000000000000";
  const ALPHA = "0x20C0000000000000000000000000000000000001";

  it("is null on a chain with a native gas coin", () => {
    expect(accountFeeToken(11155931, ALPHA)).toBeNull();
  });

  it("falls back to PathUSD when the account never chose (FeeManager answers zero)", () => {
    expect(accountFeeToken(42431, "0x0000000000000000000000000000000000000000")).toEqual(tip20GasToken(42431));
    expect(accountFeeToken(42431, undefined)).toEqual(tip20GasToken(42431));
    expect(accountFeeToken(42431, PATH_USD.toUpperCase().replace("0X", "0x"))).toEqual(tip20GasToken(42431));
  });

  it("uses the account's chosen token, never labelling it PathUSD", () => {
    const chosen = accountFeeToken(42431, ALPHA);
    expect(chosen?.address).toBe(ALPHA);
    expect(chosen?.symbol).not.toBe("PathUSD");
    expect(accountFeeToken(42431, ALPHA, { symbol: "AlphaUSD" })?.symbol).toBe("AlphaUSD");
    expect(chosen?.feeDecimals).toBe(18);
  });
});

describe("chargedFeeToken (Tempo's order: account choice, then the transferred stablecoin, then PathUSD)", () => {
  const ALPHA = "0x20C0000000000000000000000000000000000001";
  const BETA = "0x20C0000000000000000000000000000000000002";
  it("uses the account's choice over everything", () => {
    expect(chargedFeeToken(42431, ALPHA, BETA)?.symbol).toBe("AlphaUSD");
  });
  it("with no choice, a stablecoin transfer pays in that stablecoin", () => {
    expect(chargedFeeToken(42431, "0x0000000000000000000000000000000000000000", BETA)?.symbol).toBe("BetaUSD");
  });
  it("with no choice and no stablecoin transfer, PathUSD", () => {
    expect(chargedFeeToken(42431, undefined)?.symbol).toBe("PathUSD");
    expect(chargedFeeToken(42431, undefined, "0x1111111111111111111111111111111111111111")?.symbol).toBe("PathUSD");
  });
  it("is null where gas is a native coin", () => {
    expect(chargedFeeToken(11155931, ALPHA)).toBeNull();
  });
  it("lists the four Tempo stablecoins, PathUSD first", () => {
    expect(feeTokenOptions(42431).map((t) => t.symbol)).toEqual(["PathUSD", "AlphaUSD", "BetaUSD", "ThetaUSD"]);
    expect(feeTokenOptions(11155931)).toEqual([]);
  });
});

describe("gasSymbol / feeUnits (labels and paid-fee scale)", () => {
  it("names the TIP-20 on Tempo, never the registry's placeholder", () => {
    expect(gasSymbol(42431, "USD")).toBe("PathUSD");
    expect(gasSymbol(11155931, "ETH")).toBe("ETH");
    expect(gasSymbol(undefined, "ETH")).toBe("ETH");
  });
  it("formats a Tempo fee on the 1e18 scale, in the token that was charged", () => {
    // 58,735 gas at 0.6 gwei: 35,241,000,000,000 at 1e-18 dollars is $0.000035241.
    expect(feeUnits(42431, { symbol: "USD", decimals: 6 })).toEqual({ symbol: "PathUSD", decimals: 18 });
    expect(feeUnits(42431, { symbol: "USD", decimals: 6 }, chargedFeeToken(42431, "0x20C0000000000000000000000000000000000001"))).toEqual({
      symbol: "AlphaUSD",
      decimals: 18,
    });
  });
  it("uses the native coin elsewhere", () => {
    expect(feeUnits(5042002, { symbol: "USDC", decimals: 18 })).toEqual({ symbol: "USDC", decimals: 18 });
    expect(feeUnits(5042002, undefined)).toBeNull();
  });
});
