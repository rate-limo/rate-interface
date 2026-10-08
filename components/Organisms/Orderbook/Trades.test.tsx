// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The listener, not the markup.
 *
 * This panel subscribed to the app-wide `eventBus` in the component BODY behind a
 * `useRef` guard and never unsubscribed. `eventBus` is a module-level
 * `eventemitter3`, so each mount left a handler behind that kept that mount's
 * `setAnimatingTxHash` — and through it an unmounted tree — reachable for the life
 * of the tab.
 *
 * A ref guard cannot fix that: the thing needing undoing is the subscription, not
 * the subscribing.
 *
 * Multichain is what made it bite rather than merely leak. Every chain's socket
 * publishes onto this one bus and switching chains remounts this panel, so after k
 * switches one trade invoked k handlers, each setting state on a dead tree and
 * each starting its own timer.
 */

vi.mock("motion/react", () => ({
  motion: { div: (props: any) => <div {...props} /> },
}));

const pair = {
  base: { symbol: "ETH" },
  quote: { symbol: "USDC" },
};

const recentTrades = [
  {
    txHash: "0xaaa",
    orderId: 1,
    timestamp: 1_700_000_000,
    price: 1635,
    baseAmount: 1,
    quoteAmount: 1635,
    isBid: true,
  },
];

vi.mock("@/contexts/TradePageProvider", () => ({
  useTradePageContext: () => ({ pair, recentTrades }),
}));

import Trades from "./Trades";
import { eventBus } from "@/utils/events";

const TOPIC = "spot-trade-update";

afterEach(() => {
  vi.useRealTimers();
  eventBus.removeAllListeners();
});

describe("Trades", () => {
  it("removes its listener on unmount", () => {
    const before = eventBus.listenerCount(TOPIC);

    const view = render(<Trades />);
    expect(eventBus.listenerCount(TOPIC)).toBe(before + 1);

    view.unmount();
    expect(eventBus.listenerCount(TOPIC)).toBe(before);
  });

  it("does not accumulate one listener per mount", () => {
    // Ten navigations or chain switches. The old shape left ten handlers behind,
    // so each trade did ten times the work and retained ten dead trees.
    for (let i = 0; i < 10; i++) render(<Trades />).unmount();

    expect(eventBus.listenerCount(TOPIC)).toBe(0);
  });

  it("cancels a pending flash timer when it unmounts mid-flash", () => {
    vi.useFakeTimers();
    const view = render(<Trades />);

    eventBus.emit(TOPIC, { txHash: "0xaaa" } as never);

    /*
     * A trade landing just before a navigation left a timer that fired 100ms
     * later and set state on a component that no longer existed. React 18 does
     * not warn about that any more, which is why this watches the cancellation
     * rather than expecting a throw — a test that passes either way proves
     * nothing.
     */
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    view.unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("restarts one timer instead of stacking one per fill", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const view = render(<Trades />);
    // A sweep is a burst: MatchingLib emits one OrderMatched per resting order
    // consumed, so several of these arrive inside one transaction.
    for (const txHash of ["0xa", "0xb", "0xc"]) {
      eventBus.emit(TOPIC, { txHash } as never);
    }

    // Three fills, three timers scheduled, and the two earlier ones cancelled —
    // previously the first to fire cleared the tint the later one had just set.
    expect(setSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    view.unmount();
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});

describe("tradeTimeLabel", async () => {
  const { tradeTimeLabel } = await import("./Trades");
  const now = new Date(2026, 9, 4, 15, 0, 0);
  const secs = (d: Date) => Math.floor(d.getTime() / 1000);

  it("shows only the time for a trade from today", () => {
    expect(tradeTimeLabel(secs(new Date(2026, 9, 4, 14, 49, 2)), now)).toBe("14:49:02");
  });

  it("adds the date for a trade from another day", () => {
    expect(tradeTimeLabel(secs(new Date(2026, 9, 2, 2, 4, 0)), now)).toBe("Oct 2 02:04");
  });
});
