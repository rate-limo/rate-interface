import { describe, expect, it } from "vitest";
import { parseRateCardKey, rateCardUrl, rateLine, rateShareText, rateShareUrl, sideOf } from "./share";

const KEY = {
  chain: "rise-testnet",
  address: "0x143F9DDCF12Ff8f1E6faC4C01E8dd203cC40a756",
  pair: "0x7Aa5df21D1668466c78Fd07EB359874Cd077F4cb",
  side: "buy" as const,
  orderId: 42,
};

describe("rate card links", () => {
  it("round-trips a key through the share url", () => {
    const url = new URL(rateShareUrl("https://rate.limo/", KEY, "ABC123"));
    expect(url.pathname).toBe("/rate");
    expect(url.searchParams.get("ref")).toBe("ABC123");
    expect(parseRateCardKey(url.searchParams)).toEqual(KEY);
  });

  it("carries no numbers: the card reads them from the chain", () => {
    const url = rateCardUrl("https://rate.limo", KEY);
    expect(url).not.toMatch(/price|amount|size/);
    expect(url.startsWith("https://rate.limo/api/og/rate?")).toBe(true);
  });

  it("refuses malformed keys instead of passing them to the gateway", () => {
    const ok = new URLSearchParams(rateShareUrl("https://x", KEY).split("?")[1]);
    for (const [k, v] of [["address", "0x123"], ["pair", "../../etc"], ["side", "long"], ["order", "-1"], ["order", "0"], ["order", "1.5"], ["chain", "Rise Testnet"]]) {
      const q = new URLSearchParams(ok);
      q.set(k, v);
      expect(parseRateCardKey(q), `${k}=${v}`).toBeNull();
    }
  });

  it("names a side from isBid", () => {
    expect(sideOf(true)).toBe("buy");
    expect(sideOf(false)).toBe("sell");
  });
});

describe("rate card copy", () => {
  it("is a rate, never a dollar figure", () => {
    expect(rateLine(1500, "ETH", "USDC")).toBe("1 ETH = 1,500 USDC");
    expect(rateLine(1500, "ETH", "USDC")).not.toContain("$");
  });

  it("states the price and the line, and no size or gain", () => {
    expect(rateShareText("buy", 1500, "ETH", "USDC")).toBe(
      "My rate: I'd buy ETH at 1 ETH = 1,500 USDC. Don't trade. Let the market come to you.",
    );
    expect(rateShareText("sell", 2, "SKHY", "USDC", true)).toBe(
      "Filled at my rate: 1 SKHY = 2.0000 USDC. Don't trade. Let the market come to you.",
    );
  });
});
