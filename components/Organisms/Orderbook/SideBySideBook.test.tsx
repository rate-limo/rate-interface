// @vitest-environment jsdom
/**
 * The phone's side-by-side book: bids and asks share rows, a level flashes when
 * ITS size changes (and only that level), and a tap sets the limit price the
 * way the desktop ladder does.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupedOrder } from "@/types/tables";

const level = (price: string, base: number, acc: number, pct: number): GroupedOrder => ({
  price,
  baseLiquidity: base,
  quoteLiquidity: base * Number(price),
  percentage: pct,
  accumulatedBaseLiquidity: acc,
  accumulatedQuoteLiquidity: acc * Number(price),
  accumulatedPercentage: pct,
});

const ctx = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const setLimitPrice = vi.fn();
const account = vi.hoisted(() => ({ value: { address: undefined as string | undefined, orders: [] as unknown[] } }));
vi.mock("@/contexts/OrderPageProvider", () => ({
  useOrderPageContext: () => account.value,
  // useOwnBookLevels reads the provider through this since dddaaa66.
  useOptionalOrderPageContext: () => account.value,
}));

vi.mock("@/contexts/TradePageProvider", () => ({ useTradePageContext: () => ctx.value }));
vi.mock("@/contexts/MarketPageProvider", () => ({ useMarketPageContext: () => ({ displayNetworkName: "RISE Testnet" }) }));
vi.mock("@/hooks/usePairLiquidityRanges", () => ({
  usePairLiquidityRanges: () => ({ data: { poolExists: false, ranges: [], histogram: [] }, isError: false }),
}));

function book(bids: GroupedOrder[], asks: GroupedOrder[], step: string | number = 0.5) {
  ctx.value = {
    pair: { base: { id: "0xb", symbol: "ETH" }, quote: { id: "0xq", symbol: "USDC" }, scales: [0.5, 1] },
    orderbookComputed: { bids: { buckets: bids }, asks: { buckets: asks } },
    step,
    setStep: vi.fn(),
    setLimitPrice,
    isBid: true,
    setAmount: vi.fn(),
    setQuoteAmount: vi.fn(),
    setBaseAmount: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no matchMedia; the flash hook reads prefers-reduced-motion.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setLimitPrice.mockClear();
  account.value = { address: undefined, orders: [] };
});

const BIDS = [level("1999.5", 1, 1, 30), level("1999", 2, 3, 90)];
const ASKS = [level("2000", 1.5, 1.5, 45), level("2000.5", 1, 2.5, 75)];

describe("SideBySideBook", async () => {
  const { default: SideBySideBook } = await import("./SideBySideBook");

  it("puts the n-th best bid and the n-th best ask on the same row", () => {
    book(BIDS, ASKS);
    render(<SideBySideBook />);
    const rows = screen.getByTestId("side-by-side-book").querySelectorAll(":scope > div.grid");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('[data-side="bid"]')?.getAttribute("data-price")).toBe("1999.5");
    expect(rows[0].querySelector('[data-side="ask"]')?.getAttribute("data-price")).toBe("2000");
    expect(screen.getByText(/no pool/i)).toBeTruthy();
  });

  it("flashes exactly the level whose own size changed, then stops", () => {
    book(BIDS, ASKS);
    const { rerender } = render(<SideBySideBook />);
    // First paint flashes nothing.
    expect(document.querySelectorAll("[data-flash]")).toHaveLength(0);

    // The 2000.5 ask grows; nothing else moves.
    book(BIDS, [ASKS[0], level("2000.5", 4, 5.5, 100)]);
    rerender(<SideBySideBook />);
    const lit = [...document.querySelectorAll("[data-flash]")].map((n) => `${n.getAttribute("data-side")}:${n.getAttribute("data-price")}`);
    expect(lit).toEqual(["ask:2000.5"]);

    act(() => vi.advanceTimersByTime(400));
    expect(document.querySelectorAll("[data-flash]")).toHaveLength(0);
  });

  it("a tap on a level sets the limit price, as on desktop", () => {
    book(BIDS, ASKS);
    render(<SideBySideBook />);
    fireEvent.click(document.querySelector('[data-side="ask"][data-price="2000"]')!);
    expect(setLimitPrice).toHaveBeenCalledWith(2000);
  });

  it("prints millionth prices at the tick, each distinct", () => {
    // adjustDecimalLength(x, 6) printed 0.000003 as "0" and both 0.000005 and
    // 0.000009 as "0.00001".
    book(
      [level("0.000003", 66_600_000, 66_600_000, 100)],
      [level("0.000005", 10_000_000, 10_000_000, 40), level("0.000009", 15_000_000, 25_000_000, 100)],
      "0.000001",
    );
    render(<SideBySideBook />);
    const prices = [...document.querySelectorAll("[data-side]")].map((n) => n.getAttribute("aria-label"));
    expect(prices).toEqual([
      "Bid 0.000003, total 66.6M",
      "Ask 0.000005, total 10.0M",
      "Ask 0.000009, total 25.0M",
    ]);
  });

  it("marks only the levels holding the wallet's own orders, per side", () => {
    account.value = {
      address: "0xme",
      orders: [
        { isBid: true, price: 0.000003, placed: 200, assetSymbol: "USDC", base: "0xB", quote: "0xQ" },
        { isBid: false, price: 0.000009, placed: 15_000_000, assetSymbol: "ETH", base: "0xb", quote: "0xq" },
        // Another market: never marked.
        { isBid: false, price: 0.000005, placed: 1, assetSymbol: "X", base: "0xother", quote: "0xq" },
      ],
    };
    book(
      [level("0.000003", 1, 1, 100)],
      [level("0.000005", 1, 1, 50), level("0.000009", 1, 2, 100)],
      "0.000001",
    );
    render(<SideBySideBook />);
    const mine = [...document.querySelectorAll("[data-mine]")].map(
      (n) => `${n.getAttribute("data-side")}:${n.getAttribute("data-price")}`,
    );
    expect(mine).toEqual(["bid:0.000003", "ask:0.000009"]);
    expect(document.querySelector('[data-side="ask"][data-price="0.000009"]')?.getAttribute("title")).toBe(
      "Yours: 15.0M ETH",
    );
  });

  it("a long-press shows your size and does not move the ticket", () => {
    account.value = {
      address: "0xme",
      orders: [{ isBid: false, price: 2000, placed: 1.5, assetSymbol: "ETH", base: "0xb", quote: "0xq" }],
    };
    book(BIDS, ASKS);
    render(<SideBySideBook />);
    const ask = document.querySelector('[data-side="ask"][data-price="2000"]')!;
    fireEvent.pointerDown(ask);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("status").textContent).toBe("Yours: 1.5 ETH");
    fireEvent.pointerUp(ask);
    fireEvent.click(ask);
    expect(setLimitPrice).not.toHaveBeenCalled();
  });

  it("marks nothing with no wallet", () => {
    // Disconnected, `useOrders` answers [] for an undefined address.
    account.value = { address: undefined, orders: [] };
    book(BIDS, ASKS);
    render(<SideBySideBook />);
    expect(document.querySelectorAll("[data-mine]")).toHaveLength(0);
  });
});
