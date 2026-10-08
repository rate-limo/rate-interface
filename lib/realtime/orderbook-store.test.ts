import { describe, expect, it } from "vitest";
import { OrderbookStore } from "./orderbook-store";
import type { SpotOrderBlockEvent } from "@/types";

const delta = (price: number, isBid: boolean, base = 1): SpotOrderBlockEvent =>
  ({ price, isBid, baseLiquidity: base, quoteLiquidity: base * price }) as SpotOrderBlockEvent;

/**
 * The maps are keyed by price and only shrink on an explicit empty delta, so a
 * level the market walked away from used to stay for the life of the tab. These
 * pin the bound, and that the bound costs the rendered book nothing.
 */
describe("OrderbookStore memory bound", () => {
  it("stops growing once a side passes the retention cap", () => {
    const store = new OrderbookStore("0.01", "X/USDC");
    const listeners: number[] = [];
    const off = store.subscribe(() => listeners.push(1));

    for (let i = 0; i < 2_000; i++) store.applyDelta(delta(1 + i * 0.01, false));
    store["flush"]();

    const asks = store["asks"] as Map<number, unknown>;
    expect(asks.size).toBeLessThanOrEqual(500);
    off();
  });

  it("keeps the levels NEAREST the touch, which are the ones rendered", () => {
    const store = new OrderbookStore("0.01", "X/USDC");
    for (let i = 0; i < 1_000; i++) store.applyDelta(delta(100 + i, false));
    store["flush"]();

    const asks = store["asks"] as Map<number, unknown>;
    // Asks walk upward, so the nearest are the lowest prices.
    expect(asks.has(100)).toBe(true);
    expect(asks.has(1_099)).toBe(false);

    const book = store.getSnapshot();
    expect(Number(book.asks.buckets[0]?.price)).toBe(100);
  });

  it("prunes bids from the other end, since nearest means highest", () => {
    const store = new OrderbookStore("0.01", "X/USDC");
    for (let i = 0; i < 1_000; i++) store.applyDelta(delta(100 + i, true));
    store["flush"]();

    const bids = store["bids"] as Map<number, unknown>;
    expect(bids.has(1_099)).toBe(true);
    expect(bids.has(100)).toBe(false);
  });

  it("leaves an ordinary book untouched", () => {
    const store = new OrderbookStore("0.01", "X/USDC");
    for (let i = 0; i < 40; i++) store.applyDelta(delta(10 + i, false));
    store["flush"]();
    expect((store["asks"] as Map<number, unknown>).size).toBe(40);
  });

  it("clears its flush timer when the last listener leaves", () => {
    const store = new OrderbookStore("0.01", "X/USDC");
    const off = store.subscribe(() => {});
    expect(store["timer"]).not.toBeNull();
    off();
    expect(store["timer"]).toBeNull();
  });
});
