// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const ME = "0x1111111111111111111111111111111111111111";
const NAMED = "0xE933ec7c8f91018aAE2f6fac3835257d4c332d40";
const POOL = "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99";

const getIdentities = vi.fn(async (_n: string, addresses: string[]) => ({
  identities: addresses.map((a) => ({ address: a, name: a === NAMED.toLowerCase() ? "VelvetNobleWeasel" : null, avatarUrl: null })),
}));
vi.mock("@/queries/server/profile", () => ({ getIdentities: (n: string, a: string[]) => getIdentities(n, a) }));
vi.mock("@/contexts/MarketPageProvider", () => ({
  useMarketPageContext: () => ({ displayNetworkName: "RISE Testnet", address: ME }),
}));
vi.mock("@/components/Organisms/Tables/CancelOrderButton", () => ({ CancelOrderButton: () => null }));
vi.mock("./Holdings", () => ({ Holdings: () => null }));

const base = {
  eventId: "spotTrade", base: "0xbase", quote: "0xquote", baseSymbol: "KPRF", quoteSymbol: "tUSD", pair: "0xpair",
  pairSymbol: "KPRF/tUSD", isBid: true, price: 1, amount: 1, baseAmount: 1, quoteAmount: 1, baseFee: 0, quoteFee: 0,
  timestamp: 1_790_000_000, account: ME, taker: ME, updatedAt: 1,
};
const rows = [
  { ...base, txHash: "0x02", orderId: 5, makerOrderId: 5, maker: NAMED, fills: 2, counterparties: [NAMED], counterpartyCount: 1, poolAddress: POOL },
  { ...base, txHash: "0x01", orderId: 3, makerOrderId: 3, maker: NAMED, fills: 1, counterparties: [NAMED], counterpartyCount: 1, poolAddress: null },
];
vi.mock("@/contexts/OrderPageProvider", () => ({
  useOrderPageContext: () => ({
    orders: [], ordersTotalCount: 0, ordersTotalPages: 1, ordersPage: 1, setOrdersPage: () => {}, isOrdersLoading: false,
    orderHistories: [], orderHistoriesTotalPages: 1, orderHistoriesPage: 1, setOrderHistoriesPage: () => {}, isOrderHistoriesLoading: false,
    tradeHistories: rows, tradeHistoriesTotalPages: 1, tradeHistoriesPage: 1, setTradeHistoriesPage: () => {}, isTradeHistoriesLoading: false,
  }),
}));

import { PhoneAccount } from "./PhoneAccount";

describe("phone Fills cards: the counterparty", () => {
  afterEach(() => {
    cleanup();
    getIdentities.mockClear();
  });

  it("resolves names through the same batched lookup, in the single row AND the opened sweep", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PhoneAccount />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Fills" }));
    const cards = screen.getAllByTestId("fill-card");
    await waitFor(() => expect(within(cards[1]!).getByTestId("counterparty-wallet").textContent).toBe("VelvetNobleWeasel"));
    expect(getIdentities).toHaveBeenCalledTimes(1);
    fireEvent.click(within(cards[0]!).getByTestId("counterparty"));
    const list = within(cards[0]!).getByTestId("counterparty-list");
    expect(within(list).getByTestId("counterparty-wallet").textContent).toBe("VelvetNobleWeasel");
  });

  it("sizes and truncates a lone wallet inside the card header, so it cannot spill", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <PhoneAccount />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Fills" }));
    const lone = within(screen.getAllByTestId("fill-card")[1]!).getByTestId("counterparty-wallet");
    const slot = lone.closest("[data-testid='fill-card-counterparty']") as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.className).toMatch(/text-\[11px\]/);
    expect(slot.className).toContain("min-w-0");
    expect(lone.className).toContain("truncate");
    expect(lone.className).toMatch(/inline-block|block/);
  });
});
