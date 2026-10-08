import { describe, expect, it } from "vitest";
import { formatBookSize } from "./size";

describe("formatBookSize", () => {
  it("groups below a million and goes compact from it", () => {
    expect(formatBookSize(193_333.333)).toBe("193,333");
    expect(formatBookSize(193_333_333.333)).toBe("193M");
    expect(formatBookSize(15_000_000)).toBe("15.0M");
  });

  it("never rounds a small total to zero", () => {
    expect(formatBookSize(0.000135)).toBe("0.000135");
    expect(formatBookSize(135)).toBe("135");
    expect(formatBookSize(1.5)).toBe("1.5");
  });

  it("dashes a non-number", () => {
    expect(formatBookSize("x")).toBe("—");
  });
});
