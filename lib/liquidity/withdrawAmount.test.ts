import { describe, expect, it } from "vitest";
import { bpsForPercent, isFullExit } from "./withdrawAmount";

describe("bpsForPercent", () => {
  it("is exactly 10,000 for a full exit -- no sentinel, no dust", () => {
    expect(bpsForPercent(100)).toBe(10_000);
  });

  it("maps the offered percentages to basis points of every band", () => {
    expect(bpsForPercent(25)).toBe(2_500);
    expect(bpsForPercent(50)).toBe(5_000);
    expect(bpsForPercent(75)).toBe(7_500);
  });

  it("stays inside what the contract accepts: never 0, never above 10,000", () => {
    expect(bpsForPercent(0)).toBe(1);
    expect(bpsForPercent(250)).toBe(10_000);
  });
});

describe("isFullExit", () => {
  it("is only 100%", () => {
    expect(isFullExit(100)).toBe(true);
    expect(isFullExit(75)).toBe(false);
  });
});
