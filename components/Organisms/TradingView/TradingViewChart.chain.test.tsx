// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The end-to-end version of the chain-switch bug: which gateway does the chart
 * actually SUBSCRIBE to after a switch?
 *
 * `TradingViewChart.test.tsx` mocks the datafeed away and checks the URLs this
 * component passes it. That is worth having and it could never have caught the
 * original bug, because those URLs were always right. The failure was that the
 * datafeed ignored the websocket URL it was handed and streamed from a
 * module-level manager which only `initializeSocket` ever assigned — and
 * `initializeSocket` was skipped on the second run by an `initializedRef` the
 * cleanup never reset.
 *
 * So here the real datafeed runs and only the socket layer is faked. The
 * assertion is the one a user would make: after switching to Arc, the bar
 * subscription is on Arc's gateway and not on the one they left.
 *
 * The fake widget calls `subscribeBars` from `onChartReady`, which is what the
 * charting library does once it has resolved a symbol. Without that the datafeed
 * never touches a socket and there is nothing to assert.
 */

/** One fake manager per gateway URL, recording the topics subscribed on it. */
const subscribedByUrl = new Map<string, string[]>();
const getSocketManager = vi.fn((url: string) => {
  if (!subscribedByUrl.has(url)) subscribedByUrl.set(url, []);
  return {
    subscribe: (topic: string) => {
      subscribedByUrl.get(url)!.push(topic);
      return () => {};
    },
  };
});

vi.mock("@/lib/realtime/socket-manager", () => ({
  getSocketManager: (url: string) => getSocketManager(url),
}));

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

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

import TradingViewChart from "./TradingViewChart";

const SYMBOL = "ETH/USDC";
/** What `subscribeOnStream` builds for ETH/USDC at the 60-minute resolution. */
const TOPIC = "spotBar:ETH/USDC-PairHour";

/**
 * A charting library that resolves a symbol and subscribes, like the real one.
 * `getBars` is deliberately NOT called: it needs fetch, and the live subscription
 * is the whole question here.
 */
function installFakeLibrary() {
  const chart = { createStudy: vi.fn() };
  class FakeWidget {
    private datafeed: any;
    constructor(options: { datafeed: any }) {
      this.datafeed = options.datafeed;
    }
    onChartReady = (cb: () => void) => {
      this.datafeed.subscribeBars(
        { ticker: SYMBOL },
        "60",
        () => {},
        "uid-1",
        () => {},
      );
      cb();
    };
    setSymbol = vi.fn((_s: string, _i: string, cb?: () => void) => cb?.());
    applyOverrides = vi.fn();
    activeChart = () => chart;
    remove = vi.fn(() => this.datafeed.unsubscribeBars("uid-1"));
  }
  (window as unknown as { TradingView: unknown }).TradingView = { widget: FakeWidget };
}

beforeEach(() => {
  subscribedByUrl.clear();
  getSocketManager.mockClear();
  installFakeLibrary();
});

describe("after a chain switch the chart streams from the new chain", () => {
  it("subscribes bars on the chain it switched to", () => {
    const view = render(
      <TradingViewChart networkName="RISE Testnet" symbol={SYMBOL} interval="60" />,
    );
    expect(subscribedByUrl.get(WS["RISE Testnet"])).toEqual([TOPIC]);

    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol={SYMBOL} interval="60" />,
    );

    /*
     * The bug, exactly: with the stale `initializedRef`, `initializeSocket` was
     * skipped, the datafeed's module-level manager still pointed at RISE, and the
     * topic string carries no chain — so the Arc chart either subscribed on RISE
     * or found the topic already subscribed and did nothing at all.
     */
    expect(subscribedByUrl.get(WS["Arc Testnet"])).toEqual([TOPIC]);

    /*
     * And the other half of the same statement, asserted here rather than in its
     * own test on purpose. Against HEAD the module-level maps leak between tests
     * in a file, so a separate test ran against dirty state and passed for a
     * reason that had nothing to do with the fix. One test, one fresh module
     * state, both claims.
     *
     * Measured against HEAD, this is the sequence:
     *
     *   getManager ws-RISE / subscribe TOPIC on ws-RISE     (mount)
     *   remove / unsub TOPIC on ws-RISE                     (switch)
     *   subscribe TOPIC on ws-RISE                          (the Arc chart)
     *
     * `ws-ARC` never appears. The Arc chart drew Arc history and then streamed
     * RISE's live prices into it.
     */
    expect(subscribedByUrl.get(WS["RISE Testnet"])).toEqual([TOPIC]);
  });

  it("asks for a manager per gateway, so the two chains cannot share one", () => {
    const view = render(
      <TradingViewChart networkName="RISE Testnet" symbol={SYMBOL} interval="60" />,
    );
    view.rerender(
      <TradingViewChart networkName="Arc Testnet" symbol={SYMBOL} interval="60" />,
    );

    const urls = new Set(getSocketManager.mock.calls.map(([url]) => url));
    expect(urls).toEqual(new Set([WS["RISE Testnet"], WS["Arc Testnet"]]));
  });
});
