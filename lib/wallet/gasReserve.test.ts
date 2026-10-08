import { describe, expect, it } from "vitest";
import { GAS_RESERVE_RATIO, maxSpendable, maxSpendableUnits, spendsGas } from "./gasReserve";

describe("maxSpendable", () => {
  it("fills everything for a token that does not pay for gas", () => {
    expect(maxSpendable(100, false)).toBe(100);
  });

  /*
   * Arc's gas asset IS USDC, so Max on the deposit token is Max on the thing
   * that pays for the transaction — and the revert lands after the approval has
   * already been paid for.
   */
  it("keeps a sliver of the gas asset back", () => {
    expect(maxSpendable(100, true)).toBeCloseTo(100 * (1 - GAS_RESERVE_RATIO), 10);
    expect(maxSpendable(100, true)).toBeLessThan(100);
  });

  it("is zero for an empty or unreadable balance, never negative", () => {
    expect(maxSpendable(0, true)).toBe(0);
    expect(maxSpendable(-5, false)).toBe(0);
    expect(maxSpendable(Number.NaN, true)).toBe(0);
  });
});

describe("spendsGas", () => {
  /*
   * The case a symbol comparison gets wrong. Both chains' `nativeCurrency`
   * symbol appears verbatim in their token list, so a symbol match is true on
   * both — and only one of them is really the asset paying for the transaction.
   */
  it("is true for Arc's USDC, where the ERC-20 IS the gas asset", () => {
    expect(
      spendsGas({ symbol: "USDC", gasSymbol: "USDC", hasSeparateNativeRow: false }),
    ).toBe(true);
  });

  it("is false for RISE's ETH, which is the WETH contract and not gas", () => {
    expect(spendsGas({ symbol: "ETH", gasSymbol: "ETH", hasSeparateNativeRow: true })).toBe(
      false,
    );
  });

  it("is false for any ordinary token", () => {
    expect(
      spendsGas({ symbol: "WBTC", gasSymbol: "ETH", hasSeparateNativeRow: true }),
    ).toBe(false);
    expect(
      spendsGas({ symbol: "EURC", gasSymbol: "USDC", hasSeparateNativeRow: false }),
    ).toBe(false);
  });

  it("is false when the registry names no gas asset", () => {
    expect(
      spendsGas({ symbol: "USDC", gasSymbol: undefined, hasSeparateNativeRow: false }),
    ).toBe(false);
  });
});

describe("spendsGas · the native row", () => {
  /*
   * The withdraw panel's `native` flag answers "is this the synthetic native
   * entry", which is a narrower question. Both directions matter.
   */
  it("is true for a native send on any chain", () => {
    expect(
      spendsGas({ symbol: "ETH", gasSymbol: "ETH", hasSeparateNativeRow: true, isNativeRow: true }),
    ).toBe(true);
  });

  it("is still false for the wrapped row beside it", () => {
    expect(
      spendsGas({ symbol: "ETH", gasSymbol: "ETH", hasSeparateNativeRow: true, isNativeRow: false }),
    ).toBe(false);
  });

  /*
   * Arc: no separate native row, so the flag is false — and spending the USDC
   * ERC-20 still drains the gas budget, because there the ERC-20 and the gas
   * asset are one pool of funds.
   */
  it("is true for Arc's USDC even though its native flag is false", () => {
    expect(
      spendsGas({
        symbol: "USDC",
        gasSymbol: "USDC",
        hasSeparateNativeRow: false,
        isNativeRow: false,
      }),
    ).toBe(true);
  });
});

describe("maxSpendableUnits", () => {
  it("leaves the whole balance for a token that does not pay for gas", () => {
    expect(maxSpendableUnits(BigInt(1000), false)).toBe(BigInt(1000));
  });

  it("keeps a reserve back on the gas asset", () => {
    expect(maxSpendableUnits(BigInt(1000), true)).toBe(BigInt(990));
  });

  it("is zero for an empty balance", () => {
    expect(maxSpendableUnits(BigInt(0), true)).toBe(BigInt(0));
    expect(maxSpendableUnits(BigInt(-5), true)).toBe(BigInt(0));
  });

  it("still reserves on a dust balance rather than offering it in full", () => {
    // A send that cannot pay for itself does not stop being one because the
    // amount is small.
    expect(maxSpendableUnits(BigInt(1), true)).toBe(BigInt(0));
  });
});
