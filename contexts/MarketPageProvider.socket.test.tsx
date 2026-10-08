// @vitest-environment jsdom
/**
 * The market-wide socket: every pair's trades and every token's price.
 *
 * It is a public feed, but it used to open only once a wallet connected, so a
 * visitor browsing without one saw the status bar read Offline and a tape that
 * never moved. And it dialled the chain of the FIRST render forever, so moving
 * the page to another chain kept streaming the old chain's trades.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PonderWssLinks } from "@/consts";
import { MarketPageProvider, useMarketPageContext } from "./MarketPageProvider";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false, chain: undefined, connector: undefined }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/useMultichainTokens", () => ({
  useMultichainTokens: () => ({ tokens: [], isLoading: false }),
}));
vi.mock("@/hooks/useMultichainPairs", () => ({
  useMultichainPairs: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/useTokenlistBalances", () => ({
  useTokenlistBalances: () => ({ data: [], holdings: [], accountValueUSD: 0, status: "success", error: null }),
}));
vi.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: () => ({ watchlist: [], isLoading: false, error: null }),
}));
vi.mock("@/hooks/useTrader", () => ({
  useTrader: () => ({ data: undefined, isLoading: false, error: null }),
}));

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(frame: string) {
    this.sent.push(frame);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
}

let ctx: ReturnType<typeof useMarketPageContext>;
const Probe = () => {
  ctx = useMarketPageContext();
  return null;
};

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketPageProvider market socket", () => {
  it("opens without a wallet and reports connected", () => {
    render(
      <MarketPageProvider networkSlugInput="arc-testnet">
        <Probe />
      </MarketPageProvider>,
    );
    expect(FakeSocket.all.map((s) => s.url)).toEqual([PonderWssLinks["Arc Testnet"]]);
    expect(ctx.marketWebSocketStatus).toBe("connecting");

    act(() => FakeSocket.all[0].open());
    expect(ctx.marketWebSocketStatus).toBe("connected");
    expect(FakeSocket.all[0].sent.map((f) => JSON.parse(f).method)).toEqual([
      "spot.trades.subscribe.pairs.all",
      "spot.trades.subscribe.tokens.all",
    ]);
  });

  it("follows the displayed chain, closing the old chain's socket", () => {
    render(
      <MarketPageProvider networkSlugInput="arc-testnet">
        <Probe />
      </MarketPageProvider>,
    );
    act(() => FakeSocket.all[0].open());

    act(() => ctx.setDisplayNetworkName("RISE Testnet"));
    expect(FakeSocket.all[0].closed).toBe(true);
    expect(FakeSocket.all.map((s) => s.url)).toEqual([
      PonderWssLinks["Arc Testnet"],
      PonderWssLinks["RISE Testnet"],
    ]);
  });

  it("switching mid-handshake still connects the new chain", () => {
    render(
      <MarketPageProvider networkSlugInput="arc-testnet">
        <Probe />
      </MarketPageProvider>,
    );
    // Arc's socket never opens before the switch.
    act(() => ctx.setDisplayNetworkName("RISE Testnet"));
    expect(FakeSocket.all.map((s) => s.url)).toEqual([
      PonderWssLinks["Arc Testnet"],
      PonderWssLinks["RISE Testnet"],
    ]);
    act(() => FakeSocket.all[1].open());
    expect(ctx.marketWebSocketStatus).toBe("connected");
  });
});
