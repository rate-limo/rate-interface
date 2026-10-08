// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchControls } from "./LaunchControls";
import type { QuoteOptionRow } from "@/hooks/useQuoteOptions";

function quote(symbol: string, address: string): QuoteOptionRow {
  return {
    address: address as `0x${string}`,
    symbol,
    decimals: 6,
    enabled: true,
    startingMarketCap: BigInt(0),
    minDevBuy: BigInt(0),
    graduationMarketCap: BigInt(0),
    startingTakerFee: 0,
  };
}

// This repo has no global testing-library cleanup, so without this each render
// stacks on the last and every query finds two of everything.
afterEach(cleanup);

const USDC = quote("USDC", "0x3600000000000000000000000000000000000000");
const WETH = quote("WETH", "0x4200000000000000000000000000000000000006");

function setup(props: Partial<Parameters<typeof LaunchControls>[0]> = {}) {
  const onTab = vi.fn();
  const onSort = vi.fn();
  const onQuote = vi.fn();
  const onView = vi.fn();
  render(
    <LaunchControls
      tab="all"
      onTab={onTab}
      sort="marketcap"
      onSort={onSort}
      quote={null}
      onQuote={onQuote}
      view="grid"
      onView={onView}
      quotes={[]}
      {...props}
    />,
  );
  return { onTab, onSort, onQuote, onView };
}

describe("the quote row", () => {
  it("does not render on a venue with ONE quote", () => {
    // "All pairs · USDC" is a filter with a single option — a control that
    // cannot change what the reader sees. On Arc this is today's case.
    setup({ quotes: [USDC] });
    expect(screen.queryByRole("group", { name: "Quote" })).toBeNull();
  });

  it("renders once there is a choice to make", () => {
    setup({ quotes: [USDC, WETH] });
    expect(screen.getByRole("group", { name: "Quote" })).toBeTruthy();
    expect(screen.getByTestId("launch-quote-USDC")).toBeTruthy();
    expect(screen.getByTestId("launch-quote-WETH")).toBeTruthy();
  });

  it("reports the address, not the symbol — the gateway filters on the pair", () => {
    const { onQuote } = setup({ quotes: [USDC, WETH] });
    fireEvent.click(screen.getByTestId("launch-quote-WETH"));
    expect(onQuote).toHaveBeenCalledWith(WETH.address);
  });

  it("offers a way back to every pair", () => {
    const { onQuote } = setup({ quotes: [USDC, WETH], quote: USDC.address });
    fireEvent.click(screen.getByTestId("launch-quote-All pairs"));
    expect(onQuote).toHaveBeenCalledWith(null);
  });
});

describe("the sort control", () => {
  it("names the current sort on the button, so the order is readable without opening it", () => {
    setup({ sort: "last-trade" });
    expect(screen.getByTestId("launch-sort").textContent).toContain("Last trade");
  });

  it("stays closed until asked", () => {
    setup();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens, reports the selection and closes on choosing", () => {
    const { onSort } = setup();
    fireEvent.click(screen.getByTestId("launch-sort"));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.click(screen.getByTestId("launch-sort-last-trade"));
    expect(onSort).toHaveBeenCalledWith("last-trade");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape rather than stranding itself open", () => {
    setup();
    fireEvent.click(screen.getByTestId("launch-sort"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the selected option for assistive tech, not only with a tick", () => {
    setup({ sort: "newest" });
    fireEvent.click(screen.getByTestId("launch-sort"));
    expect(screen.getByTestId("launch-sort-newest").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("launch-sort-price").getAttribute("aria-selected")).toBe("false");
  });
});

describe("the tabs and the view toggle", () => {
  it("reports the tab it was asked for", () => {
    const { onTab } = setup();
    fireEvent.click(screen.getByTestId("launch-tab-graduated"));
    expect(onTab).toHaveBeenCalledWith("graduated");
  });

  it("offers the three statuses as separate tabs", () => {
    const { onTab } = setup();
    for (const tab of ["ladder", "graduated", "listed"] as const) {
      fireEvent.click(screen.getByTestId(`launch-tab-${tab}`));
      expect(onTab).toHaveBeenCalledWith(tab);
    }
    expect(screen.getByTestId("launch-tab-ladder").textContent).toBe("On the ladder");
  });

  it("marks the active tab as selected", () => {
    setup({ tab: "graduated" });
    expect(screen.getByTestId("launch-tab-graduated").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("launch-tab-all").getAttribute("aria-selected")).toBe("false");
  });

  it("gives the icon-only layout buttons real names", () => {
    // They carry no text, so without a label they are two unnamed buttons.
    setup();
    expect(screen.getByRole("button", { name: "List" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
  });

  it("reports the layout it was asked for", () => {
    const { onView } = setup();
    fireEvent.click(screen.getByTestId("launch-view-list"));
    expect(onView).toHaveBeenCalledWith("list");
  });
});
