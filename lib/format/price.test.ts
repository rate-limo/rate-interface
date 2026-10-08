import { describe, expect, it } from "vitest";
import { formatPrice, formatTickPrice, stepDecimals } from "./price";

describe("stepDecimals", () => {
  it("reads decimals from the tick", () => {
    expect(stepDecimals(0.000001)).toBe(6);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(10)).toBe(0);
    expect(stepDecimals(0.0001)).toBe(4);
    expect(stepDecimals("0.01")).toBe(2);
    expect(stepDecimals(1e-8)).toBe(8);
  });
});

describe("formatTickPrice", () => {
  it("keeps distinct levels distinct (the 'everything is 0.00001' bug)", () => {
    expect(formatTickPrice(0.000005, 0.000001)).toBe("0.000005");
    expect(formatTickPrice(0.000009, 0.000001)).toBe("0.000009");
    expect(formatTickPrice(0.000003, 0.000001)).toBe("0.000003");
  });

  it("lines a column up at the tick, with grouping", () => {
    expect(formatTickPrice(1980, 10)).toBe("1,980");
    expect(formatTickPrice(1999.5, 0.5)).toBe("1,999.5");
    expect(formatTickPrice(2000, 0.5)).toBe("2,000.0");
  });
});

describe("formatPrice", () => {
  it("never rounds a small price to zero", () => {
    expect(formatPrice(0.000003)).toBe("0.000003");
    expect(formatPrice(0.0000049)).toBe("0.0000049");
    expect(formatPrice(0.00000123456)).toBe("0.000001235");
  });

  it("is plain for ordinary prices", () => {
    expect(formatPrice(2000)).toBe("2,000");
    expect(formatPrice(1.23456)).toBe("1.235");
    expect(formatPrice(0.5)).toBe("0.5");
    expect(formatPrice(0)).toBe("0");
  });
});
