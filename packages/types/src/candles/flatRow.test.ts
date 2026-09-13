import assert from "node:assert/strict";
import { test } from "node:test";
import { nextFlatRow } from "./flatRow";

test("carries the close into every price field and zeroes the flows", () => {
  const cur = {
    base: "0xA", quote: "0xB", symbol: "A/B", pair: "0xP",
    open: 1, high: 3, low: 0.5, close: 2, average: 1.8,
    difference: 0.4, differencePercentage: 25,
    baseVolume: 10, quoteVolume: 20, baseVolumeUSD: 30, quoteVolumeUSD: 40,
    baseTvl: 5, quoteTvl: 6, baseTvlUSD: 7, quoteTvlUSD: 8,
    count: 3, timestamp: 600,
  };
  const next = nextFlatRow(cur, 60, "pair", 9999);

  assert.equal(next.open, 2);
  assert.equal(next.high, 2);
  assert.equal(next.low, 2);
  assert.equal(next.close, 2);
  assert.equal(next.average, 2);
  assert.equal(next.difference, 0);
  assert.equal(next.differencePercentage, 0);
  assert.equal(next.baseVolume, 0);
  assert.equal(next.quoteVolume, 0);
  assert.equal(next.baseVolumeUSD, 0);
  assert.equal(next.quoteVolumeUSD, 0);
  assert.equal(next.baseTvl, 0);
  assert.equal(next.quoteTvl, 0);
  assert.equal(next.baseTvlUSD, 0);
  assert.equal(next.quoteTvlUSD, 0);
  assert.equal(next.count, 0);
  assert.equal(next.timestamp, 660);
  assert.equal(next.base, "0xA");
  assert.equal(next.quote, "0xB");
  assert.equal(next.pair, "0xP");
});

test("token rows zero tvl/tvlUSD instead of the four pair legs", () => {
  const cur = {
    token: "0xT", symbol: "T", open: 1, high: 1, low: 1, close: 5, average: 1,
    difference: 2, differencePercentage: 3, tvl: 9, tvlUSD: 11,
    volume: 4, volumeUSD: 6, count: 1, timestamp: 120,
  };
  const next = nextFlatRow(cur, 60, "token", 9999);
  assert.equal(next.close, 5);
  assert.equal(next.tvl, 0);
  assert.equal(next.tvlUSD, 0);
  assert.equal(next.volume, 0);
  assert.equal(next.volumeUSD, 0);
  assert.equal(next.token, "0xT");
  assert.equal(next.timestamp, 180);
});

test("a null close carries as zero, matching the tick", () => {
  const next = nextFlatRow({ close: null, timestamp: 60 }, 60, "token", 9999);
  assert.equal(next.close, 0);
  assert.equal(next.open, 0);
});

test("a null timestamp falls back to now, matching the tick", () => {
  const next = nextFlatRow({ close: 1, timestamp: null }, 60, "token", 1000);
  assert.equal(next.timestamp, 1060);
});
