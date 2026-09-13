"use client";

import type { SpotTradeEvent } from "@/types";

const MAX_TRADES = 50;
const FLUSH_MS = 250;

/**
 * Bounded recent-trades buffer outside React. New trades prepend; the list
 * never exceeds MAX_TRADES, and renders happen at most once per FLUSH_MS.
 */
export class TradesStore {
  private trades: SpotTradeEvent[] = [];
  private dirty = false;
  private listeners = new Set<() => void>();
  private snapshot: SpotTradeEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  seed(trades: SpotTradeEvent[]): void {
    this.trades = trades.slice(0, MAX_TRADES);
    this.dirty = true;
    this.flush();
  }

  add(trade: SpotTradeEvent): void {
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.length = MAX_TRADES;
    this.dirty = true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(() => this.flush(), FLUSH_MS);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): SpotTradeEvent[] => this.snapshot;

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.snapshot = [...this.trades];
    for (const listener of this.listeners) listener();
  }
}
