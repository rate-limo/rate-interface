import { describe, expect, it } from "vitest";
import { BARS_PER_PAGE, latestWindow, olderWindow, prependBars, resolutionInfo, retentionFloor } from "./historyWindow";

const NOW = 1_790_640_000;
const DAY = 86_400;

describe("latestWindow", () => {
  // NOW is a whole day, so it is the start of a bar at every resolution below a week.
  const page = (seconds: number) => ({ from: NOW - (BARS_PER_PAGE - 1) * seconds, to: NOW + seconds - 1 });

  it("asks the 1h tab for one page of minutes, not the whole retained week", () => {
    const w = latestWindow("1", NOW);
    expect(w).toEqual(page(60));
    // The old request was from=0: ~10,081 one-minute bars. This is 300, the forming one included.
    expect((w.to + 1 - w.from) / 60).toBe(BARS_PER_PAGE);
  });

  it("scales the page with the resolution", () => {
    expect(latestWindow("15", NOW)).toEqual(page(900));
    expect(latestWindow("60", NOW)).toEqual(page(3600));
    expect(latestWindow("240", NOW)).toEqual(page(4 * 3600));
    expect(latestWindow("D", NOW)).toEqual(page(DAY));
  });

  it("clips a page that would reach past what the broker keeps", () => {
    // 300 × 12h = 150 days is past hour retention (90 days).
    expect(latestWindow("720", NOW).from).toBe(NOW - 90 * DAY);
  });

  it("does not clip week and month series, which are kept forever", () => {
    expect(retentionFloor("W", NOW)).toBe(0);
    expect(retentionFloor("M", NOW)).toBe(0);
    const w = latestWindow("W", NOW);
    expect(w.to + 1 - w.from).toBe(300 * 7 * DAY);
  });

  it("gives every open within one bar the same window, so they share one URL", () => {
    expect(latestWindow("15", NOW + 1)).toEqual(latestWindow("15", NOW + 899));
    expect(latestWindow("15", NOW + 900)).not.toEqual(latestWindow("15", NOW + 899));
  });

  it("ends on the forming bar's last second, never on the next bar's start", () => {
    // The gateway's range is inclusive and it gap-fills to `to`: ending at
    // NOW + 900 would draw a candle for a bar that has not started.
    const w = latestWindow("15", NOW + 300);
    expect(w.to).toBe(NOW + 899);
    expect(w.to).toBeGreaterThanOrEqual(NOW + 300);
  });
});

describe("olderWindow", () => {
  it("returns the page that ends one second before the oldest loaded bar", () => {
    const oldest = NOW - 300 * 60;
    expect(olderWindow("1", oldest, NOW)).toEqual({ from: oldest - 300 * 60, to: oldest - 1 });
  });

  it("stops at the retention horizon instead of paging into pruned history", () => {
    const floor = NOW - 7 * DAY;
    expect(olderWindow("1", floor + 120, NOW)).toEqual({ from: floor, to: floor + 119 });
    expect(olderWindow("1", floor, NOW)).toBeNull();
    expect(olderWindow("1", floor - 60, NOW)).toBeNull();
  });

  it("keeps paging a forever-kept series", () => {
    expect(olderWindow("W", 1_000_000_000, NOW)).not.toBeNull();
  });
});

describe("prependBars", () => {
  it("puts the older page first and drops bars the chart already holds", () => {
    const current = [{ time: 300, v: "live" }, { time: 360, v: "live" }];
    const older = [{ time: 180, v: "old" }, { time: 240, v: "old" }, { time: 300, v: "stale" }];
    expect(prependBars(older, current)).toEqual([
      { time: 180, v: "old" },
      { time: 240, v: "old" },
      { time: 300, v: "live" },
      { time: 360, v: "live" },
    ]);
  });

  it("returns the older page as-is when nothing is loaded yet", () => {
    expect(prependBars([{ time: 1 }], [])).toEqual([{ time: 1 }]);
  });
});

describe("resolutionInfo", () => {
  it("maps UDF resolutions to bar width and stored series", () => {
    expect(resolutionInfo("1")).toEqual({ seconds: 60, series: "minute" });
    expect(resolutionInfo("30")).toEqual({ seconds: 1800, series: "minute" });
    expect(resolutionInfo("60")).toEqual({ seconds: 3600, series: "hour" });
    expect(resolutionInfo("D")).toEqual({ seconds: DAY, series: "day" });
    expect(resolutionInfo("1W")).toEqual({ seconds: 7 * DAY, series: "week" });
  });
});
