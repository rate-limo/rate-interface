// @vitest-environment jsdom
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

const fetchHistory = vi.fn(async () => ({ orderHistories: [], totalCount: 0, totalPages: 0 }));
vi.mock("@/queries/server/orderhistories", () => ({
  getSpotAccountOrderHistories: () => fetchHistory(),
}));

import { useOrderHistory } from "./useOrderHistory";
import { eventBus } from "@/utils/events";
import { expandOrderCloseSummary, type SpotDeleteOrderItemEvent } from "@/types";
import { summarizeOrderCloses, type SpotOrderCloseSummaryEvent } from "@iter/types";

const ACCOUNT = "0x4f7dd259153149e5809823dbC0b25893a7C5f17e";

function placed(orderId: number, pair = "0xpair") {
  return {
    eventId: "spotOrderHistory",
    orderId,
    isBid: false,
    base: "0xbase",
    baseSymbol: "KPRF",
    quote: "0xquote",
    quoteSymbol: "tUSD",
    pairSymbol: "KPRF/tUSD",
    pair,
    price: 0.000005,
    asset: "0xbase",
    assetSymbol: "KPRF",
    assetDecimals: 18,
    amount: 400_000,
    timestamp: 1,
    account: ACCOUNT,
    txHash: `0xplace${orderId}`,
    updatedAt: orderId,
  } as never;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOrderHistory("RISE Testnet", ACCOUNT, 10, 1), { wrapper });
}

describe("useOrderHistory — live rows", () => {
  // Unmount: a hook left mounted keeps its eventBus listeners for the next test.
  afterEach(() => cleanup());
  it("a new account's first orders appear (the frame reaches the query, and is not popped)", async () => {
    const { result } = setup();
    await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
    await waitFor(() => expect(result.current.data).toEqual([]));

    act(() => {
      eventBus.emit("spot-order-history-update", placed(1));
      eventBus.emit("spot-order-history-update", placed(2));
    });
    await waitFor(() => expect(result.current.data?.map((o) => o.orderId)).toEqual([2, 1]));
  });

  it("the same id on another pair is a different order", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toEqual([]));
    act(() => {
      eventBus.emit("spot-order-history-update", placed(1, "0xpairA"));
      eventBus.emit("spot-order-history-update", placed(1, "0xpairB"));
    });
    await waitFor(() => expect(result.current.data?.map((o) => o.pair)).toEqual(["0xpairB", "0xpairA"]));
  });

  it("a fill closure refetches, so the row gains the fills only REST carries", async () => {
    setup();
    await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
    const before = fetchHistory.mock.calls.length;
    act(() => {
      eventBus.emit("spot-order-history-delete", {
        eventId: "deleteSpotOrderHistory",
        isBid: false,
        pair: "0xpair",
        account: ACCOUNT,
        orderId: 1,
        txHash: "0xsweep",
        timestamp: 2,
        status: "filled",
        updatedAt: 3,
      } as never);
    });
    await waitFor(() => expect(fetchHistory.mock.calls.length).toBeGreaterThan(before));
  });

  it("a closure envelope, expanded as the provider does, raises ONE toast under the per-order id", async () => {
    setup();
    await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
    toastSuccess.mockReset();
    const closure = (orderId: number): SpotDeleteOrderItemEvent => ({
      eventId: "deleteSpotOrderHistory",
      isBid: false,
      pair: "0xpair",
      account: ACCOUNT,
      orderId,
      txHash: "0xsweep",
      timestamp: 2,
      status: "filled",
      updatedAt: 3 + orderId,
    });
    const summary = summarizeOrderCloses([closure(1), closure(2)]) as SpotOrderCloseSummaryEvent;
    act(() => {
      for (const e of expandOrderCloseSummary(summary)) eventBus.emit("spot-order-history-delete", e);
    });
    const ids = new Set(toastSuccess.mock.calls.map((c) => (c[1] as { id: string }).id));
    expect(ids.size).toBe(1);
    // ...the same id the per-order frames of this transaction would raise.
    toastSuccess.mockReset();
    act(() => {
      eventBus.emit("spot-order-history-delete", { ...closure(3), txHash: "0xsweep" });
    });
    expect(new Set(toastSuccess.mock.calls.map((c) => (c[1] as { id: string }).id))).toEqual(ids);
  });
});
