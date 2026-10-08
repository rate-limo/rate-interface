import { describe, expect, it, vi } from "vitest";
import { fetchPairEitherOrder } from "./useUngatedPair";

const market = (base: string, quote: string, price: number) => ({
  symbol: `${base}/${quote}`,
  base: { symbol: base },
  quote: { symbol: quote },
  price,
});

/** A gateway that knows exactly the markets it is given, 404 for the rest. */
function gateway(known: ReturnType<typeof market>[]) {
  return vi.fn(async (url: string) => {
    const hit = known.find((m) => url.includes(`/pair/symbol/${m.base.symbol}/${m.quote.symbol}?`));
    return hit
      ? new Response(JSON.stringify(hit), { status: 200 })
      : new Response(JSON.stringify({ error: "Token not found" }), { status: 404 });
  });
}

describe("fetchPairEitherOrder", () => {
  it("returns an unlisted market in the order it was asked for", async () => {
    const fetcher = gateway([market("NEW", "USDC", 1.01235)]);
    const pair = await fetchPairEitherOrder("Arc Testnet", "NEW", "USDC", fetcher);
    expect(pair?.symbol).toBe("NEW/USDC");
    expect(pair?.price).toBe(1.01235);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("finds the same market when the LP has flipped the order", async () => {
    // The gateway keys on (base, quote) and 404s the inverse. A flip is the same
    // market inverted, not a missing one — `resolveRate` inverts the price, so
    // this only has to hand back the row.
    const fetcher = gateway([market("NEW", "USDC", 2)]);
    const pair = await fetchPairEitherOrder("Arc Testnet", "USDC", "NEW", fetcher);
    expect(pair?.symbol).toBe("NEW/USDC");
  });

  it("answers null for a pair the gateway has never seen, in either order", async () => {
    const fetcher = gateway([]);
    expect(await fetchPairEitherOrder("Arc Testnet", "NOPE", "USDC", fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats a 200 that names no market as absent", async () => {
    // The route answers `{"error":"Token not found"}`; an older gateway sent it
    // with a 200. A row without a symbol is not a market.
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "Token not found" }), { status: 200 }));
    expect(await fetchPairEitherOrder("Arc Testnet", "NEW", "USDC", fetcher)).toBeNull();
  });

  it("passes the network so the proxy can pick the chain's gateway", async () => {
    const fetcher = gateway([market("NEW", "USDC", 1)]);
    await fetchPairEitherOrder("Arc Testnet", "NEW", "USDC", fetcher);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "/api/gateway/pair/symbol/NEW/USDC?network=Arc%20Testnet",
    );
  });
});
