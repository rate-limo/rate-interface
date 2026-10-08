import { describe, expect, it } from "vitest";
import { marksHorizon } from "./useThesisMarks";

describe("marksHorizon", () => {
  const HOUR = 3_600;
  const top = 1_790_661_600; // an exact hour

  it("stays the same for every second of an hour, so the marks query key does not churn", () => {
    const seen = new Set<number>();
    for (let s = 1; s <= HOUR; s += 1) seen.add(marksHorizon(top + s));
    expect(seen.size).toBe(1);
  });

  it("always reaches past now by at least a day", () => {
    for (const now of [top, top + 1, top + HOUR - 1]) {
      expect(marksHorizon(now)).toBeGreaterThanOrEqual(now + 24 * HOUR);
    }
  });

  it("moves forward when the hour turns", () => {
    expect(marksHorizon(top + HOUR + 1)).toBe(marksHorizon(top + 1) + HOUR);
  });
});
