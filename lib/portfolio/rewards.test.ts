import { describe, expect, it } from "vitest";
import {
  currentEpoch,
  referralPointsOf,
  toRewardRows,
  toRewardSummary,
  type PublicPoints,
} from "./rewards";

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
      referralPts: 0,
    });
  });

  /*
   * The zero here is the point of the field. The rows table drops zero
   * sources, so before this existed a wallet earning nothing from referrals
   * had NOTHING on the Rewards tab naming referrals — indistinguishable from
   * the programme not existing. The summary states it either way.
   */
  it("reports referral points even when the wallet has earned none", () => {
    expect(toRewardSummary(points({ bySource: { trading: 10 } })).referralPts).toBe(0);
  });
});

describe("referralPointsOf", () => {
  /*
   * Both sides of the relationship, because both are the referral programme
   * paying out: `referral` is the referrer's share of the order-book fees their
   * referees paid, `bonus` is the referee's own bonus for having been referred
   * (both in apps/broker's point/earn.ts). Counting only the first tells a referred trader
   * they have earned nothing from referrals while the boost sits in their
   * total.
   */
  it("sums the referrer's cut and the referee's bonus", () => {
    expect(referralPointsOf(points({ bySource: { referral: 40, bonus: 2, trading: 900 } }))).toBe(42);
  });

  it("counts an affiliate invitee's rebate as referral earnings", () => {
    expect(referralPointsOf(points({ bySource: { referral: 40, rebate: 5, trading: 900 } }))).toBe(45);
  });

  it("counts either side alone", () => {
    expect(referralPointsOf(points({ bySource: { referral: 40 } }))).toBe(40);
    expect(referralPointsOf(points({ bySource: { bonus: 2 } }))).toBe(2);
  });

  it("ignores every other source", () => {
    expect(referralPointsOf(points({ bySource: { trading: 10, liquidity: 5, callout: 3 } }))).toBe(0);
  });

  /*
   * This runs on a fetched payload and feeds a portfolio tab, which must not be
   * able to throw over a shape it did not expect — the same rule
   * `toReferralSummary` follows one file over.
   */
  it("survives a payload missing bySource entirely", () => {
    expect(referralPointsOf({} as PublicPoints)).toBe(0);
    expect(referralPointsOf(points({ bySource: { referral: "40" as unknown as number } }))).toBe(0);
  });
});

describe("source labels", () => {
  /*
   * The cases must be `PointSource` in apps/broker/src/point/rules.ts. They
   * were not: `bonus` and `callout` had no case and rendered as raw lowercase
   * table cells, while `maker` had one for a source the broker never emits.
   */
  it("labels every source the accrual actually writes", () => {
    const rows = toRewardRows(
      points({ bySource: { trading: 6, liquidity: 5, referral: 4, bonus: 3, callout: 2, rebate: 1 } }),
    );
    expect(rows.map((r) => r.source)).toEqual([
      "Trading",
      "Liquidity",
      "Referral cut",
      "Referral bonus",
      "Callout cut",
      "Affiliate rebate",
    ]);
  });

  it("names the two referral sources after the side they pay", () => {
    // `referral` is the referrer's; `bonus` is the referee's. Labelling only
    // the first "Referral bonus" named it after the wrong side.
    expect(toRewardRows(points({ bySource: { referral: 1 } }))[0].source).toBe("Referral cut");
    expect(toRewardRows(points({ bySource: { bonus: 1 } }))[0].source).toBe("Referral bonus");
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
