import { describe, it, expect } from "vitest";
import { pairToResult, tokenToResult } from "./trendingRow";
import type { SpotPair, SpotToken } from "@/types";

/**
 * The badge is the point of these tests.
 *
 * `SearchModal`'s row draws a chain mark only when `result.chain` is set —
 * `ChainChip` guards on it, and `TokenImageIcon` / `PairImageIcon` draw a
 * `ChainBadge` only when handed a `chainName`. `chain` is optional on the result
 * types, so omitting it degrades a row silently instead of failing a build, and
 * that is exactly how the modal's zero-query state ended up with no chain marks.
 */

const token = {
  id: "0xtoken",
  symbol: "USDC",
  name: "USD Coin",
  ticker: "USDC",
  logoURI: "https://example.test/usdc.png",
  verified: true,
} as unknown as SpotToken;

const pair = {
  id: "0xpair",
  symbol: "HOOPS/USDC",
  ticker: "HOOPSUSDC",
  baseSymbol: "HOOPS",
  quoteSymbol: "USDC",
  base: { id: "0xbase", logoURI: "https://example.test/hoops.png" },
  quote: { id: "0xquote", logoURI: null },
  verified: true,
} as unknown as SpotPair;

describe("tokenToResult", () => {
  it("stamps the chain it came from", () => {
    expect(tokenToResult(token, "Arc Testnet").chain).toBe("Arc Testnet");
  });

  it("carries the fields the row and the route need", () => {
    expect(tokenToResult(token, "RISE Testnet")).toMatchObject({
      type: "token",
      id: "0xtoken",
      symbol: "USDC",
      name: "USD Coin",
      logoURI: "https://example.test/usdc.png",
      chain: "RISE Testnet",
    });
  });
});

describe("pairToResult", () => {
  it("stamps the chain it came from", () => {
    expect(pairToResult(pair, "Arc Testnet").chain).toBe("Arc Testnet");
  });

  it("carries both sides' artwork, so a trending row draws what a searched row draws", () => {
    expect(pairToResult(pair, "Arc Testnet")).toMatchObject({
      type: "pair",
      baseSymbol: "HOOPS",
      quoteSymbol: "USDC",
      baseLogoURI: "https://example.test/hoops.png",
      // null, not undefined: the row has to tell "no logo" apart from an older
      // gateway that never sent the field.
      quoteLogoURI: null,
    });
  });

  it("defaults an absent verified to listed, so trending rows are not all chipped", () => {
    const unset = { ...pair, verified: undefined } as unknown as SpotPair;
    expect(pairToResult(unset, "Arc Testnet").verified).toBe(true);
  });
});

describe("used as a map callback", () => {
  /**
   * `.map(tokenToResult)` type-checks — `map` passes (value, index, array), and
   * the index is a number where `chain` is a string only at runtime. It would
   * stamp every row with "0", "1", "2". The call sites pass an explicit arrow;
   * this pins why.
   */
  it("stamps the chain, never the array index", () => {
    const rows = [token, token, token].map((t) => tokenToResult(t, "Arc Testnet"));
    expect(rows.map((r) => r.chain)).toEqual(["Arc Testnet", "Arc Testnet", "Arc Testnet"]);
  });
});
