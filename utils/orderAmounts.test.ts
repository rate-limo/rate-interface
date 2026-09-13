import { describe, expect, it } from "vitest";
import { deriveBaseFromQuote, deriveQuoteFromBase, safeRoundDecimals } from "./orderAmounts";

/**
 * TradingPanel derives whichever of baseAmount/quoteAmount the user didn't
 * type directly. This used to round to a flat 4 decimal places regardless of
 * the base/quote token's actual on-chain `decimals` (ETH=18, WBTC=8, USDC=6,
 * ...), which rounded valid, on-chain-representable amounts down to dust (0)
 * or drifted the derived leg by >5% of the entered value on an ETH(18)/
 * USDC(6) pair. Callers now round to `safeRoundDecimals(token.decimals)`
 * instead. See docs/decimal-precision-and-dust-order-risks.md.
 */
describe("token-decimals-aware rounding: no more dust orders on ETH/USDC-style pairs", () => {
  const ETH_USDC_PRICE = 3000;
  const BASE_DECIMALS = safeRoundDecimals(18); // ETH, clamped to 8
  const QUOTE_DECIMALS = safeRoundDecimals(6); // USDC

  it("no longer rounds a small but valid quote amount down to a base amount of zero", () => {
    // $0.001 USDC is 1000 raw units at USDC's 6 decimals — comfortably
    // representable and non-dust on-chain. Rounding to 8 decimals of ETH
    // (instead of a flat 4) keeps it non-zero.
    const baseAmount = deriveBaseFromQuote(0.001, ETH_USDC_PRICE, BASE_DECIMALS);
    expect(baseAmount).toBeCloseTo(0.00000033, 8);
    expect(baseAmount).not.toBe(0);
  });

  it("keeps the derived amount within a fraction of a percent of the quote amount the trader entered", () => {
    const quoteAmount = 0.29;
    const baseAmount = deriveBaseFromQuote(quoteAmount, ETH_USDC_PRICE, BASE_DECIMALS);

    const impliedQuoteValue = baseAmount * ETH_USDC_PRICE;
    const relativeError = Math.abs(impliedQuoteValue - quoteAmount) / quoteAmount;
    expect(relativeError).toBeLessThan(0.001); // was ~3.4% under the flat 4-decimal rounding
  });

  it("round-trips quoteAmount -> baseAmount -> quoteAmount within a fraction of a percent", () => {
    const originalQuoteAmount = 1; // $1 USDC
    const baseAmount = deriveBaseFromQuote(originalQuoteAmount, ETH_USDC_PRICE, BASE_DECIMALS);
    const roundTrippedQuoteAmount = deriveQuoteFromBase(baseAmount, ETH_USDC_PRICE, QUOTE_DECIMALS);

    const relativeDrift =
      Math.abs(originalQuoteAmount - roundTrippedQuoteAmount) / originalQuoteAmount;
    expect(relativeDrift).toBeLessThan(0.001); // was >5% under the flat 4-decimal rounding
  });
});

describe("safeRoundDecimals", () => {
  it("clamps token decimals to the float-safe ceiling", () => {
    expect(safeRoundDecimals(18)).toBe(8);
    expect(safeRoundDecimals(8)).toBe(8);
  });

  it("passes through token decimals below the ceiling unchanged", () => {
    expect(safeRoundDecimals(6)).toBe(6);
    expect(safeRoundDecimals(0)).toBe(0);
  });
});
