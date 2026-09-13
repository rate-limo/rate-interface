import { describe, expect, it } from "vitest";
import { seriesDirection, sparkGeometry, type SeriesPoint } from "./sparkline";

const W = 100;
const H = 20;

function xs(points: string): number[] {
  return points
    .split(" ")
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[0]));
}

function ys(points: string): number[] {
  return points
    .split(" ")
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[1]));
}

describe("sparkGeometry", () => {
  it("positions by DAY INDEX, not by array position", () => {
    // The whole reason this exists. Two readings twenty days apart are adjacent
    // in the array; plotting by position would draw them one step apart and
    // turn three quiet weeks into a cliff.
    const sparse: SeriesPoint[] = [
      { index: 100, balanceUsd: 10 },
      { index: 120, balanceUsd: 20 },
    ];
    const g = sparkGeometry(sparse, 100, 130, W, H);
    const [x0, x1] = xs(g.points);
    expect(x0).toBe(0);
    // 20 days into a 30-day window ⇒ two thirds across, NOT the far edge.
    expect(x1).toBeCloseTo((20 / 30) * W, 1);
  });

  it("scales x across the REQUESTED window, not the data's own extent", () => {
    // Otherwise the same two readings fill the width at every timeframe, and
    // 1W and 1M look identical.
    const series: SeriesPoint[] = [
      { index: 10, balanceUsd: 1 },
      { index: 11, balanceUsd: 2 },
    ];
    const week = sparkGeometry(series, 5, 12, W, H);
    const month = sparkGeometry(series, 0, 30, W, H);
    expect(xs(week.points)[1]).toBeGreaterThan(xs(month.points)[1]!);
  });

  it("centres a flat series instead of dividing by zero", () => {
    // Equal values give a zero range; without the guard every y is NaN and the
    // polyline renders nothing at all.
    const flat: SeriesPoint[] = [
      { index: 1, balanceUsd: 500 },
      { index: 2, balanceUsd: 500 },
    ];
    const g = sparkGeometry(flat, 1, 2, W, H);
    expect(ys(g.points).every((y) => Number.isFinite(y))).toBe(true);
    expect(ys(g.points)).toEqual([H / 2, H / 2]);
  });

  it("puts the highest value nearest the top", () => {
    // SVG y grows downward, which is the easy sign error here.
    const g = sparkGeometry(
      [
        { index: 1, balanceUsd: 10 },
        { index: 2, balanceUsd: 90 },
      ],
      1,
      2,
      W,
      H,
    );
    const [low, high] = ys(g.points);
    expect(high).toBeLessThan(low!);
  });

  it("sorts before projecting, so out-of-order input still draws left to right", () => {
    const g = sparkGeometry(
      [
        { index: 9, balanceUsd: 2 },
        { index: 1, balanceUsd: 1 },
      ],
      1,
      9,
      W,
      H,
    );
    expect(xs(g.points)).toEqual([0, W]);
  });

  it("does not mutate its input", () => {
    const series: SeriesPoint[] = [
      { index: 9, balanceUsd: 2 },
      { index: 1, balanceUsd: 1 },
    ];
    sparkGeometry(series, 1, 9, W, H);
    expect(series.map((p) => p.index)).toEqual([9, 1]);
  });

  it("clamps a point that falls outside the window rather than losing it", () => {
    // A baseline reading from BEFORE the window is legitimate; an out-of-box
    // coordinate would silently vanish instead of sitting at the edge.
    const g = sparkGeometry(
      [
        { index: -50, balanceUsd: 1 },
        { index: 5, balanceUsd: 2 },
      ],
      0,
      10,
      W,
      H,
    );
    expect(xs(g.points)[0]).toBe(0);
  });

  it("closes the area to the baseline", () => {
    const g = sparkGeometry(
      [
        { index: 0, balanceUsd: 1 },
        { index: 10, balanceUsd: 2 },
      ],
      0,
      10,
      W,
      H,
    );
    expect(g.area.startsWith(`0.0,${H}`)).toBe(true);
    expect(g.area.endsWith(`${W}.0,${H}`)).toBe(true);
  });

  it("reports the last point so the endpoint can be marked", () => {
    const g = sparkGeometry(
      [
        { index: 0, balanceUsd: 1 },
        { index: 10, balanceUsd: 2 },
      ],
      0,
      10,
      W,
      H,
    );
    expect(g.last?.x).toBe(W);
  });

  it("returns empty geometry for an empty series", () => {
    expect(sparkGeometry([], 0, 10, W, H)).toEqual({ points: "", area: "", last: null });
  });
});

describe("seriesDirection", () => {
  it("is null with nothing to compare", () => {
    // Distinct from "flat" — one reading cannot express a direction, and
    // guessing one would colour a line that means nothing.
    expect(seriesDirection([])).toBeNull();
    expect(seriesDirection([{ index: 1, balanceUsd: 5 }])).toBeNull();
  });

  it("compares first to last in TIME order, not array order", () => {
    expect(
      seriesDirection([
        { index: 9, balanceUsd: 1 },
        { index: 1, balanceUsd: 5 },
      ]),
    ).toBe("down");
  });

  it("reads up, down and flat", () => {
    expect(seriesDirection([{ index: 1, balanceUsd: 1 }, { index: 2, balanceUsd: 2 }])).toBe("up");
    expect(seriesDirection([{ index: 1, balanceUsd: 2 }, { index: 2, balanceUsd: 1 }])).toBe("down");
    expect(seriesDirection([{ index: 1, balanceUsd: 2 }, { index: 2, balanceUsd: 2 }])).toBe("flat");
  });
});
