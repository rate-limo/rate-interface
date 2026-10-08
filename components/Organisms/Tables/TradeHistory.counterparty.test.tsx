// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const ME = "0x1111111111111111111111111111111111111111";
const NAMED = "0xAaAa000000000000000000000000000000000001";
const PLAIN = "0xbBbB000000000000000000000000000000000002";
const THIRD = "0xcCcC000000000000000000000000000000000003";
const POOL = "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99";

const getIdentities = vi.fn(async (_network: string, addresses: string[]) => ({
  identities: addresses.map((a) => ({
    address: a,
    name: a === NAMED.toLowerCase() ? "NobleRapidFalcon9663" : null,
    avatarUrl: null,
  })),
}));
vi.mock("@/queries/server/profile", () => ({ getIdentities: (n: string, a: string[]) => getIdentities(n, a) }));
vi.mock("@/contexts/MarketPageProvider", () => ({
  useMarketPageContext: () => ({ displayNetworkName: "RISE Testnet", address: ME }),
}));

const base = {
  eventId: "spotTrade",
  base: "0xbase",
  quote: "0xquote",
  baseSymbol: "KPRF",
  quoteSymbol: "tUSD",
  pair: "0xpair",
  pairSymbol: "KPRF/tUSD",
  isBid: true,
  price: 1,
  amount: 1,
  baseAmount: 1,
  quoteAmount: 1,
  baseFee: 0,
  quoteFee: 0,
  timestamp: 1_790_000_000,
  account: ME,
  taker: ME,
  updatedAt: 1,
};
const rows = [
  // Took from one named trader.
  { ...base, txHash: "0x01", orderId: 3, makerOrderId: 3, maker: NAMED, fills: 1, counterparties: [NAMED], counterpartyCount: 1, poolAddress: null },
  // Was the MAKER: the counterparty is whoever took, never the viewer.
  { ...base, txHash: "0x02", orderId: 4, makerOrderId: 4, taker: PLAIN, maker: ME, fills: 1, counterparties: [PLAIN], counterpartyCount: 1, poolAddress: null },
  // Filled by the pool alone.
  { ...base, txHash: "0x03", orderId: 0, makerOrderId: null, maker: POOL, fills: 2, counterparties: [], counterpartyCount: 0, poolAddress: POOL },
  // A sweep: the pool plus two traders.
  { ...base, txHash: "0x04", orderId: 5, makerOrderId: 5, maker: NAMED, fills: 4, counterparties: [NAMED, THIRD], counterpartyCount: 2, poolAddress: POOL },
  // A live row from before the fields existed, with nothing to go on.
  { ...base, txHash: "0x05", orderId: 6, makerOrderId: 6, maker: NAMED, fills: 3 },
];
vi.mock("@/contexts/OrderPageProvider", () => ({
  useOrderPageContext: () => ({
    tradeHistories: rows,
    tradeHistoriesTotalPages: 1,
    tradeHistoriesPage: 1,
    setTradeHistoriesPage: () => {},
    isTradeHistoriesLoading: false,
  }),
}));

import { TradeHistory } from "./TradeHistory";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TradeHistory />
    </QueryClientProvider>,
  );
}

const rowOf = (i: number) => screen.getAllByTestId("fill-row")[i]!;

describe("Trade History's Counterparty column", () => {
  afterEach(() => {
    cleanup();
    getIdentities.mockClear();
  });

  it("asks /api/identities ONCE for every wallet on the page, the toggled lists included", async () => {
    mount();
    await waitFor(() => expect(getIdentities).toHaveBeenCalledTimes(1));
    expect(getIdentities.mock.calls[0]![1]).toEqual([NAMED, PLAIN, THIRD].map((a) => a.toLowerCase()).sort());
  });

  it("renders the address at once and swaps in the name when it arrives", async () => {
    mount();
    const first = within(rowOf(0)).getByTestId("counterparty-wallet");
    expect(first.textContent).toBe("0xAaAa…0001");
    await waitFor(() => expect(within(rowOf(0)).getByTestId("counterparty-wallet").textContent).toBe("NobleRapidFalcon9663"));
    const link = within(rowOf(0)).getByTestId("counterparty-wallet");
    expect(link.getAttribute("href")).toMatch(new RegExp(`/address/${NAMED}$`));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("title")).toContain(NAMED);
  });

  it("an unnamed wallet stays a short mono address, linked, full address in the title", async () => {
    mount();
    await waitFor(() => expect(getIdentities).toHaveBeenCalled());
    const plain = within(rowOf(1)).getByTestId("counterparty-wallet");
    expect(plain.textContent).toBe("0xbBbB…0002");
    expect(plain.className).toContain("font-mono");
    expect(plain.getAttribute("title")).toBe(PLAIN);
    expect(plain.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("the pool is Pool, linked to the pool contract", () => {
    mount();
    const pool = within(rowOf(2)).getByTestId("counterparty");
    expect(pool.textContent).toBe("Pool");
    expect(pool.getAttribute("href")).toMatch(new RegExp(`/address/${POOL}$`));
  });

  it("a sweep reads 'Pool + 2 traders' and opens to list each", async () => {
    mount();
    const toggle = within(rowOf(3)).getByTestId("counterparty");
    expect(toggle.textContent).toContain("Pool + 2 traders");
    expect(within(rowOf(3)).queryByTestId("counterparty-list")).toBeNull();
    fireEvent.click(toggle);
    const list = within(rowOf(3)).getByTestId("counterparty-list");
    await waitFor(() => expect(within(list).getAllByTestId("counterparty-wallet")[0]!.textContent).toBe("NobleRapidFalcon9663"));
    expect(within(list).getAllByTestId("counterparty-wallet").map((a) => a.getAttribute("title"))).toEqual([
      `NobleRapidFalcon9663 · ${NAMED}`,
      THIRD,
    ]);
    expect(within(list).getByText("Pool").getAttribute("href")).toMatch(new RegExp(`/address/${POOL}$`));
  });

  it("a multi-fill row with no set never names min(maker): it shows a dash", () => {
    mount();
    expect(within(rowOf(4)).queryByTestId("counterparty-wallet")).toBeNull();
    expect(within(rowOf(4)).queryByTestId("counterparty")).toBeNull();
    expect(within(rowOf(4)).getAllByText("—").length).toBeGreaterThan(0);
  });
});
