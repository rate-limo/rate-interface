import { describe, it, expect } from "vitest";
import { MAX_RECENT_MARKETS, parseRecentMarkets, pushRecent } from "./recentMarkets";

const A = "0x0000000000000000000000000000000000000001";
const B = "0x0000000000000000000000000000000000000002";

describe("recent markets", () => {
  it("moves a reopened market to the front without duplicating it", () => {
    expect(pushRecent([A, B], B.toUpperCase().replace("0X", "0x"))).toHaveLength(2);
    expect(pushRecent([A, B], B)[0]).toBe(B);
  });

  it("caps the list", () => {
    let list: string[] = [];
    for (let i = 1; i <= MAX_RECENT_MARKETS + 5; i++) {
      list = pushRecent(list, `0x${i.toString(16).padStart(40, "0")}`);
    }
    expect(list).toHaveLength(MAX_RECENT_MARKETS);
  });

  it("drops anything that is not an address, and never throws on bad JSON", () => {
    expect(parseRecentMarkets("not json")).toEqual({});
    expect(parseRecentMarkets(JSON.stringify({ "arc-testnet": [A, "javascript:alert(1)", 42] }))).toEqual({
      "arc-testnet": [A],
    });
    expect(parseRecentMarkets(JSON.stringify([A]))).toEqual({});
  });
});
