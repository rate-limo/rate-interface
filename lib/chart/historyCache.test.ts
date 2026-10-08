import { beforeEach, describe, expect, it } from "vitest";
import { FRESH_MS, MAX_ENTRIES, clearHistoryCache, historyKey, readHistory, writeHistory } from "./historyCache";

const bars = [{ time: 1 }, { time: 2 }];

describe("history cache", () => {
  beforeEach(() => clearHistoryCache());

  it("hands back what a chart saved while it is fresh", () => {
    const key = historyKey("https://gw", "NOVA@0x1", "15");
    writeHistory(key, { bars, hasOlder: true }, 1_000);
    expect(readHistory(key, 1_000 + FRESH_MS)?.bars).toEqual(bars);
  });

  it("drops an entry once it is older than FRESH_MS, so a chart refetches instead of showing frozen candles", () => {
    const key = historyKey("https://gw", "NOVA@0x1", "15");
    writeHistory(key, { bars, hasOlder: true }, 1_000);
    expect(readHistory(key, 1_000 + FRESH_MS + 1)).toBeUndefined();
    expect(readHistory(key, 1_000)).toBeUndefined();
  });

  it("keys by gateway, ticker and resolution", () => {
    writeHistory(historyKey("https://arc", "NOVA@0x1", "15"), { bars, hasOlder: true }, 0);
    expect(readHistory(historyKey("https://rise", "NOVA@0x1", "15"), 0)).toBeUndefined();
    expect(readHistory(historyKey("https://arc", "NOVA@0x2", "15"), 0)).toBeUndefined();
    expect(readHistory(historyKey("https://arc", "NOVA@0x1", "1"), 0)).toBeUndefined();
  });

  it("keeps at most MAX_ENTRIES, evicting the least recently used", () => {
    for (let i = 0; i < MAX_ENTRIES; i++) writeHistory(`k${i}`, { bars, hasOlder: true }, 0);
    readHistory("k0", 0); // k0 becomes the most recent; k1 is now the oldest
    writeHistory("extra", { bars, hasOlder: true }, 0);
    expect(readHistory("k0", 0)).toBeDefined();
    expect(readHistory("k1", 0)).toBeUndefined();
    expect(readHistory("extra", 0)).toBeDefined();
  });
});
