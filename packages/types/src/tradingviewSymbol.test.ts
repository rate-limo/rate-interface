import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMarketCapSymbol,
  MARKET_CAP_SUFFIX,
  parseTradingViewSymbol,
} from "./tradingviewSymbol";

test("parseTradingViewSymbol reads a plain token symbol as non-mcap", () => {
  assert.deepEqual(parseTradingViewSymbol("NOVA"), { base: "NOVA", isMarketCap: false });
});

test("parseTradingViewSymbol reads a plain pair symbol as non-mcap", () => {
  assert.deepEqual(parseTradingViewSymbol("ETH/USDC"), {
    base: "ETH/USDC",
    isMarketCap: false,
  });
});

test("parseTradingViewSymbol strips the suffix and flags market cap", () => {
  assert.deepEqual(parseTradingViewSymbol("NOVA:MCAP"), { base: "NOVA", isMarketCap: true });
});

test("buildMarketCapSymbol appends the suffix", () => {
  assert.equal(buildMarketCapSymbol("NOVA"), "NOVA:MCAP");
});

test("build then parse round-trips", () => {
  const built = buildMarketCapSymbol("WETH");
  assert.deepEqual(parseTradingViewSymbol(built), { base: "WETH", isMarketCap: true });
});

test("the suffix cannot be confused with the pair separator", () => {
  assert.equal(MARKET_CAP_SUFFIX.includes("/"), false);
});

test("a pair symbol can carry the mcap suffix too, and still parses as mcap", () => {
  // /symbols and /history reject this combination explicitly (mcap only makes
  // sense for a token, not a pair's exchange rate) -- this test only pins the
  // pure parse, not the gateway's rejection of it.
  assert.deepEqual(parseTradingViewSymbol("ETH/USDC:MCAP"), {
    base: "ETH/USDC",
    isMarketCap: true,
  });
});
