import { describe, expect, it } from "vitest";
import { axisDecimals, formatAxisValue } from "./number";

describe("formatAxisValue", () => {
  /* The complaint this exists for: a market-cap axis printing raw integers. */
  it("compacts thousands, millions and billions", () => {
    expect(formatAxisValue(1_000)).toBe("1K");
    expect(formatAxisValue(1_500)).toBe("1.5K");
    expect(formatAxisValue(2_400_000)).toBe("2.4M");
    expect(formatAxisValue(1_000_000_000)).toBe("1B");
  });

  it("carries no currency symbol — the axis renders a rate as well as a cap", () => {
    expect(formatAxisValue(1_500)).not.toContain("$");
    expect(formatAxisValue(0.5)).not.toContain("$");
  });

  /*
   * The reason this takes `decimals` at all. At one decimal these four ticks
   * are the same string, which is worse than the raw numbers they replaced.
   */
  it("keeps adjacent ticks distinct when told the precision", () => {
    const ticks = [1_000_050_000, 1_000_025_000, 1_000_000_000, 999_975_000];
    const flat = ticks.map((t) => formatAxisValue(t, 1));
    expect(new Set(flat).size).toBeLessThan(ticks.length); // the failure, pinned

    const dp = axisDecimals(1_000_050_000 - 999_775_000, 1e9);
    const sharp = ticks.map((t) => formatAxisValue(t, dp));
    expect(new Set(sharp).size).toBe(ticks.length);
  });

  it("uses the venue's subscript notation below a dollar", () => {
    expect(formatAxisValue(0.000123)).toContain("₃");
    expect(formatAxisValue(0.42)).toBe("0.42");
  });

  it("renders a true minus, and zero without decoration", () => {
    expect(formatAxisValue(-2_400_000, 1)).toBe("−2.4M");
    expect(formatAxisValue(0)).toBe("0");
  });

  it("degrades rather than printing NaN", () => {
    expect(formatAxisValue(Number.NaN)).toBe("—");
    expect(formatAxisValue(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("trims a trailing zero from a compaction", () => {
    expect(formatAxisValue(2_000_000, 1)).toBe("2M");
  });
});

describe("axisDecimals", () => {
  it("asks for more places as the span narrows against the value", () => {
    // Half a billion across a billion: ticks land 0.05B apart, so two places.
    expect(axisDecimals(5e8, 1e9)).toBe(2);
    expect(axisDecimals(275_000, 1e9)).toBeGreaterThan(3); // the measured case
  });

  it("is 1 for a flat or unusable span — nothing needs distinguishing", () => {
    expect(axisDecimals(0, 1e9)).toBe(1);
    expect(axisDecimals(-5, 1e9)).toBe(1);
    expect(axisDecimals(Number.NaN, 1e9)).toBe(1);
  });

  it("is bounded, so a pathological span cannot produce a wall of digits", () => {
    expect(axisDecimals(1e-12, 1e9)).toBeLessThanOrEqual(6);
  });
});

describe("formatAxisValue — one unit for the whole axis", () => {
  /*
   * The bug the rendered chart showed: an axis straddling 1e9 printed `1B` for
   * one tick and `1000M` for the tick directly below it. Two units in one
   * column reads as two different quantities.
   */
  it("does not switch units across a power of a thousand", () => {
    const ticks = [1_000_050_000, 1_000_000_000, 999_975_000, 999_800_000];
    const magnitude = 1_000_050_000;
    // The precision the chart would actually choose for this range.
    const dp = axisDecimals(ticks[0]! - ticks[ticks.length - 1]!, magnitude);
    const labels = ticks.map((v) => formatAxisValue(v, dp, magnitude));
    expect(labels.every((l) => l.endsWith("B"))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    // And the column lines up -- same width for every tick.
    expect(new Set(labels.map((l) => l.length)).size).toBe(1);
  });

  it("still picks a sensible unit on its own when none is given", () => {
    expect(formatAxisValue(2_400_000)).toBe("2.4M");
  });

  it("uses the axis unit even for a tick far below it", () => {
    // A tick near zero on a billion-scale axis stays in the axis's unit rather
    // than jumping to plain digits.
    expect(formatAxisValue(1_000, 3, 1e9)).toBe("0.000B");
  });
});
