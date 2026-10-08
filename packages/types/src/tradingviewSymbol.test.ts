import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChartTicker,
  buildMarketCapSymbol,
  MARKET_CAP_SUFFIX,
  parseTradingViewSymbol,
  stripChartAddress,
} from "./tradingviewSymbol";

test("parseTradingViewSymbol reads a plain token symbol as non-mcap", () => {
  assert.deepEqual(parseTradingViewSymbol("NOVA"), { base: "NOVA", isMarketCap: false, address: null });
});

test("parseTradingViewSymbol reads a plain pair symbol as non-mcap", () => {
  assert.deepEqual(parseTradingViewSymbol("ETH/USDC"), {
    base: "ETH/USDC",
    isMarketCap: false,
    address: null,
  });
});

test("parseTradingViewSymbol strips the suffix and flags market cap", () => {
  assert.deepEqual(parseTradingViewSymbol("NOVA:MCAP"), { base: "NOVA", isMarketCap: true, address: null });
});

test("buildMarketCapSymbol appends the suffix", () => {
  assert.equal(buildMarketCapSymbol("NOVA"), "NOVA:MCAP");
});

test("build then parse round-trips", () => {
  const built = buildMarketCapSymbol("WETH");
  assert.deepEqual(parseTradingViewSymbol(built), { base: "WETH", isMarketCap: true, address: null });
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
    address: null,
  });
});

const PAIR = "0xF2640EFf6987a3b55abd7909d20Df4D246DeF104";
const TOKEN = "0x35C60968CA948f71D57Bd2A0597B691E4cC8e8d3";

test("a pair ticker qualified with its address parses back to symbol + address", () => {
  assert.deepEqual(parseTradingViewSymbol(buildChartTicker("TITER/USDC", PAIR)), {
    base: "TITER/USDC",
    isMarketCap: false,
    address: PAIR,
  });
});

test("a qualified token ticker keeps its address under the mcap suffix", () => {
  const ticker = buildMarketCapSymbol(buildChartTicker("TITER", TOKEN));
  assert.equal(ticker, `TITER@${TOKEN}:MCAP`);
  assert.deepEqual(parseTradingViewSymbol(ticker), {
    base: "TITER",
    isMarketCap: true,
    address: TOKEN,
  });
});

test("an @ that is not followed by a full address stays part of the symbol", () => {
  // On-chain symbols are arbitrary strings; only a 20-byte hex tail qualifies.
  assert.deepEqual(parseTradingViewSymbol("GM@GN"), { base: "GM@GN", isMarketCap: false, address: null });
  assert.deepEqual(parseTradingViewSymbol("X@0x1234"), { base: "X@0x1234", isMarketCap: false, address: null });
});

test("two launches sharing a ticker produce two distinct chart tickers", () => {
  const other = "0x04E811045A9044c29B45Fb55BF07F80f5f4D9DBe";
  assert.notEqual(buildChartTicker("NOVA/USDC", PAIR), buildChartTicker("NOVA/USDC", other));
});

test("stripChartAddress reduces a qualified ticker to the stream's key", () => {
  assert.equal(stripChartAddress(buildChartTicker("TITER/USDC", PAIR)), "TITER/USDC");
  assert.equal(stripChartAddress(`TITER@${TOKEN}:MCAP`), "TITER:MCAP");
  assert.equal(stripChartAddress("ETH/USDC"), "ETH/USDC");
});
