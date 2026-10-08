// @vitest-environment jsdom
/**
 * The depth chart has to notice liquidity moving.
 *
 * `useSwapDepth` fetched once per (pair, step) and then never again, so the
 * chart drew whatever the pool held when the card mounted and kept drawing it.
 * Deposit or withdraw from that very pool and the bars did not move — not late,
 * never. The hook's own rule that TYPING must not refetch is right, and had been
 * applied to the whole effect, so the one event that genuinely changes the depth
 * could not reach it either.
 *
 * Nothing caught that: `lib/swap/depth.test.ts` composes a chart from fixture
 * ranges and `api/liquidityDepthRemoval.db.test.ts` proves the ROUTE reports
 * less after a withdrawal. Both are about a fetch's answer. This is about
 * whether a second fetch happens at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useSwapDepth } from "./useSwapDepth";
import { eventBus } from "@/utils/events";
import type { SwapToken } from "@/lib/swap/types";

const PAY = { address: "0x0000000000000000000000000000000000000aaa", symbol: "AAA" } as SwapToken;
const GET = { address: "0x0000000000000000000000000000000000000bbb", symbol: "BBB" } as SwapToken;

/** Count only the depth read; the same effect also fetches the order book. */
function depthCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes("/liquidity/depth/")).length;
}

function activity(kind: string) {
  eventBus.emit("spot-account-activity", {
    eventId: "spotAccountActivity",
    kind,
    account: "0x0000000000000000000000000000000000000001",
    ref: "0x0000000000000000000000000000000000000002",
    txHash: "0xabc",
    timestamp: 1,
    updatedAt: 1,
    // biome-ignore lint/suspicious/noExplicitAny: the bus is typed to the full event
  } as any);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ exists: true, price: 100, pairSymbol: "AAA/BBB", inverted: false, ranges: [] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  // EXPLICIT, because this project does not set vitest `globals`, so
  // @testing-library/react never registers its automatic cleanup. Without it a
  // hook from an earlier test stays mounted with its bus listener attached, and
  // one emitted frame fetches once per surviving instance — which reads as the
  // listener not being removed rather than as the previous test never ending.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSwapDepth", () => {
  it("reads the pool once on mount", async () => {
    renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));
  });

  it("re-reads when a withdrawal lands, because the pool now holds less", async () => {
    // THE REGRESSION. Before the fix this stayed at 1 forever: the chart kept
    // drawing liquidity the user had just taken out.
    renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));

    activity("bandLiquidityRemoved");
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(2));
  });

  it("re-reads on a deposit too — the bars grow as well as shrink", async () => {
    renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));

    activity("bandLiquidityAdded");
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(2));
  });

  it("counts each movement, so two withdrawals are two reads", async () => {
    // A boolean flag would coalesce these: already true, no second fetch, and
    // the chart settles one withdrawal behind.
    renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));

    activity("bandLiquidityRemoved");
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(2));
    activity("bandLiquidityRemoved");
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(3));
  });

  it("ignores activity that does not move the pool", async () => {
    // The same frame carries launches and presale commitments. Refetching the
    // depth chart on those would put a request behind events that cannot change
    // a single bar.
    renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));

    activity("launch");
    activity("presaleCommit");
    await new Promise((r) => setTimeout(r, 30));
    expect(depthCalls(fetchMock)).toBe(1);
  });

  it("stops listening once unmounted", async () => {
    // The card unmounts on every route change, and a listener left behind would
    // fetch for a pair nobody is looking at — and set state on a dead hook.
    const { unmount } = renderHook(() => useSwapDepth("Arc Testnet", PAY, GET, "0.01", "base"));
    await waitFor(() => expect(depthCalls(fetchMock)).toBe(1));

    unmount();
    activity("bandLiquidityRemoved");
    await new Promise((r) => setTimeout(r, 30));
    expect(depthCalls(fetchMock)).toBe(1);
  });
});
