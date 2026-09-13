import { describe, expect, it } from "vitest";
import {
  formatMarketCap,
  formatSubscriptDecimal,
  formatUsd,
  parseUnits,
  priceAxisDecimals,
  priceEncodesToZero,
} from "./number";

/**
 * The trading UI encodes every order's limit price on-chain with a FIXED
 * 8-decimal precision regardless of the pair's actual base/quote decimals
 * (see TradePageProvider.tsx: `parseUnits(limitPrice.toString(), 8)`). This
 * is a confirmed, intentional protocol-wide convention (the broker decodes
 * on-chain prices with the same fixed `decimals=8` regardless of token
 * decimals — see apps/broker/src/utils/numbers.ts and
 * apps/broker/traffic-gen.ts), not a client-side scale bug, so it is not
 * changed. What these tests reproduce is the underlying significant-digit
 * loss: a price a user typed as a valid, nonzero number can encode to zero
 * or a materially different on-chain value. `priceEncodesToZero` (tested
 * below) is what TradePageProvider now uses to detect the zero case and
 * block submission with a warning instead of silently submitting a
 * zero-price order. See docs/decimal-precision-and-dust-order-risks.md.
 */
describe("8-decimal fixed-point price encoding: significant-digit loss", () => {
  it("collapses a valid nonzero price to exactly zero once its first significant digit falls past the 8th decimal place", () => {
    // Realistic for any low-nominal-price base asset quoted in a pair (e.g. a
    // micro-cap token quoted in ETH/USDC) — not for ETH/USDC's own price level.
    expect(parseUnits("0.000000001", 8)).toBe(BigInt(0));
  });

  it("silently rounds a price whose 9th significant decimal is nonzero, rather than rejecting or warning", () => {
    // 0.000000049 truncates/rounds to 0.00000005 -> encoded as raw unit 5.
    // The trader typed one value; the chain receives a ~2% different one,
    // with no signal that anything was lost.
    const encoded = parseUnits("0.000000049", 8);
    expect(encoded).toBe(BigInt(5));
    expect(encoded).not.toBe(parseUnits("0.00000004", 8));
  });

  it("preserves full precision for ETH/USDC-magnitude prices (the bug is magnitude-dependent, not universal)", () => {
    expect(parseUnits("3421.55512345", 8)).toBe(BigInt("342155512345"));
  });
});

describe("priceEncodesToZero", () => {
  it("flags a nonzero price that collapses to raw 0 at 8-decimal encoding", () => {
    expect(priceEncodesToZero(0.000000001)).toBe(true);
  });

  it("does not flag a nonzero price that still encodes to a nonzero raw value", () => {
    expect(priceEncodesToZero(0.000000049)).toBe(false);
    expect(priceEncodesToZero(3421.55512345)).toBe(false);
  });

  it("does not flag a zero or unset price (nothing to submit yet, not a precision-loss case)", () => {
    expect(priceEncodesToZero(0)).toBe(false);
  });
});

/**
 * formatMarketCap renders `spotTokens.marketCap`, a generated column derived
 * from priceUSD. The absent cases are the point: NULL for an unpriced token,
 * undefined from an indexer that predates migration 0021. Both must read as
 * "unknown", never as a measured zero.
 */
describe("formatMarketCap", () => {
  it("prints compact USD, the format the token tables have always used", () => {
    expect(formatMarketCap(4_120_000)).toBe("$4.1M");
    expect(formatMarketCap(850_000)).toBe("$850.0K");
    expect(formatMarketCap(1_200_000_000)).toBe("$1.2B");
  });

  it("dashes rather than showing $0 when the value is unknown", () => {
    expect(formatMarketCap(null)).toBe("—");
    expect(formatMarketCap(undefined)).toBe("—");
    expect(formatMarketCap(Number.NaN)).toBe("—");
    expect(formatMarketCap(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("still prints a real zero, which is a measured value", () => {
    expect(formatMarketCap(0)).toBe("$0.0");
  });
});

describe("formatSubscriptDecimal", () => {
  it("counts the zeros between the point and the first significant digit", () => {
    expect(formatSubscriptDecimal(0.008)).toBe("0.0\u20828");
    expect(formatSubscriptDecimal(0.0036)).toBe("0.0\u208236");
    expect(formatSubscriptDecimal(0.00000123)).toBe("0.0\u2085123");
    expect(formatSubscriptDecimal(0.000012345)).toBe("0.0\u20841234");
  });

  it("counts zeros AFTER rounding, so a carry across a power of ten cannot misplace the decimal", () => {
    // 0.00099999 at 4 significant figures IS 0.001. Counting the zeros on the
    // input instead of the rounded value prints 0.0\u20831 -- a tenth of the real
    // number, and wrong in the direction a reader cannot catch.
    expect(formatSubscriptDecimal(0.00099999)).toBe("0.0\u20821");
  });

  it("handles exact powers of ten, where a log10-based zero count drifts", () => {
    expect(formatSubscriptDecimal(0.001)).toBe("0.0\u20821");
    expect(formatSubscriptDecimal(0.0001)).toBe("0.0\u20831");
    expect(formatSubscriptDecimal(1e-7)).toBe("0.0\u20861");
    expect(formatSubscriptDecimal(1.234e-10)).toBe("0.0\u20891234");
  });

  it("trims trailing zeros rather than implying precision", () => {
    expect(formatSubscriptDecimal(0.0080)).toBe("0.0\u20828");
    expect(formatSubscriptDecimal(0.00010000)).toBe("0.0\u20831");
  });

  it("returns null for the normal range, so the caller keeps its own formatting", () => {
    expect(formatSubscriptDecimal(0.05)).toBeNull();
    expect(formatSubscriptDecimal(0.5)).toBeNull();
    expect(formatSubscriptDecimal(1)).toBeNull();
    expect(formatSubscriptDecimal(1635.42)).toBeNull();
  });

  it("returns null for zero and for anything unmeasured", () => {
    // Never "0.0\u20820" -- a zero price is a real zero, and notation for it would
    // dress an absent value as a measured one.
    expect(formatSubscriptDecimal(0)).toBeNull();
    expect(formatSubscriptDecimal(null)).toBeNull();
    expect(formatSubscriptDecimal(undefined)).toBeNull();
    expect(formatSubscriptDecimal(Number.NaN)).toBeNull();
    expect(formatSubscriptDecimal(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("keeps the sign", () => {
    expect(formatSubscriptDecimal(-0.008)).toBe("-0.0\u20828");
  });

  it("takes the significant-digit count from the caller", () => {
    expect(formatSubscriptDecimal(0.000012345, { digits: 2 })).toBe("0.0\u208412");
    expect(formatSubscriptDecimal(0.000012345, { digits: 6 })).toBe("0.0\u208412345");
  });

  it("respects a raised minZeros threshold", () => {
    expect(formatSubscriptDecimal(0.008, { minZeros: 3 })).toBeNull();
    expect(formatSubscriptDecimal(0.0008, { minZeros: 3 })).toBe("0.0\u20838");
  });
});

describe("priceAxisDecimals", () => {
  const TICK_1E7 = 7; // what the gateway declares for every price symbol

  it("spends its digits on the significant end, not on the tick", () => {
    // The ETH-on-RISE case: pricescale 1e7 asked for seven decimals on a $2,000
    // asset, and the axis rendered 2,000.0000004 -- float noise as price.
    expect(priceAxisDecimals(2000, TICK_1E7)).toBe(2);
    expect(priceAxisDecimals(1.2345678, TICK_1E7)).toBe(5);
    expect(priceAxisDecimals(0.05, TICK_1E7)).toBe(5);
  });

  it("keeps cents on a large price, where the digit budget alone would drop them", () => {
    expect(priceAxisDecimals(95432.1, TICK_1E7)).toBe(2);
    expect(priceAxisDecimals(1234567, TICK_1E7)).toBe(2);
  });

  it("never quotes finer than the symbol can actually move", () => {
    // A coarse tick is an upper bound: pricescale 100 is a one-cent market, and
    // no magnitude argument justifies printing tenths of a cent on it.
    expect(priceAxisDecimals(1.2345678, 2)).toBe(2);
    expect(priceAxisDecimals(0.05, 0)).toBe(0);
  });

  it("handles zero without reaching for log10(0)", () => {
    expect(Number.isFinite(priceAxisDecimals(0, TICK_1E7))).toBe(true);
    expect(priceAxisDecimals(0, TICK_1E7)).toBe(5);
  });

  it("is unaffected by sign", () => {
    expect(priceAxisDecimals(-2000, TICK_1E7)).toBe(priceAxisDecimals(2000, TICK_1E7));
  });
});

/**
 * The venue's USD notation, end to end. Both halves in one place because they were
 * previously in two and the middle of the range fell through: a real sub-cent PnL
 * rounded to `$0`, and a million printed as `$1,234,567`.
 */
describe("formatUsd", () => {
  it("compacts at a thousand and above, uppercase", () => {
    expect(formatUsd(1_200)).toBe("$1.2K");
    expect(formatUsd(794_700)).toBe("$794.7K");
    expect(formatUsd(4_100_000)).toBe("$4.1M");
    expect(formatUsd(2_500_000_000)).toBe("$2.5B");
  });

  it("matches formatMarketCap's casing, so one unit is not spelled two ways", () => {
    expect(formatUsd(4_100_000)).toBe(formatMarketCap(4_100_000));
  });

  it("uses subscript-zero notation below a dollar", () => {
    expect(formatUsd(0.00000123)).toBe("$0.0₅123");
    expect(formatUsd(0.000045)).toBe("$0.0₄45");
  });

  it("renders the 0.01–0.99 band plainly, where notation costs more than the zeros", () => {
    expect(formatUsd(0.04)).toBe("$0.04");
    expect(formatUsd(0.5)).toBe("$0.5");
  });

  it("reserves $0 for an exact zero", () => {
    // A launch token trades in the 1e-5 range, so an entire realised PnL can sit below a
    // cent. Rounding that to `$0` is the information loss this notation exists to stop.
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0000004)).not.toBe("$0");
  });

  it("drops a trailing zero left by the compaction", () => {
    expect(formatUsd(1_000)).toBe("$1K");
    expect(formatUsd(2_000_000)).toBe("$2M");
  });

  it("keeps the sign, and answers an em-dash for a non-number", () => {
    expect(formatUsd(-4_100_000)).toBe("-$4.1M");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
});
