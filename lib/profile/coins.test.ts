import { describe, expect, it } from "vitest";
import {
  formatAge,
  mergeCreatedCoins,
  toAuctionRow,
  toLaunchRow,
  type CreatedCoinRow,
} from "./coins";

const HOUR = 3_600;
const DAY = 86_400;
const NOW = 1_800_000_000;

function row(over: Partial<CreatedCoinRow> = {}): CreatedCoinRow {
  return {
    address: "0xabc",
    name: "Nova",
    symbol: "NOVA",
    logoURI: null,
    origin: "launch",
    marketCapUsd: 1,
    createdAt: NOW - DAY,
    ...over,
  };
}

describe("toLaunchRow", () => {
  it("maps a creator-tokens row", () => {
    expect(
      toLaunchRow({
        id: "0x1111111111111111111111111111111111111111",
        name: "Nova Protocol",
        symbol: "NOVA",
        logoURI: "https://cdn/nova.png",
        marketCap: 4_100_000,
        listingDate: NOW - 19 * DAY,
      }),
    ).toEqual({
      address: "0x1111111111111111111111111111111111111111",
      name: "Nova Protocol",
      symbol: "NOVA",
      logoURI: "https://cdn/nova.png",
      origin: "launch",
      marketCapUsd: 4_100_000,
      createdAt: NOW - 19 * DAY,
    });
  });

  it("falls back to the symbol when a coin has no name", () => {
    expect(toLaunchRow({ id: "0xa", symbol: "GRID" }).name).toBe("GRID");
  });

  it("keeps an unpriced coin's market cap null rather than zero", () => {
    // A dash and a $0 say different things, and only one of them is true.
    expect(toLaunchRow({ id: "0xa", symbol: "LUMN" }).marketCapUsd).toBeNull();
    expect(toLaunchRow({ id: "0xa", symbol: "LUMN", marketCap: null }).marketCapUsd).toBeNull();
  });
});

describe("toAuctionRow", () => {
  it("maps a creator-auctions row and marks its origin", () => {
    expect(
      toAuctionRow({
        coin: "0x2222222222222222222222222222222222222222",
        name: "Halo",
        symbol: "HALO",
        marketCap: 228_000,
        createdAt: NOW - 60 * DAY,
      }),
    ).toEqual({
      address: "0x2222222222222222222222222222222222222222",
      name: "Halo",
      symbol: "HALO",
      logoURI: null,
      origin: "auction",
      marketCapUsd: 228_000,
      createdAt: NOW - 60 * DAY,
    });
  });
});

describe("mergeCreatedCoins", () => {
  it("interleaves both origins newest first", () => {
    const merged = mergeCreatedCoins(
      [row({ symbol: "A", createdAt: NOW - 10 * DAY }), row({ symbol: "C", createdAt: NOW - 90 * DAY })],
      [
        row({ symbol: "B", origin: "auction", createdAt: NOW - 30 * DAY }),
        row({ symbol: "D", origin: "auction", createdAt: NOW - 200 * DAY }),
      ],
    );
    expect(merged.map((r) => r.symbol)).toEqual(["A", "B", "C", "D"]);
  });

  it("sorts a coin with no timestamp LAST, not as epoch 0", () => {
    // Treating null as 0 would bury a brand-new coin under everything, which is
    // the opposite of what a missing timestamp means.
    const merged = mergeCreatedCoins(
      [row({ symbol: "KNOWN", createdAt: NOW - 400 * DAY })],
      [row({ symbol: "UNKNOWN", origin: "auction", createdAt: null })],
    );
    expect(merged.map((r) => r.symbol)).toEqual(["KNOWN", "UNKNOWN"]);
  });

  it("returns an empty list when a creator has neither", () => {
    expect(mergeCreatedCoins([], [])).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const launches = [row({ symbol: "A", createdAt: NOW - 90 * DAY })];
    const auctions = [row({ symbol: "B", origin: "auction", createdAt: NOW - 10 * DAY })];
    mergeCreatedCoins(launches, auctions);
    expect(launches.map((r) => r.symbol)).toEqual(["A"]);
    expect(auctions.map((r) => r.symbol)).toEqual(["B"]);
  });
});

describe("formatAge", () => {
  it("renders a dash rather than inventing an age", () => {
    expect(formatAge(null, NOW)).toBe("—");
    expect(formatAge(0, NOW)).toBe("—");
    expect(formatAge(Number.NaN, NOW)).toBe("—");
  });

  it("never reports less than a minute as 0m", () => {
    expect(formatAge(NOW - 5, NOW)).toBe("1m ago");
  });

  it("steps through the units, rounding down at every boundary", () => {
    expect(formatAge(NOW - 59 * 60, NOW)).toBe("59m ago");
    expect(formatAge(NOW - HOUR, NOW)).toBe("1h ago");
    expect(formatAge(NOW - 23 * HOUR, NOW)).toBe("23h ago");
    expect(formatAge(NOW - DAY, NOW)).toBe("1d ago");
    expect(formatAge(NOW - 29 * DAY, NOW)).toBe("29d ago");
    expect(formatAge(NOW - 30 * DAY, NOW)).toBe("1mo ago");
    expect(formatAge(NOW - 359 * DAY, NOW)).toBe("11mo ago");
    expect(formatAge(NOW - 365 * DAY, NOW)).toBe("1y ago");
    expect(formatAge(NOW - 800 * DAY, NOW)).toBe("2y ago");
  });

  it("clamps a future timestamp to the floor instead of going negative", () => {
    // Clock skew between a chain timestamp and the browser is real; "-3m ago"
    // reads as a bug.
    expect(formatAge(NOW + 600, NOW)).toBe("1m ago");
  });
});
