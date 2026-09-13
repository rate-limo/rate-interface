import { describe, expect, it } from "vitest";
import { isUnlisted, partitionByListing } from "./listing";

describe("isUnlisted", () => {
  it("treats an explicit true as listed", () => {
    expect(isUnlisted({ verified: true })).toBe(false);
  });

  it("treats false, null and absent as unlisted", () => {
    // `verified` is nullable, defaults to false, and an older gateway omits it
    // entirely. Every one of those must read as "not reviewed" — the opposite
    // default would present an unreviewed market as a reviewed one.
    expect(isUnlisted({ verified: false })).toBe(true);
    expect(isUnlisted({ verified: null })).toBe(true);
    expect(isUnlisted({})).toBe(true);
  });
});

describe("partitionByListing", () => {
  it("splits hits and preserves the server's order within each group", () => {
    const hits = [
      { symbol: "ETH", verified: true },
      { symbol: "NOVA", verified: false },
      { symbol: "WBTC", verified: true },
      { symbol: "HELIO" },
    ];
    const { listed, unlisted } = partitionByListing(hits);
    expect(listed.map((h) => h.symbol)).toEqual(["ETH", "WBTC"]);
    expect(unlisted.map((h) => h.symbol)).toEqual(["NOVA", "HELIO"]);
  });

  it("returns empty groups rather than undefined when there are no hits", () => {
    expect(partitionByListing([])).toEqual({ listed: [], unlisted: [] });
  });
});
