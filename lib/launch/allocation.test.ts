import { describe, expect, it } from "vitest";
import { allocate, donutDashes, fmtShare } from "./allocation";

const SUPPLY = 100_000_000;

describe("allocate", () => {
  it("divides by the supply, not by the sum", () => {
    // 60% spoken for. Normalising by the sum would render this as a full ring.
    const { slices, overAllocated } = allocate([{ label: "Presale", value: 60_000_000 }], SUPPLY);
    expect(overAllocated).toBe(false);
    expect(slices[0]!.fraction).toBeCloseTo(0.6, 10);
  });

  it("makes the shortfall a real slice, sitting last however large it is", () => {
    const { slices } = allocate([{ label: "Presale", value: 10_000_000 }], SUPPLY);
    expect(slices.map((s) => s.label)).toEqual(["Presale", "Unallocated"]);
    expect(slices[1]!.remainder).toBe(true);
    expect(slices[1]!.value).toBe(90_000_000);
  });

  it("adds no remainder when the split is exact", () => {
    const { slices } = allocate(
      [
        { label: "Presale", value: 40_000_000 },
        { label: "Creator", value: 60_000_000 },
      ],
      SUPPLY,
    );
    expect(slices).toHaveLength(2);
    expect(slices.some((s) => s.remainder)).toBe(false);
  });

  it("reports an over-allocation instead of scaling it away", () => {
    const a = allocate(
      [
        { label: "Presale", value: 80_000_000 },
        { label: "Treasury", value: 40_000_000 },
      ],
      SUPPLY,
    );
    expect(a.overAllocated).toBe(true);
    expect(a.overflow).toBe(20_000_000);
    // The promise is still visible as more than the whole supply.
    expect(a.slices[0]!.fraction).toBeCloseTo(0.8, 10);
    expect(a.slices[1]!.fraction).toBeCloseTo(0.4, 10);
  });

  it("drops empty entries rather than printing 0.00% rows", () => {
    const { slices } = allocate(
      [
        { label: "Presale", value: 100_000_000 },
        { label: "Treasury", value: 0 },
        { label: "Broken", value: Number.NaN },
        { label: "Negative", value: -5 },
      ],
      SUPPLY,
    );
    expect(slices.map((s) => s.label)).toEqual(["Presale"]);
  });

  it("orders by size and ranks from one", () => {
    const { slices } = allocate(
      [
        { label: "Small", value: 10_000_000 },
        { label: "Big", value: 70_000_000 },
        { label: "Mid", value: 20_000_000 },
      ],
      SUPPLY,
    );
    expect(slices.map((s) => s.label)).toEqual(["Big", "Mid", "Small"]);
    expect(slices.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  // The supply field is text the creator is still typing, so zero and empty
  // both reach here. Neither may divide.
  it("survives a supply of zero", () => {
    const a = allocate([{ label: "Presale", value: 1 }], 0);
    expect(a.total).toBe(0);
    expect(a.slices[0]!.fraction).toBe(0);
    expect(a.slices.some((s) => s.remainder)).toBe(false);
  });
});

describe("donutDashes", () => {
  const C = 100;

  it("lays slices end to end around the ring", () => {
    const dashes = donutDashes([{ fraction: 0.5 }, { fraction: 0.3 }, { fraction: 0.2 }], C);
    expect(dashes[0]).toEqual({ dash: "50 100", offset: -0 });
    expect(dashes[1]).toEqual({ dash: "30 100", offset: -50 });
    expect(dashes[2]).toEqual({ dash: "20 100", offset: -80 });
  });

  // A launch with nothing seeded is one slice at 100%. An arc path from 0 to
  // 360 degrees draws nothing; a full-circumference dash draws the ring.
  it("draws a complete ring for a single 100% slice", () => {
    expect(donutDashes([{ fraction: 1 }], C)[0]!.dash).toBe("100 100");
  });

  it("clamps an over-allocated slice instead of lapping the ring", () => {
    const dashes = donutDashes([{ fraction: 0.8 }, { fraction: 0.4 }], C);
    expect(dashes[1]!.dash).toBe("40 100");
    expect(dashes[1]!.offset).toBe(-80);
    // Everything after the ring is full stays pinned at the end.
    const third = donutDashes([{ fraction: 0.8 }, { fraction: 0.4 }, { fraction: 0.1 }], C)[2]!;
    expect(third.offset).toBe(-100);
  });

  it("returns a drawable answer for a zero circumference", () => {
    expect(donutDashes([{ fraction: 0.5 }], 0)[0]).toEqual({ dash: "0 0", offset: -0 });
  });
});

describe("fmtShare", () => {
  it("prints two decimals", () => {
    expect(fmtShare(0.9)).toBe("90.00%");
    expect(fmtShare(0.1)).toBe("10.00%");
  });

  it("is an em-dash for a non-number, never 0.00%", () => {
    expect(fmtShare(Number.NaN)).toBe("—");
  });
});
