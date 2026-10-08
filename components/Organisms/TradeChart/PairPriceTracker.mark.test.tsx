// @vitest-environment jsdom
/**
 * The Pro terminal's header draws the PAIR, not one leg of it.
 *
 * This header is also the market SWITCHER, so a mark naming half of what the
 * label beside it names was at its least useful where it was most needed. It
 * also passed `color={""}` — so a token with no artwork fell back to an
 * untinted disc rather than `tokenColor`'s hue — and no `chainName`, which made
 * it the only market mark in the app with no network chip.
 *
 * The two contexts are mocked because they are pure data seams: which market,
 * which chain. Everything the component does with them runs for real.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpotPair } from "@/types";

const pair = {
  symbol: "TITER/USDC",
  price: 1.0210236,
  baseSymbol: "TITER",
  quoteSymbol: "USDC",
  base: { id: "0xbase", symbol: "TITER", logoURI: "https://cdn.example/titer.png", decimals: 18 },
  quote: { id: "0xquote", symbol: "USDC", logoURI: "https://cdn.example/usdc.png", decimals: 6 },
  dayPriceDifferencePercentage: 0.02,
  dayQuoteVolumeUSD: 1_000,
  dayHigh: 1.0212,
  dayLow: 1.0208,
} as unknown as SpotPair;

vi.mock("@/contexts/TradePageProvider", () => ({ useTradePageContext: () => ({ pair }) }));
vi.mock("@/contexts/MarketPageProvider", () => ({
  useMarketPageContext: () => ({ displayNetworkName: "Arc Testnet", displayNetworkSlug: "arc" }),
}));
// The switcher this header wraps pulls the whole market list in; the mark is
// what this file is about.
vi.mock("../SearchPopover", () => ({
  SearchPopover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The favorite star and the copy-link control read the watchlist and the
// clipboard; neither is what this file is about.
vi.mock("../StarButton", () => ({ StarButton: () => null }));
vi.mock("./CopyMarketLink", () => ({ CopyMarketLink: () => null }));

import PairPriceTracker from "./PairPriceTracker";

afterEach(cleanup);

describe("the terminal header's market mark", () => {
  it("names BOTH tokens, matching the label beside it", () => {
    render(<PairPriceTracker />);
    expect(screen.getByRole("img", { name: "TITER/USDC" })).toBeTruthy();
    expect(screen.getByText("TITER/USDC")).toBeTruthy();
  });

  it("draws both tokens' artwork", () => {
    const { container } = render(<PairPriceTracker />);
    const sources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources).toContain("https://cdn.example/titer.png");
    expect(sources).toContain("https://cdn.example/usdc.png");
  });

  it("carries the network chip it was the only market mark to lack", () => {
    render(<PairPriceTracker />);
    expect(screen.getByText("AT")).toBeTruthy();
  });
});
