// @vitest-environment jsdom
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

const MAKER = "0x4f7dd259153149e5809823dbC0b25893a7C5f17e";
const PAIR = "0xe61584A8705bD0bABcfe58bC76a458d1F6B572b9";

function restingOrder(orderId: number, price: number) {
  return {
    isBid: false,
    orderId,
    base: { id: "0xbase" },
    quote: { id: "0xquote", decimals: 6 },
    asset: { id: "0xbase", decimals: 18 },
    baseSymbol: "KPRF",
    quoteSymbol: "tUSD",
    pairSymbol: "KPRF/tUSD",
    baseLogoURI: "",
    quoteLogoURI: "",
    pair: PAIR,
    price,
    assetSymbol: "KPRF",
    amount: 10,
    placed: 10,
    timestamp: 1,
    account: MAKER,
    txHash: "0xplace",
  };
}

vi.mock("@/queries/server/orders", () => ({
  getSpotAccountOrders: vi.fn(async () => ({
    orders: [restingOrder(1, 0.000005), restingOrder(2, 0.00000501), restingOrder(3, 0.000006)],
    totalCount: 3,
    totalPages: 1,
  })),
}));

import { useOrders } from "./useOrders";
import { eventBus } from "@/utils/events";
import { type SpotOrderMatchedEvent } from "@/types";

function matched(over: Partial<SpotOrderMatchedEvent>): SpotOrderMatchedEvent {
  return {
    eventId: "spotOrderMatched",
    isBid: false,
    orderId: 1,
    base: "0xbase",
    baseSymbol: "KPRF",
    baseLogoURI: "",
    quote: "0xquote",
    quoteSymbol: "tUSD",
    quoteLogoURI: "",
    pairSymbol: "KPRF/tUSD",
    pair: PAIR,
    price: 0.000005,
    asset: "0xbase",
    assetSymbol: "KPRF",
    assetDecimals: 18,
    amount: 10,
    placed: 6,
    amountBN: null,
    placedBN: null,
    matched: 4,
    timestamp: 2,
    account: MAKER,
    txHash: "0xbatch",
    updatedAt: 100,
    ...over,
  };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOrders("RISE Testnet", MAKER, 10, 1), { wrapper });
}

function setupWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useOrders("RISE Testnet", MAKER, 10, 1), { wrapper }) };
}

const placedOf = (data: { orderId: number; placed: number }[] | undefined) =>
  Object.fromEntries((data ?? []).map((o) => [o.orderId, o.placed]));

describe("useOrders — a maker's fills", () => {
  // Unmount: a hook left mounted keeps its eventBus listeners for the next test.
  afterEach(() => cleanup());
  beforeEach(() => toastSuccess.mockReset());

  it("partial fills of two orders in one transaction update both rows under ONE toast id", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data?.length).toBe(3));
    act(() => {
      eventBus.emit("spot-order-matched", matched({ orderId: 1, placed: 6, matched: 4, txHash: "0xbatch", updatedAt: 101 }));
      eventBus.emit("spot-order-matched", matched({ orderId: 2, price: 0.00000501, placed: 7, matched: 3, txHash: "0xbatch", updatedAt: 102 }));
    });
    await waitFor(() => expect(placedOf(result.current.data)).toEqual({ 1: 6, 2: 7, 3: 10 }));
    const ids = new Set(toastSuccess.mock.calls.map((c) => (c[1] as { id: string }).id));
    expect(ids).toEqual(new Set([`fill-0xbatch:${PAIR}:buy`]));
  });

  it("removes an order a match CLEARED, which arrives only as a history closure", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data?.length).toBe(3));

    act(() => {
      eventBus.emit("spot-order-history-delete", {
        eventId: "deleteSpotOrderHistory",
        isBid: false,
        pair: PAIR,
        account: MAKER,
        orderId: 1,
        txHash: "0xsweep",
        timestamp: 3,
        status: "filled",
        updatedAt: 300,
      } as never);
    });
    await waitFor(() => expect(result.current.data?.map((o) => o.orderId)).toEqual([2, 3]));

    // The same order id on the OTHER side is a different order and stays.
    act(() => {
      eventBus.emit("spot-order-delete", {
        eventId: "deleteSpotOrder",
        isBid: true,
        pair: PAIR,
        account: MAKER,
        orderId: 2,
        txHash: "0xcancel",
        timestamp: 4,
        status: "canceled",
        updatedAt: 400,
      } as never);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.data?.map((o) => o.orderId)).toEqual([2, 3]);
  });
});

describe("useOrders — rows that must not stick or vanish", () => {
  afterEach(() => cleanup());
  beforeEach(() => toastSuccess.mockReset());

  it("a new order on ANOTHER pair with the same id is added, not written over this pair's row", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data?.length).toBe(3));
    const OTHER = "0x6f87A796820d0eBBDc3fE62BF671738D225Af3d2";

    act(() => {
      eventBus.emit("spot-order-update", {
        ...restingOrder(1, 0.00000497),
        eventId: "spotOrder",
        pair: OTHER,
        isBid: true,
        base: "0xother",
        quote: "0xquote",
        asset: "0xquote",
        assetDecimals: 6,
        pairSymbol: "TITER/USDC",
        updatedAt: 500,
      } as never);
    });

    await waitFor(() => expect(result.current.data?.length).toBe(4));
    const keys = (result.current.data ?? []).map((o) => `${o.pair}:${o.isBid}:${o.orderId}`);
    expect(keys).toContain(`${PAIR}:false:1`);
    expect(keys).toContain(`${OTHER}:true:1`);
  });

  it("a read in flight when a fill closes an order does not bring the order back", async () => {
    const { getSpotAccountOrders } = await import("@/queries/server/orders");
    const fetcher = vi.mocked(getSpotAccountOrders);
    const page = (ids: number[]) =>
      ({ orders: ids.map((id) => restingOrder(id, 0.000005)), totalCount: ids.length, totalPages: 1 }) as never;

    const { result, client } = setupWithClient();
    await waitFor(() => expect(result.current.data?.length).toBe(3));

    // A read whose answer predates the closure, and that resolves AFTER the
    // refetch applyFrame starts once the frame is applied.
    let releaseStale!: () => void;
    fetcher.mockImplementationOnce(
      () => new Promise((resolve) => { releaseStale = () => resolve(page([1, 2, 3])); }),
    );
    fetcher.mockImplementationOnce(async () => page([2, 3]));
    void client.refetchQueries({ queryKey: ["orders"] });
    await waitFor(() => expect(releaseStale).toBeTypeOf("function"));

    act(() => {
      eventBus.emit("spot-order-history-delete", {
        eventId: "deleteSpotOrderHistory",
        isBid: false,
        pair: PAIR,
        account: MAKER,
        orderId: 1,
        txHash: "0xsweep",
        timestamp: 3,
        status: "filled",
        updatedAt: 300,
      } as never);
    });
    await waitFor(() => expect(result.current.data?.map((o) => o.orderId)).toEqual([2, 3]));

    await act(async () => {
      releaseStale();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(client.getQueryData<{ orderId: number }[]>(["orders", "RISE Testnet", MAKER, 10, 1])?.map((o) => o.orderId)).toEqual([2, 3]);
    expect(result.current.data?.map((o) => o.orderId)).toEqual([2, 3]);
    // ...nor its counts: the pager would offer a row that is not there.
    expect(result.current.totalCount).toBe(2);
  });
});
