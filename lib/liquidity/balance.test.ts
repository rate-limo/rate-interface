import { describe, expect, it } from "vitest";
import { checkDepositBalance, hasDepositAmount, maxFieldAmount } from "./balance";

const held = (entries: [string, number][]) => new Map(entries);

describe("checkDepositBalance", () => {
  it("passes a deposit the wallet covers", () => {
    expect(checkDepositBalance([{ symbol: "USDC", amount: 25 }], held([["USDC", 100]]))).toEqual({
      state: "ok",
    });
  });

  it("names the token and both figures when it is short", () => {
    expect(checkDepositBalance([{ symbol: "USDC", amount: 250 }], held([["USDC", 100]]))).toEqual({
      state: "short",
      symbol: "USDC",
      held: 100,
      needed: 250,
    });
  });

  /*
   * The rule `TokenModal` already follows for the picker, with money attached:
   * a disconnected wallet and an in-flight query have NO balances, and printing
   * or enforcing zero would be a statement about the user's funds that happens
   * to be false.
   */
  it("is unknown, not short, when there are no balances at all", () => {
    expect(checkDepositBalance([{ symbol: "USDC", amount: 250 }], undefined)).toEqual({
      state: "unknown",
    });
  });

  it("is unknown for a token the list does not carry", () => {
    expect(checkDepositBalance([{ symbol: "VF15CK", amount: 1 }], held([["USDC", 100]]))).toEqual({
      state: "unknown",
    });
  });

  it("reports the shortfall even when the other side is unresolved", () => {
    // Two-sided, one side missing from the list and the other genuinely short.
    // "We are not sure" would withhold the only fact the LP can act on.
    const verdict = checkDepositBalance(
      [
        { symbol: "VF15CK", amount: 1 },
        { symbol: "USDC", amount: 250 },
      ],
      held([["USDC", 100]]),
    );
    expect(verdict).toEqual({ state: "short", symbol: "USDC", held: 100, needed: 250 });
  });

  it("ignores a side with nothing in it", () => {
    // Single-sided deposits leave the other field empty; an empty field is not
    // a shortfall of zero.
    expect(
      checkDepositBalance(
        [
          { symbol: "VF15CK", amount: 0 },
          { symbol: "USDC", amount: 25 },
        ],
        held([["USDC", 100]]),
      ),
    ).toEqual({ state: "ok" });
  });

  it("treats a non-finite balance as unknown rather than passing it", () => {
    expect(
      checkDepositBalance([{ symbol: "USDC", amount: 1 }], held([["USDC", Number.NaN]])),
    ).toEqual({ state: "unknown" });
  });

  it("passes an exact-balance deposit", () => {
    expect(checkDepositBalance([{ symbol: "USDC", amount: 100 }], held([["USDC", 100]]))).toEqual({
      state: "ok",
    });
  });
});

describe("maxFieldAmount", () => {
  it("never exceeds the balance it was given", () => {
    // The bug: `maximumFractionDigits` rounds to nearest, so 3.91705 became
    // "3.9171" — more than the wallet held — and the field Max had just filled
    // immediately read "More than you hold".
    expect(maxFieldAmount(3.91705, 4)).toBe(3.917);
    expect(maxFieldAmount(3.91705, 4)).toBeLessThanOrEqual(3.91705);
  });

  it("leaves a balance that already fits exactly alone", () => {
    // Rounding down must not cost a unit of the last place on an exact value.
    expect(maxFieldAmount(3.9171, 4)).toBe(3.9171);
    expect(maxFieldAmount(2, 4)).toBe(2);
    expect(maxFieldAmount(0.0001, 4)).toBe(0.0001);
  });

  it("survives the scaling error that flooring would otherwise amplify", () => {
    // Values whose scaled form lands at …9999999996 must not lose a whole unit
    // of the last decimal place.
    for (const v of [1.1, 2.2, 4.3, 8.7, 29.7, 1.005, 16.08]) {
      expect(maxFieldAmount(v, 4)).toBe(v);
    }
  });

  it("rounds a long balance down at the field's precision", () => {
    expect(maxFieldAmount(26.0413587, 4)).toBe(26.0413);
    expect(maxFieldAmount(26.04139999, 4)).toBe(26.0413);
  });

  it("is zero for nothing to spend, rather than a negative or NaN field", () => {
    expect(maxFieldAmount(0, 4)).toBe(0);
    expect(maxFieldAmount(-1, 4)).toBe(0);
    expect(maxFieldAmount(Number.NaN, 4)).toBe(0);
    // Dust below the field's precision cannot be expressed, so it is not offered.
    expect(maxFieldAmount(0.00001, 4)).toBe(0);
  });

  it("agrees with the verdict it feeds, across awkward balances", () => {
    // The real invariant: Max can never produce a "short" verdict.
    for (const held of [3.91705, 26.0413587, 1.00005, 999.99995, 0.12345]) {
      const amount = maxFieldAmount(held, 4);
      if (amount <= 0) continue;
      const verdict = checkDepositBalance(
        [{ symbol: "TKN", amount }],
        new Map([["TKN", held]]),
      );
      expect(verdict.state).toBe("ok");
    }
  });
});

describe("hasDepositAmount", () => {
  it("is false for an untouched form", () => {
    // The first state every LP sees. `checkDepositBalance` calls this "ok",
    // which is why the gate cannot be built on it.
    expect(
      hasDepositAmount([
        { symbol: "TITER", amount: 0 },
        { symbol: "USDC", amount: 0 },
      ]),
    ).toBe(false);
  });

  it("is true once either side is filled", () => {
    // `some`, not `every`: a two-sided form with one side filled is a real
    // deposit, and the contract takes a zero array for the other side.
    expect(
      hasDepositAmount([
        { symbol: "TITER", amount: 0 },
        { symbol: "USDC", amount: 25 },
      ]),
    ).toBe(true);
  });

  it("is true for a single-sided deposit", () => {
    expect(hasDepositAmount([{ symbol: "USDC", amount: 25 }])).toBe(true);
  });

  it("is false for a half-typed amount that parses to nothing", () => {
    // The fields hand through `Number(raw) || 0`, so "." and "abc" arrive as 0.
    expect(hasDepositAmount([{ symbol: "USDC", amount: Number.NaN }])).toBe(false);
    expect(hasDepositAmount([])).toBe(false);
  });
});
