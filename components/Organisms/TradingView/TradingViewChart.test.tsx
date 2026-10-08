// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One question: after a chain switch, is this chart talking to the chain it says
 * it is showing?
 *
 * It was not. The websocket setup sat behind an `initializedRef` that the cleanup
 * never reset, so on the second run of the creation effect the guard was already
 * true and `initializeSocket` was skipped. The REST half was rebuilt regardless,
 * because `getDatafeed` is called unconditionally a few lines below. The result
 * was price history from the chain the user switched TO and live prices from the
 * chain they switched FROM, with nothing on screen distinguishing them.
 *
 * These tests cover this component's half: that it asks for the new chain's
 * socket at all, and that both URLs it hands the datafeed name the same chain.
 *
 * Note what that does NOT prove, because it is easy to over-claim here. The
 * ARGUMENTS were always consistent — `getWsUrl(networkName)` is evaluated fresh
 * on every run. The mismatch was one layer down: the datafeed ignored its
 * `streamingUrl` argument for streaming and used a module-level manager that only
 * `initializeSocket` ever wrote. So the pair assertion below is a guard against
 * that shape coming back, not a reproduction of it.
 *
 * `TradingViewChart.chain.test.tsx` is the one that reproduces it, by letting the
 * real datafeed run and asserting which gateway actually got subscribed.
 */

// Parameters are declared so `mock.calls` is typed and the assertions below need
// no casts — an `as string` on a possibly-undefined argument would hide exactly
// the "was it called at all" case these tests are about.
const initializeSocket = vi.fn((_url: string) => ({ subscribe: vi.fn() }));
const getDatafeed = vi.fn((_api: string, _ws: string, _socket?: unknown) => ({}));

vi.mock("../../../utils/datafeed", () => ({
  initializeSocket: (url: string) => initializeSocket(url),
  getDatafeed: (api: string, ws: string, socket: unknown) =>
    getDatafeed(api, ws, socket),
}));

/** Per-network URLs, the shape `consts`' PonderLinks / PonderWssLinks produce. */
const API: Record<string, string> = {
  "RISE Testnet": "https://gateway-api-rise.example",
  "Arc Testnet": "https://gateway-api-arc.example",
};
const WS: Record<string, string> = {
  "RISE Testnet": "wss://gateway-ws-rise.example/ws",
  "Arc Testnet": "wss://gateway-ws-arc.example/ws",
};

vi.mock("@/lib/realtime/ws-url", () => ({
  getApiUrl: (network: string) => API[network] ?? "",
  getWsUrl: (network: string) => WS[network] ?? "",
}));

const resolvedTheme = { current: "dark" };
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: resolvedTheme.current }),
}));

import TradingViewChart from "./TradingViewChart";

/** The slice of the charting library this component actually calls. */
const removed = vi.fn();
function installFakeLibrary() {
  const chart = { createStudy: vi.fn() };
  class FakeWidget {
    setSymbol = vi.fn((_s: string, _i: string, cb?: () => void) => cb?.());
    applyOverrides = vi.fn();
    activeChart = () => chart;
    remove = removed;
    constructor(options: { datafeed: unknown }) {
      void options;
      // Synchronous, so the component's onChartReady work runs inside render and
      // a test never has to wait for it.
      queueMicrotask(() => {});
    }
    onChartReady = (cb: () => void) => cb();
  }
  (window as unknown as { TradingView: unknown }).TradingView = { widget: FakeWidget };
}

/** Which (api, ws) pairs the component built a datafeed from, in order. */
function datafeedPairs() {
  return getDatafeed.mock.calls.map(([api, ws]) => [api, ws]);
}

/** Which chain each URL belongs to, or null when it belongs to none. */
function chainOf(url: string, table: Record<string, string>) {
  return Object.keys(table).find((name) => table[name] === url) ?? null;
}

beforeEach(() => {
  initializeSocket.mockClear();
  getDatafeed.mockClear();
  removed.mockClear();
  resolvedTheme.current = "dark";
  installFakeLibrary();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TradingViewChart", () => {
  it("builds its datafeed from the chain it was given", () => {
    render(<TradingViewChart networkName="RISE Testnet" symbol="ETH/USDC" interval="60" />);

    expect(initializeSocket).toHaveBeenCalledTimes(1);
    expect(initializeSocket).toHaveBeenCalledWith(WS["RISE Testnet"]);
    expect(datafeedPairs()).toEqual([[API["RISE Testnet"], WS["RISE Testnet"]]]);
  });

  it("re-points the websocket when the chain changes", () => {
    const view = render(
      <TradingViewChart networkName="RISE Testnet" symbol="ETH/USDC" interval="60" />,
    );

    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />,
    );

    /*
     * This is the assertion the bug failed. `initializedRef` was never reset in
     * the cleanup, so the second run skipped this call entirely and the module
     * kept the previous chain's socket.
     */
    expect(initializeSocket).toHaveBeenCalledTimes(2);
    expect(initializeSocket).toHaveBeenNthCalledWith(1, WS["RISE Testnet"]);
    expect(initializeSocket).toHaveBeenNthCalledWith(2, WS["Arc Testnet"]);
  });

  it("never mixes one chain's REST base with another chain's websocket", () => {
    const view = render(
      <TradingViewChart networkName="RISE Testnet" symbol="ETH/USDC" interval="60" />,
    );
    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />,
    );
    view.rerender(
      <TradingViewChart networkName="RISE Testnet" symbol="ETH/USDC" interval="60" />,
    );

    /*
     * A guard, not a reproduction. Both arguments were already correct before the
     * fix; see the note at the top of this file. What this stops is a future edit
     * that computes one of them outside the effect, or caches one and not the
     * other — which would put history and live bars on different chains again,
     * this time for a reason a reader can see in the argument list.
     */
    const pairs = datafeedPairs();
    expect(pairs).toHaveLength(3);
    for (const [api, ws] of pairs) {
      expect(chainOf(api, API)).not.toBeNull();
      expect(chainOf(api, API)).toBe(chainOf(ws, WS));
    }
    expect(pairs.map(([api]) => chainOf(api, API))).toEqual([
      "RISE Testnet",
      "Arc Testnet",
      "RISE Testnet",
    ]);
  });

  it("tears the old widget down before building the new chain's", () => {
    const view = render(
      <TradingViewChart networkName="RISE Testnet" symbol="ETH/USDC" interval="60" />,
    );
    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />,
    );

    // Leaving the old widget mounted would leave its datafeed subscribed to the
    // old chain's bar topics with nothing on screen reading them.
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it("keeps the datafeed on one chain when only the theme changes", () => {
    const view = render(
      <TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />,
    );

    // `isDark` is in the same dependency list as `networkName`, deliberately —
    // the widget has to be rebuilt to re-theme. The rebuild must not change which
    // chain it reads.
    resolvedTheme.current = "light";
    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />,
    );

    expect(initializeSocket.mock.calls.flat()).toEqual([
      WS["Arc Testnet"],
      WS["Arc Testnet"],
    ]);
    expect(datafeedPairs()).toEqual([
      [API["Arc Testnet"], WS["Arc Testnet"]],
      [API["Arc Testnet"], WS["Arc Testnet"]],
    ]);
  });

  it("waits for the charting library instead of giving up on the first miss", () => {
    vi.useFakeTimers();
    (window as unknown as { TradingView?: unknown }).TradingView = undefined;

    render(<TradingViewChart networkName="Arc Testnet" symbol="ETH/USDC" interval="60" />);
    expect(getDatafeed).not.toHaveBeenCalled();

    // The library loads via `defer`, so this effect frequently runs before it is
    // there. Returning without retrying left an empty container and nothing in
    // the console explaining why.
    installFakeLibrary();
    vi.advanceTimersByTime(200);

    expect(datafeedPairs()).toEqual([[API["Arc Testnet"], WS["Arc Testnet"]]]);
  });
});
