import { describe, expect, it } from "vitest";
import { timeframeToInterval, type ChartTimeframeLabel } from "./chartInterval";

describe("timeframeToInterval", () => {
  const cases: [ChartTimeframeLabel, string][] = [
    ["1h", "1"],
    ["24h", "15"],
    ["1W", "60"],
    ["1M", "D"],
    ["1Y", "W"],
    ["3Y", "M"],
  ];

  it.each(cases)("maps %s to the %s resolution", (label, interval) => {
    expect(timeframeToInterval(label)).toBe(interval);
  });
});
