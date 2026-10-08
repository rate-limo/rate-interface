import { describe, expect, it } from "vitest";
import { launchIsCoinOnly, poolRiskLevel } from "./poolRisk";

const n = (v: number) => BigInt(v);

describe("poolRiskLevel", () => {
  it("is standard when nothing was read", () => {
    expect(poolRiskLevel(null)).toBe("standard");
    expect(poolRiskLevel(undefined)).toBe("standard");
    expect(poolRiskLevel([])).toBe("standard");
  });

  it("is standard for an empty pool", () => {
    expect(poolRiskLevel([{ baseReserve: n(0), quoteReserve: n(0) }])).toBe("standard");
  });

  it("is thin when only coins are in the pool", () => {
    expect(
      poolRiskLevel([
        { baseReserve: n(1000), quoteReserve: n(0) },
        { baseReserve: n(500), quoteReserve: n(0) },
      ]),
    ).toBe("thin");
  });

  it("is thin when only the other token is in the pool (orientation does not matter)", () => {
    expect(poolRiskLevel([{ baseReserve: n(0), quoteReserve: n(7) }])).toBe("thin");
  });

  it("is standard when both sides hold something, in any band", () => {
    expect(
      poolRiskLevel([
        { baseReserve: n(1000), quoteReserve: n(0) },
        { baseReserve: n(0), quoteReserve: n(3) },
      ]),
    ).toBe("standard");
  });

  it("treats missing reserves as zero", () => {
    expect(poolRiskLevel([{ baseReserve: n(5) }])).toBe("thin");
    expect(poolRiskLevel([{}])).toBe("standard");
  });
});

describe("launchIsCoinOnly", () => {
  it("is true for a base-only deposit", () => {
    expect(launchIsCoinOnly(-1, "")).toBe(true);
  });
  it("is false for a quote-only deposit", () => {
    expect(launchIsCoinOnly(1, "100")).toBe(false);
  });
  it("is true for a two-sided form with no quote entered", () => {
    expect(launchIsCoinOnly(0, "")).toBe(true);
    expect(launchIsCoinOnly(0, "0")).toBe(true);
  });
  it("is false when the quote amount is positive, commas allowed", () => {
    expect(launchIsCoinOnly(0, "1,250.5")).toBe(false);
  });
});
