// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A chart under `display: none` must not start.
 *
 * /trade/pro mounts this component three times — the desktop layout and the
 * mobile layout twice, one shown per breakpoint — and each copy used to start a
 * full TradingView widget: its own iframe, symbol resolve, history, live
 * subscription. On WebKit the three competing for the same start-up left the
 * VISIBLE chart blank on 2 of 8 iPad loads and 4 of 8 iPhone loads (measured,
 * Playwright WebKit). Starting only the one on screen took both to 0 of 8.
 *
 * jsdom has neither `checkVisibility` nor `ResizeObserver`, so both are faked:
 * the component's own fallback (start when `checkVisibility` is missing) is what
 * keeps TradingViewChart.test.tsx working unchanged.
 */

const getDatafeed = vi.fn((_api: string, _ws: string, _socket?: unknown) => ({}));
vi.mock("../../../utils/datafeed", () => ({
  initializeSocket: () => ({ subscribe: vi.fn() }),
  getDatafeed: (api: string, ws: string, socket: unknown) => getDatafeed(api, ws, socket),
}));
vi.mock("@/lib/realtime/ws-url", () => ({
  getApiUrl: () => "https://gateway-api-arc.example",
  getWsUrl: () => "wss://gateway-ws-arc.example/ws",
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

import TradingViewChart from "./TradingViewChart";

const widgets: unknown[] = [];
function installFakeLibrary() {
  class FakeWidget {
    setSymbol = vi.fn();
    applyOverrides = vi.fn();
    activeChart = () => ({ createStudy: vi.fn() });
    remove = vi.fn();
    onChartReady = (cb: () => void) => cb();
    constructor() {
      widgets.push(this);
    }
  }
  (window as unknown as { TradingView: unknown }).TradingView = { widget: FakeWidget };
}

let visible = true;
let observers: { cb: ResizeObserverCallback; disconnected: boolean }[] = [];

beforeEach(() => {
  widgets.length = 0;
  getDatafeed.mockClear();
  observers = [];
  visible = true;
  installFakeLibrary();
  (HTMLElement.prototype as unknown as { checkVisibility: () => boolean }).checkVisibility = () => visible;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    private entry: { cb: ResizeObserverCallback; disconnected: boolean };
    constructor(cb: ResizeObserverCallback) {
      this.entry = { cb, disconnected: false };
      observers.push(this.entry);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      this.entry.disconnected = true;
    }
  };
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as { checkVisibility?: unknown }).checkVisibility;
});

/** What a ResizeObserver reports when a breakpoint un-hides the container. */
function show(width = 820, height = 480) {
  visible = true;
  for (const o of observers) {
    if (o.disconnected) continue;
    o.cb([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);
  }
}

describe("TradingViewChart — only the chart on screen starts", () => {
  it("starts a visible chart straight away", () => {
    render(<TradingViewChart networkName="Arc Testnet" symbol="TITER/USDC@0xabc" interval="2" />);
    expect(widgets).toHaveLength(1);
    expect(getDatafeed).toHaveBeenCalledTimes(1);
  });

  it("does not start a hidden chart: no widget, no datafeed, no requests", () => {
    visible = false;
    render(<TradingViewChart networkName="Arc Testnet" symbol="TITER/USDC@0xabc" interval="2" />);
    expect(widgets).toHaveLength(0);
    expect(getDatafeed).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
  });

  it("starts it once, when a breakpoint shows it", () => {
    visible = false;
    render(<TradingViewChart networkName="Arc Testnet" symbol="TITER/USDC@0xabc" interval="2" />);
    act(() => show());
    expect(widgets).toHaveLength(1);
    expect(observers[0]!.disconnected).toBe(true);
    // A second resize does not start a second widget.
    act(() => show(390, 350));
    expect(widgets).toHaveLength(1);
  });

  it("ignores a resize that is still zero-sized", () => {
    visible = false;
    render(<TradingViewChart networkName="Arc Testnet" symbol="TITER/USDC@0xabc" interval="2" />);
    act(() => {
      for (const o of observers) o.cb([{ contentRect: { width: 0, height: 0 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(widgets).toHaveLength(0);
  });

  it("disconnects the observer when unmounted before it was ever shown", () => {
    visible = false;
    const { unmount } = render(<TradingViewChart networkName="Arc Testnet" symbol="TITER/USDC@0xabc" interval="2" />);
    unmount();
    expect(observers[0]!.disconnected).toBe(true);
  });
});
