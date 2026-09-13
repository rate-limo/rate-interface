import { describe, expect, it } from "vitest";
import { currentEpoch, toRewardRows, toRewardSummary, type PublicPoints } from "./rewards";

const points = (over: Partial<PublicPoints> = {}): PublicPoints => ({
  totalPoints: 0,
  bySource: {},
  byEpoch: [],
  refereeCount: 0,
  attestedRefereeCount: 0,
  ...over,
});

describe("toRewardRows", () => {
  it("never marks a row Claimable — there is no claim path in this stack", () => {
    // The panel renders a Claim BUTTON for that status, so it would be a
    // control that cannot do anything.
    const rows = toRewardRows(points({ bySource: { trading: 10, referral: 2 } }));
    expect(rows.every((r) => r.status === "Accruing")).toBe(true);
  });

  it("orders by points earned, largest first", () => {
    const rows = toRewardRows(points({ bySource: { referral: 2, trading: 10, liquidity: 5 } }));
    expect(rows.map((r) => r.earnedPts)).toEqual([10, 5, 2]);
  });

  it("labels known sources and passes unknown ones through", () => {
    const rows = toRewardRows(points({ bySource: { trading: 3, somethingNew: 1 } }));
    expect(rows.map((r) => r.source)).toEqual(["Trading", "somethingNew"]);
  });

  it("drops zero rows rather than listing a source that earned nothing", () => {
    const rows = toRewardRows(points({ bySource: { trading: 10, liquidity: 0 } }));
    expect(rows).toHaveLength(1);
  });

  it("reports network as null — these totals are cross-chain", () => {
    const rows = toRewardRows(points({ bySource: { trading: 1 } }));
    expect(rows[0].network).toBeNull();
  });
});

describe("toRewardSummary", () => {
  it("claimable is 0 because claiming does not exist, not because it is unknown", () => {
    const s = toRewardSummary(points({ totalPoints: 42, byEpoch: [{ epoch: 5, points: 7 }] }));
    expect(s.claimablePts).toBe(0);
    expect(s.earnedPts).toBe(42);
  });

  it("takes this epoch's points from the epoch the data describes", () => {
    const s = toRewardSummary(
      points({ totalPoints: 30, byEpoch: [{ epoch: 9, points: 4 }, { epoch: 8, points: 26 }] }),
    );
    expect(s.epoch).toBe(9);
    expect(s.epochPts).toBe(4);
  });

  it("is all zeros for a wallet with no points", () => {
    expect(toRewardSummary(points())).toEqual({
      earnedPts: 0,
      claimablePts: 0,
      epochPts: 0,
      epoch: 0,
    });
  });
});

describe("currentEpoch", () => {
  it("is the newest epoch WITH points, not the calendar epoch", () => {
    // A wallet that has not traded this week would otherwise show
    // "This epoch · 31 — 0 pts" against rows labelled with an epoch it never
    // earned in; the heading and the table must describe the same thing.
    expect(currentEpoch(points({ byEpoch: [{ epoch: 4, points: 1 }, { epoch: 2, points: 9 }] }))).toBe(4);
    expect(currentEpoch(points())).toBe(0);
  });
});
