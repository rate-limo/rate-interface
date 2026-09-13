import { describe, expect, it } from "vitest";
import { fillProgress, formatFillProgress } from "./fillProgress";

/** 18-decimal wei helper. */
const WEI = BigInt("1000000000000000000");
const w = (whole: string) => (BigInt(whole) * WEI).toString();

describe("fillProgress", () => {
  it("uses the exact values when both are present", () => {
    const p = fillProgress({ amountBN: w("4"), placedBN: w("1"), amount: 4, placed: 1 });
    expect(p).toEqual({ kind: "exact", percent: 75 });
  });

  it("holds the case float4 gets wrong", () => {
    // 1.000000001 taking a 1.0 fill: one gigawei still resting. The float column
    // stores 0 for `placed`, which reads as fully filled.
    const exact = fillProgress({
      amountBN: "1000000001000000000",
      placedBN: "1000000000",
      amount: 1.000000001,
      placed: 0, // what real() actually stored
    });
    expect(exact.kind).toBe("exact");
    expect(exact.kind === "exact" && exact.percent).toBeLessThan(100);

    // The same row without the exact values claims completion.
    const floaty = fillProgress({ amount: 1.000000001, placed: 0 });
    expect(floaty).toEqual({ kind: "approximate", percent: 100 });
  });

  it("never rounds a partially filled order up to 100", () => {
    // One wei short of complete, on an 18-decimal order.
    const p = fillProgress({ amountBN: w("1"), placedBN: "1" });
    expect(p.kind).toBe("exact");
    expect(p.kind === "exact" && p.percent).toBeLessThan(100);
  });

  it("reports a genuinely untouched order as zero", () => {
    expect(fillProgress({ amountBN: w("5"), placedBN: w("5") })).toEqual({
      kind: "exact",
      percent: 0,
    });
  });

  it("reports a genuinely complete order as 100", () => {
    expect(fillProgress({ amountBN: w("5"), placedBN: "0" })).toEqual({
      kind: "exact",
      percent: 100,
    });
  });

  it("falls back to the floats for orders predating exact tracking", () => {
    expect(fillProgress({ amount: 10, placed: 4, amountBN: null, placedBN: null })).toEqual({
      kind: "approximate",
      percent: 60,
    });
  });

  it("treats a negative fill as unknown, not as zero", () => {
    // placed > amount cannot arise from fills -- it is drift or a missed event, and
    // rendering 0.00% would hide exactly that.
    expect(fillProgress({ amount: 4, placed: 9 })).toEqual({ kind: "unknown" });
  });

  it("is unknown rather than NaN for missing or zero-size input", () => {
    expect(fillProgress({})).toEqual({ kind: "unknown" });
    expect(fillProgress({ amount: 0, placed: 0 })).toEqual({ kind: "unknown" });
    expect(fillProgress({ amount: Number.NaN, placed: 1 })).toEqual({ kind: "unknown" });
  });

  it("ignores unparseable exact values rather than throwing", () => {
    expect(fillProgress({ amountBN: "not-a-number", placedBN: "1", amount: 4, placed: 1 }))
      .toEqual({ kind: "approximate", percent: 75 });
  });

  it("clamps a resting size larger than the order instead of going negative", () => {
    const p = fillProgress({ amountBN: w("1"), placedBN: w("9") });
    expect(p).toEqual({ kind: "exact", percent: 0 });
  });
});

describe("formatFillProgress", () => {
  it("never claims completion for a row that is still listed", () => {
    // A row in the open-orders table is an order the chain has not cleared.
    const { label } = formatFillProgress({ kind: "exact", percent: 99.999 });
    expect(label).toBe("≈100%");
  });

  it("switches at the point toFixed(2) would start printing 100.00", () => {
    expect(formatFillProgress({ kind: "exact", percent: 99.994 }).label).toBe("99.99%");
    expect(formatFillProgress({ kind: "exact", percent: 99.995 }).label).toBe("≈100%");
  });

  it("renders an em-dash for unknown, never a zero", () => {
    const out = formatFillProgress({ kind: "unknown" });
    expect(out.label).toBe("—");
    expect(out.title).toBeTruthy();
  });

  it("marks an approximate value so the two are distinguishable", () => {
    expect(formatFillProgress({ kind: "approximate", percent: 42 }).title).toMatch(/Approximate/);
    expect(formatFillProgress({ kind: "exact", percent: 42 }).title).toBeUndefined();
  });
});
