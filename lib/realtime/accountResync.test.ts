// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onReturnFromAway, resyncAccountQueries } from "./accountResync";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("onReturnFromAway", () => {
  afterEach(() => setVisibility("visible"));

  it("fires when a hidden tab becomes visible again, and when the browser comes back online", () => {
    const onReturn = vi.fn();
    const stop = onReturnFromAway(onReturn);

    setVisibility("visible");
    expect(onReturn).not.toHaveBeenCalled();

    setVisibility("hidden");
    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(onReturn).toHaveBeenCalledTimes(2);

    stop();
    setVisibility("hidden");
    setVisibility("visible");
    window.dispatchEvent(new Event("online"));
    expect(onReturn).toHaveBeenCalledTimes(2);
  });
});

describe("resyncAccountQueries", () => {
  it("refetches this account's open orders, order history and trade history, and nothing else", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    const reads: string[] = [];
    const observe = (key: unknown[]) =>
      client.fetchQuery({ queryKey: key, queryFn: async () => (reads.push(JSON.stringify(key)), []) });
    const mine = (root: string) => [root, "RISE Testnet", "0xme", 10, 1];
    await Promise.all([
      observe(mine("orders")),
      observe(mine("orderhistories")),
      observe(mine("tradehistory")),
      observe(["orders", "RISE Testnet", "0xsomeoneelse", 10, 1]),
    ]);
    reads.length = 0;

    resyncAccountQueries(client, "RISE Testnet", "0xme");

    for (const root of ["orders", "orderhistories", "tradehistory"]) {
      expect(client.getQueryState(mine(root))?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(["orders", "RISE Testnet", "0xsomeoneelse", 10, 1])?.isInvalidated).toBe(false);
  });
});
