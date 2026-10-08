// @vitest-environment jsdom
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));
vi.mock("@/queries/server", () => ({
  getSpotAccountTradeHistories: vi.fn(async () => ({ tradeHistories: [], totalCount: 0, totalPages: 0 })),
}));

import { liveCounterparties, useTradeHistory, type TradeHistoryRow } from "./useTradeHistory";
import { eventBus } from "@/utils/events";
import { eventToSpotFillSummaryStream, streamToEvent, type SpotFillSummaryEvent, type SpotTradeEvent } from "@/types";
import { makerOrderIdFromWire, summarizeFills } from "@iter/types";

const MAKER = "0x4f7dd259153149e5809823dbC0b25893a7C5f17e";
const TAKER = "0x7f1a6b4F7CA931c530c9479dD50673693b684873";

function fill(orderId: number, price: number): SpotTradeEvent {
  return {
    eventId: "spotTrade",
    orderId,
    makerOrderId: makerOrderIdFromWire(orderId),
    base: "0xbase",
    quote: "0xquote",
    baseSymbol: "KPRF",
    quoteSymbol: "tUSD",
    baseLogoURI: "",
    quoteLogoURI: "",
    pair: "0xpair",
    pairSymbol: "KPRF/tUSD",
    isBid: true,
    price,
    account: TAKER,
    asset: "0xquote",
    assetSymbol: "tUSD",
    amount: 2,
    valueUSD: 2,
    baseAmount: 400_000,
    quoteAmount: 2,
    baseFee: 400,
    quoteFee: 0,
    timestamp: 1,
    taker: TAKER,
    maker: MAKER,
    txHash: "0xsweep",
    updatedAt: 1,
  };
}

/** The envelope as it arrives: through the wire, as the provider hands it over. */
function envelope(): SpotFillSummaryEvent {
  const summary = summarizeFills([fill(9, 0.000005), fill(10, 0.00000501)]) as SpotFillSummaryEvent;
  return streamToEvent(JSON.parse(JSON.stringify(eventToSpotFillSummaryStream(summary)))) as SpotFillSummaryEvent;
}

function setup(viewer: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTradeHistory("RISE Testnet", viewer, 10, 1), { wrapper });
}

describe("useTradeHistory — a fill envelope, from either side", () => {
  // Unmount: a hook left mounted keeps its eventBus listeners for the next test.
  afterEach(() => cleanup());
  beforeEach(() => toastSuccess.mockReset());

  it("on the MAKER's side expands to one row per resting order, and raises no toast", async () => {
    const { result } = setup(MAKER);
    await waitFor(() => expect(result.current.data).toEqual([]));
    act(() => {
      eventBus.emit("spot-fill-summary", envelope());
    });
    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(result.current.data?.map((t) => [t.orderId, t.price]).sort()).toEqual([
      [10, 0.00000501],
      [9, 0.000005],
    ]);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("on the TAKER's side collapses to the one trade placed, with one toast sized in base", async () => {
    const { result } = setup(TAKER);
    await waitFor(() => expect(result.current.data).toEqual([]));
    act(() => {
      eventBus.emit("spot-fill-summary", envelope());
    });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(toastSuccess.mock.calls[0]![0]);
    expect(body).toContain("800,000");
  });

  it("the maker's per-fill frames give the same rows as the envelope", async () => {
    const { result } = setup(MAKER);
    await waitFor(() => expect(result.current.data).toEqual([]));
    act(() => {
      eventBus.emit("spot-trade-history-update", fill(9, 0.000005));
      eventBus.emit("spot-trade-history-update", fill(10, 0.00000501));
    });
    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("a live row names its counterparties", () => {
  afterEach(() => cleanup());
  const POOL = "0x86B68ceeE83D9B41C74fD7CA57f3D6ba5eaC2D99";
  const OTHER = "0x2222222222222222222222222222222222222222";

  it("the taker's collapsed row carries the makers it hit, not a dash", async () => {
    const { result } = setup(TAKER);
    await waitFor(() => expect(result.current.data).toEqual([]));
    act(() => {
      eventBus.emit("spot-fill-summary", envelope());
    });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    const row = result.current.data![0] as TradeHistoryRow;
    expect(row.counterparties).toEqual([MAKER]);
    expect(row.counterpartyCount).toBe(1);
    expect(row.poolAddress).toBeNull();
  });

  it("splits the pool out the way the gateway does: a fill with no resting order", () => {
    const pool = { ...fill(0, 0.000005), maker: POOL };
    const other = { ...fill(11, 0.000006), maker: OTHER };
    const summary = summarizeFills([fill(9, 0.000005), pool, other, fill(10, 0.00000501)]) as SpotFillSummaryEvent;
    expect(liveCounterparties(summary, TAKER)).toEqual({
      counterparties: [MAKER, OTHER],
      counterpartyCount: 2,
      poolAddress: POOL,
      origins: { pool: 1, maker: 3 },
    });
  });

  it("never lists the viewer as their own counterparty", () => {
    const self = { ...fill(9, 0.000005), maker: TAKER };
    const summary = summarizeFills([self]) as SpotFillSummaryEvent;
    expect(liveCounterparties(summary, TAKER).counterparties).toEqual([]);
  });
});
