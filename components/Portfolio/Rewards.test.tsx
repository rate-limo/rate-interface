// @vitest-environment jsdom
/**
 * The Rewards tab, rendered.
 *
 * What this file exists for: a wallet that has earned nothing from referrals
 * had NOTHING on this tab naming referrals. The ledger table drops zero rows by
 * design, so the programme was invisible until it had already paid — which
 * reads as "this venue has no referral programme", not "you have earned nothing
 * from it yet". Every assertion below is about a figure or a word somebody
 * reads to answer "what has referring friends earned me".
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rewards } from "./Rewards";
import type { IndexerData, ReferralSummary, RewardRow, RewardSummary } from "@/lib/portfolio/types";

afterEach(cleanup);

const summary = (over: Partial<RewardSummary> = {}): RewardSummary => ({
  earnedPts: 0,
  claimablePts: 0,
  epochPts: 0,
  epoch: 0,
  referralPts: 0,
  ...over,
});

const referrals = (over: Partial<ReferralSummary> = {}): ReferralSummary => ({
  code: "919D24",
  link: "https://iter.cx/r/919D24",
  referred: 0,
  active: 0,
  earnedPts: 0,
  cutPct: 0,
  ...over,
});

/** Only the two slices `Rewards` reads; the rest of `IndexerData` is untouched. */
const data = (rewards: { summary: RewardSummary; rows: RewardRow[] }, ref = referrals()) =>
  ({ rewards, referrals: { summary: ref, rows: [] } }) as unknown as IndexerData;

const row = (over: Partial<RewardRow> = {}): RewardRow => ({
  source: "Trading",
  network: null,
  earnedPts: 100,
  epoch: 4,
  status: "Accruing",
  ...over,
});

describe("the referral card", () => {
  it("states referral points for a wallet that has earned some", () => {
    render(render_data({ referralPts: 1500 }, { referred: 3, cutPct: 5 }));
    expect(screen.getAllByText("Referral · earned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,500 pts").length).toBeGreaterThan(0);
  });

  /*
   * The zero is the whole point. Before this card the tab said nothing about
   * referrals until the programme had already paid out.
   */
  it("states them as zero rather than omitting the card", () => {
    render(render_data({ referralPts: 0 }, { cutPct: 5 }));
    expect(screen.getAllByText("Referral · earned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 pts").length).toBeGreaterThan(0);
  });

  it("names the published terms, so a zero reads as 'nothing yet'", () => {
    render(render_data({ referralPts: 0 }, { referred: 2, cutPct: 5 }));
    expect(screen.getByText(/5% of referees' order-book fees, as points · 2 referred/)).toBeTruthy();
  });

  /*
   * Zeros, not the schema defaults — the rule `toReferralSummary` already
   * follows. A wallet shown "5%" it is not earning is worse than one shown
   * nothing while admin-service has published no config.
   */
  it("says nothing about terms when none were published", () => {
    render(render_data({ referralPts: 0 }, { cutPct: 0 }));
    expect(screen.queryByText(/of referees' order-book fees/)).toBeNull();
  });

  it("opens the Referrals tab when the page gave it somewhere to go", () => {
    const onOpenReferrals = vi.fn();
    render(
      <Rewards
        data={data({ summary: summary({ referralPts: 40 }), rows: [] }, referrals())}
        onOpenReferrals={onOpenReferrals}
      />,
    );
    fireEvent.click(screen.getAllByText("Referral · earned")[0]);
    expect(onOpenReferrals).toHaveBeenCalledTimes(1);
  });

  it("is not a button when it has nowhere to go", () => {
    // A control that does nothing is worse than a div.
    render(render_data({ referralPts: 40 }));
    const label = screen.getAllByText("Referral · earned")[0];
    expect(label.closest("button")).toBeNull();
  });
});

describe("the ledger table", () => {
  it("explains the emptiness instead of rendering bare column headings", () => {
    render(render_data({ referralPts: 0 }));
    expect(screen.getByText("No points yet")).toBeTruthy();
    // The headings belong to a table that has rows.
    expect(screen.queryByText("Source")).toBeNull();
  });

  it("still states the figures above the empty state", () => {
    render(render_data({ referralPts: 0, earnedPts: 0 }));
    expect(screen.getAllByText("Referral · earned").length).toBeGreaterThan(0);
  });

  it("shows the referral rows once they exist, beside the card", () => {
    render(
      <Rewards
        data={data(
          {
            summary: summary({ earnedPts: 142, referralPts: 42 }),
            rows: [
              row({ source: "Trading", earnedPts: 100 }),
              row({ source: "Referral cut", earnedPts: 40 }),
              row({ source: "Referral bonus", earnedPts: 2 }),
            ],
          },
          referrals({ cutPct: 5 }),
        )}
      />,
    );
    expect(screen.queryByText("No points yet")).toBeNull();
    expect(screen.getAllByText("Referral cut").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Referral bonus").length).toBeGreaterThan(0);
    // The card and the rows are derived from the same `bySource`, so they agree.
    expect(screen.getAllByText("42 pts").length).toBeGreaterThan(0);
  });
});

/** The desktop table and the mobile cards both render, hence `getAllByText`. */
function render_data(over: Partial<RewardSummary>, ref: Partial<ReferralSummary> = {}) {
  return <Rewards data={data({ summary: summary(over), rows: [] }, referrals(ref))} />;
}
