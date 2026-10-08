import { describe, expect, it } from "vitest";
import { EPOCHS_PER_SEASON, epochEndsAt, epochOf, epochStart, seasonOf, seasonEndsAt } from "./epoch";

/**
 * Epochs are one week, ending Monday 00:00 UTC. The status bar's Next Beat chip
 * counts to this.
 *
 * These cases predate `epoch.ts` and were written against the hand-rolled
 * "next Monday" implementation. They are kept VERBATIM against the
 * genesis-anchored one — every assertion still holds, which is the strongest
 * available evidence that the replacement changed no behaviour. The additional
 * cases below cover what the old implementation could not answer: the epoch
 * NUMBER.
 */
describe("epochEndsAt", () => {
  const iso = (d: Date) => d.toISOString();

  it("lands on the upcoming Monday at midnight UTC", () => {
    // Wed 2026-07-29 13:45 UTC -> Mon 2026-08-03
    expect(iso(epochEndsAt(new Date("2026-07-29T13:45:00Z")))).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  it("gives Sunday only a few hours, not a whole week", () => {
    expect(iso(epochEndsAt(new Date("2026-08-02T23:59:59Z")))).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  it("gives a full 7 days when the clock is exactly on a boundary", () => {
    // The degenerate case: midnight Monday must start a fresh epoch rather
    // than collapse to a zero-length one that instantly reads 00:00:00.
    expect(iso(epochEndsAt(new Date("2026-08-03T00:00:00Z")))).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("still returns the next Monday later on a Monday", () => {
    expect(iso(epochEndsAt(new Date("2026-08-03T09:30:00Z")))).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("crosses month and year boundaries", () => {
    // Thu 2026-12-31 -> Mon 2027-01-04
    expect(iso(epochEndsAt(new Date("2026-12-31T18:00:00Z")))).toBe(
      "2027-01-04T00:00:00.000Z",
    );
  });

  it("is always strictly in the future and at most one week out", () => {
    const start = Date.UTC(2026, 6, 1);
    for (let hour = 0; hour < 24 * 30; hour += 7) {
      const now = new Date(start + hour * 3_600_000);
      const ms = epochEndsAt(now).getTime() - now.getTime();
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(7 * 86_400_000);
    }
  });
});

describe("epochOf", () => {
  it("starts at 0 on the genesis Monday", () => {
    expect(epochOf(new Date(Date.UTC(2026, 0, 5)))).toBe(0);
    expect(new Date(Date.UTC(2026, 0, 5)).getUTCDay()).toBe(1); // Monday
  });

  it("advances one per week", () => {
    expect(epochOf(new Date(Date.UTC(2026, 0, 11, 23, 59, 59)))).toBe(0);
    expect(epochOf(new Date(Date.UTC(2026, 0, 12)))).toBe(1);
  });

  it("is 30 on 2026-08-08 — the number the UI was hardcoding as 9", () => {
    // The status bar named epoch 9 beside a correct countdown, because the
    // boundary was derived and the number was a constant.
    expect(epochOf(new Date(Date.UTC(2026, 7, 8)))).toBe(30);
  });
});

describe("seasonOf", () => {
  it("is 1-based and turns over every EPOCHS_PER_SEASON epochs", () => {
    expect(seasonOf(0)).toBe(1);
    expect(seasonOf(EPOCHS_PER_SEASON - 1)).toBe(1);
    expect(seasonOf(EPOCHS_PER_SEASON)).toBe(2);
    expect(seasonOf(30)).toBe(3);
  });
});

describe("seasonEndsAt", () => {
  it("ends season 4 at the start of epoch 48", () => {
    // 2026-09-28 is epoch 38, inside season 4 (epochs 36-47).
    expect(seasonEndsAt(new Date("2026-09-28T12:00:00Z")).toISOString()).toBe("2026-12-07T00:00:00.000Z");
  });

  it("rolls to the next season exactly on the boundary", () => {
    expect(seasonEndsAt(new Date("2026-12-07T00:00:00Z")).toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(seasonEndsAt(new Date("2026-12-06T23:59:59Z")).toISOString()).toBe("2026-12-07T00:00:00.000Z");
  });

  it("ends season 1 twelve weeks after genesis", () => {
    expect(seasonEndsAt(new Date("2026-01-05T00:00:00Z")).toISOString()).toBe("2026-03-30T00:00:00.000Z");
  });
});
