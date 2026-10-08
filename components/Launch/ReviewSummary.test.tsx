// @vitest-environment jsdom
/**
 * The review screen is the last thing between a creator and a permanent
 * deploy, so the things pinned here are the ones that would let it lie
 * quietly: a legend that disagrees with the ring it sits next to, a fifth
 * figure silently pushed out of a four-up strip, and an over-allocated draft
 * that renders as a perfect circle.
 *
 * `allocation.test.ts` covers the arithmetic. This covers that the component
 * renders the arithmetic it was handed rather than a second opinion.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { allocate } from "@/lib/launch/allocation";
import { ReviewSummary } from "./ReviewSummary";

afterEach(cleanup);

const BASE = {
  title: "Review & confirm",
  lede: "Check every figure before deploying.",
  symbol: "NOVA",
  name: "Nova Protocol",
};

describe("ReviewSummary", () => {
  it("names the coin the way the rest of the app does", () => {
    render(<ReviewSummary {...BASE} tiles={[]} />);
    expect(screen.getByText(/Nova Protocol/)).toBeTruthy();
    expect(screen.getByText("($NOVA)")).toBeTruthy();
  });

  it("renders a tile per figure", () => {
    render(
      <ReviewSummary
        {...BASE}
        tiles={[
          { label: "Total supply", value: "1.0B" },
          { label: "For sale", value: "90.00%" },
        ]}
      />,
    );
    expect(screen.getByText("Total supply")).toBeTruthy();
    expect(screen.getByText("1.0B")).toBeTruthy();
    expect(screen.getByText("90.00%")).toBeTruthy();
  });

  // Four is the shape of the strip. A fifth figure must not be dropped without
  // anyone noticing, so the cap is asserted rather than left to the grid.
  it("takes four tiles and no more", () => {
    render(
      <ReviewSummary
        {...BASE}
        tiles={[
          { label: "One", value: "1" },
          { label: "Two", value: "2" },
          { label: "Three", value: "3" },
          { label: "Four", value: "4" },
          { label: "Five", value: "5" },
        ]}
      />,
    );
    expect(screen.getByText("Four")).toBeTruthy();
    expect(screen.queryByText("Five")).toBeNull();
  });

  it("gives every drawn slice a legend row carrying its own percentage", () => {
    const allocation = allocate(
      [
        { label: "Doppler Market", value: 90 },
        { label: "Creator", value: 10 },
      ],
      100,
    );
    const { container } = render(<ReviewSummary {...BASE} tiles={[]} allocation={allocation} />);

    const legend = screen.getByRole("list");
    expect(within(legend).getByText("Doppler Market")).toBeTruthy();
    expect(within(legend).getByText("90.00%")).toBeTruthy();
    expect(within(legend).getByText("Creator")).toBeTruthy();
    expect(within(legend).getByText("10.00%")).toBeTruthy();

    // One stroked arc per slice, plus the track circle underneath them.
    expect(container.querySelectorAll("svg circle")).toHaveLength(3);
  });

  it("shows the unspoken-for remainder as a slice rather than inflating the rest", () => {
    const allocation = allocate([{ label: "Presale", value: 10 }], 100);
    render(<ReviewSummary {...BASE} tiles={[]} allocation={allocation} />);
    expect(screen.getByText("Unallocated")).toBeTruthy();
    expect(screen.getByText("10.00%")).toBeTruthy();
    expect(screen.getByText("90.00%")).toBeTruthy();
  });

  // The auction flow already refuses to continue past this; the review is
  // where the creator finds out WHY, so it has to be said in words.
  it("says so when the split promises more coins than exist", () => {
    const allocation = allocate(
      [
        { label: "Presale", value: 80 },
        { label: "Treasury", value: 40 },
      ],
      100,
    );
    render(<ReviewSummary {...BASE} tiles={[]} allocation={allocation} />);
    expect(screen.getByText(/more coins than the supply holds/)).toBeTruthy();
  });

  it("omits the allocation panel entirely when there is no split to draw", () => {
    render(<ReviewSummary {...BASE} tiles={[]} allocation={null} />);
    expect(screen.queryByText("Token allocation")).toBeNull();
  });

  it("renders the flow's own warning and actions beneath it", () => {
    render(
      <ReviewSummary {...BASE} tiles={[]}>
        <p>This cannot be undone.</p>
      </ReviewSummary>,
    );
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });
});
