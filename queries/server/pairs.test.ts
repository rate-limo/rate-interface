import { afterEach, describe, expect, it, vi } from "vitest";
import { getPairByBaseAddress, getPairByTokens } from "./pairs";

/**
 * Pro's market lookup by token address. A launchpad ticker can belong to two
 * coins, so `base=NOVA` could open either; these pin the address routes the
 * page now takes instead, and that a quote named only by symbol is refused
 * rather than guessed when two tokens share it.
 */

const NOVA = "0x35C60968CA948f71D57Bd2A0597B691E4cC8e8d3";
const USDC = "0x3600000000000000000000000000000000000000";
const FAKE_USDC = "0x00000000000000000000000000000000000000Ff";
const PAIR = { symbol: "NOVA/USDC", id: "0xF2640EFf6987a3b55abd7909d20Df4D246DeF104" };

const urls: string[] = [];
function serve(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", (url: string) => {
    urls.push(String(url));
    const hit = Object.entries(routes).find(([suffix]) => String(url).endsWith(suffix));
    return Promise.resolve({ ok: !!hit, json: async () => hit?.[1] ?? { error: "not found" } } as Response);
  });
}

afterEach(() => {
  urls.length = 0;
  vi.unstubAllGlobals();
});

describe("getPairByTokens", () => {
  it("asks the gateway for the book between two token addresses", async () => {
    serve({ [`/api/pair/${NOVA}/${USDC}`]: PAIR });
    expect(await getPairByTokens("Arc Testnet", NOVA, USDC)).toEqual(PAIR);
    expect(urls[0]).toContain(`/api/pair/${NOVA}/${USDC}`);
    expect(urls[0]).not.toContain("/symbol/");
  });

  it("answers null for a market that does not exist", async () => {
    serve({});
    expect(await getPairByTokens("Arc Testnet", NOVA, USDC)).toBeNull();
  });
});

describe("getPairByBaseAddress", () => {
  it("finds the quote among the coin's OWN markets, then loads that book by address", async () => {
    serve({
      [`/api/token/${NOVA}`]: { basePairs: [{ base: NOVA, quote: USDC, quoteSymbol: "USDC" }] },
      [`/api/pair/${NOVA}/${USDC}`]: PAIR,
    });
    expect(await getPairByBaseAddress("Arc Testnet", NOVA, "usdc")).toEqual(PAIR);
  });

  it("refuses when two quote tokens share the symbol, instead of picking one", async () => {
    serve({
      [`/api/token/${NOVA}`]: {
        basePairs: [
          { base: NOVA, quote: USDC, quoteSymbol: "USDC" },
          { base: NOVA, quote: FAKE_USDC, quoteSymbol: "USDC" },
        ],
      },
    });
    expect(await getPairByBaseAddress("Arc Testnet", NOVA, "USDC")).toBeNull();
  });

  it("ignores markets where this coin is the QUOTE, not the base", async () => {
    serve({ [`/api/token/${NOVA}`]: { basePairs: [{ base: USDC, quote: NOVA, quoteSymbol: "NOVA" }] } });
    expect(await getPairByBaseAddress("Arc Testnet", NOVA, "USDC")).toBeNull();
  });
});
