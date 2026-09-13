import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * The status bar's ETH price, and the ways Coinbase can fail to give one.
 *
 * The status bar renders on EVERY page in the app, so this route's contract is
 * that it never throws and never invents a number: any upstream problem answers
 * `{ usd: null }` with a 200, and the chip draws an em-dash. A 500 here would
 * surface as a page-level error boundary for a figure nobody is trading on.
 *
 * The parsing is worth pinning rather than eyeballing. Coinbase returns its
 * numbers as STRINGS, and `Number("")` is 0 — so the obvious `Number(body.last)`
 * turns a missing field into a confident $0.00 ETH, which is exactly the class
 * of bug the rest of this bar's chips are written to avoid.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

async function body() {
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as { usd: number | null; changePct: number | null };
}

describe("GET /api/eth-price", () => {
  it("reports the last trade and the change against the 24h open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ last: "2507.92", open: "2449.42" })));
    const b = await body();
    expect(b.usd).toBe(2507.92);
    // (2507.92 - 2449.42) / 2449.42 * 100
    expect(b.changePct).toBeCloseTo(2.3883, 3);
  });

  it("asks Coinbase for ETH-USD stats, which carries both numbers in one call", async () => {
    // Typed so `mock.calls[0]` is a two-element tuple: `vi.fn(async () => …)`
    // infers a ZERO-argument signature, and destructuring a url out of an empty
    // tuple is a type error even though the call records one at runtime.
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json({ last: "1", open: "1" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await body();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(String(call![0])).toBe("https://api.exchange.coinbase.com/products/ETH-USD/stats");
  });

  it("answers null, not zero, when a field is an empty string", async () => {
    // `Number("")` is 0. This is the whole reason the helper exists.
    vi.stubGlobal("fetch", vi.fn(async () => json({ last: "", open: "2449.42" })));
    expect((await body()).usd).toBeNull();
  });

  it("answers null for a non-positive price", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ last: "0", open: "2449.42" })));
    expect((await body()).usd).toBeNull();
  });

  it("keeps the price when only the open is missing", async () => {
    // Half an answer is still an answer: the chip prints the price and omits the
    // delta, rather than dropping a good number because a second one was absent.
    vi.stubGlobal("fetch", vi.fn(async () => json({ last: "2507.92" })));
    const b = await body();
    expect(b.usd).toBe(2507.92);
    expect(b.changePct).toBeNull();
  });

  it("does not report a zero change when the open could not be read", async () => {
    // A green 0.00% claims the price has not moved. The truth is we cannot tell.
    vi.stubGlobal("fetch", vi.fn(async () => json({ last: "2507.92", open: "0" })));
    expect((await body()).changePct).toBeNull();
  });

  it("degrades to nulls on an upstream error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "rate limited" }, 429)));
    expect(await body()).toEqual({ usd: null, changePct: null });
  });

  it("degrades to nulls when Coinbase is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await body()).toEqual({ usd: null, changePct: null });
  });

  it("degrades to nulls on a body that is not JSON", async () => {
    // A captive portal or an edge proxy answers HTML with a 200.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>nope</html>", { status: 200 })));
    expect(await body()).toEqual({ usd: null, changePct: null });
  });
});
