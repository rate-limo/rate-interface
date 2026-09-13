import { describe, expect, it } from "vitest";
import { compactNumber, compactUsd } from "./compact";

/**
 * The shared compact formatters, which had no tests.
 *
 * They are the app's answer to "a large number in a small box" — the profile
 * modal's tab badges, follower counts and trade counts all route through
 * `compactNumber`, and every USD figure beside them through the `formatUsd`
 * family. What is pinned here is the boundaries, because that is where a
 * rewrite silently changes what a whole screen reads: the last value that stays
 * long, the first that compacts, and the point where the decimal is dropped.
 */

describe("compactNumber", () => {
  it("leaves small counts alone, with no stray decimals", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(7)).toBe("7");
    expect(compactNumber(42)).toBe("42");
  });

  it("drops the decimal at 100, where three digits already fit", () => {
    expect(compactNumber(99)).toBe("99");
    expect(compactNumber(100)).toBe("100");
    expect(compactNumber(999)).toBe("999");
  });

  it("compacts from a thousand", () => {
    // The boundary itself keeps one decimal, so 1000 and 1100 stay distinct.
    expect(compactNumber(1_000)).toBe("1.0K");
    expect(compactNumber(1_234)).toBe("1.2K");
    // A realistic tab badge: 12,847 coins used to render as `12847` and stretch
    // the pill past the label it belongs to.
    expect(compactNumber(12_847)).toBe("12.8K");
  });

  it("carries through every unit", () => {
    expect(compactNumber(1_284_993)).toBe("1.3M");
    expect(compactNumber(2_500_000_000)).toBe("2.5B");
    expect(compactNumber(3_400_000_000_000)).toBe("3.4T");
  });

  it("drops the decimal again above 100 of a unit", () => {
    // 794.7K would be wider than the box; 795K is the same information.
    expect(compactNumber(794_700)).toBe("795K");
  });

  it("keeps the sign ahead of the number", () => {
    expect(compactNumber(-1_500)).toBe("-1.5K");
    expect(compactNumber(-42)).toBe("-42");
  });
});

describe("compactUsd", () => {
  it("prefixes the symbol and compacts the same way", () => {
    expect(compactUsd(1_200)).toBe("$1.2K");
    expect(compactUsd(4_100_000)).toBe("$4.1M");
  });

  it("keeps cents on a real fractional amount", () => {
    expect(compactUsd(3.4)).toBe("$3.40");
  });

  it("strips a trailing .00 so whole dollars read as whole", () => {
    expect(compactUsd(0)).toBe("$0");
    expect(compactUsd(42)).toBe("$42");
  });

  it("puts the minus ahead of the dollar sign, not after it", () => {
    // "$-1.2K" would be the other reading, and it is wrong in every ledger.
    expect(compactUsd(-1_200)).toBe("-$1.2K");
  });
});
