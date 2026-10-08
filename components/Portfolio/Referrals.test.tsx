// @vitest-environment jsdom
/**
 * The Referrals tab, rendered.
 *
 * Live data has a referral COUNT and no referee rows: /points withholds who
 * the referees are. The tab used to fill that gap with the mock's four
 * friends, beside a live "0 referred" — invented wallets on the page that
 * shows somebody their own account.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Referrals } from "./Referrals";
import type { IndexerData, ReferralSummary } from "@/lib/portfolio/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summary = (over: Partial<ReferralSummary> = {}): ReferralSummary => ({
  code: "919D24",
  link: "http://localhost:3217/r/919D24",
  referred: 0,
  active: 0,
  earnedPts: 0,
  cutPct: 25,
  ...over,
});

const data = (s: ReferralSummary): IndexerData =>
  ({ referrals: { summary: s, rows: [] } }) as unknown as IndexerData;

describe("Referrals", () => {
  it("says no one has joined, and draws no friend rows, when nobody has", () => {
    render(<Referrals data={data(summary())} />);
    expect(screen.getByTestId("referrals-empty").textContent).toBe("No one has joined with your link yet.");
    expect(screen.queryByText(/0x9c/)).toBeNull();
  });

  it("states the count, and that the referees are not shown, when there are some", () => {
    render(<Referrals data={data(summary({ referred: 3 }))} />);
    expect(screen.getByTestId("referrals-empty").textContent).toContain("3 joined with your link");
  });

  it("copies the live link as it is, not with a second scheme", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<Referrals data={data(summary())} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3217/r/919D24"));
  });
});
