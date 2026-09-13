import { describe, expect, it } from "vitest";
import {
  DUST_USD,
  emptyAccountPositions,
  hiddenDustCount,
  positionFlags,
  sortPositions,
  toAccountPositions,
  unrealizedPct,
  visiblePositions,
} from "./positions";
import type { SpotPosition } from "./types";

const ADDRESS = "0xAAAAaaaAAAAaaaAAaAaAAAaAAAaaAAAAAAAaAaAa";

function position(overrides: Partial<SpotPosition> = {}): SpotPosition {
  return {
    token: "0x1111111111111111111111111111111111111111",
    symbol: "ETH",
    logoURI: null,
    amount: 10,
    costUSD: 1000,
    avgEntryUSD: 100,
    valueUSD: 1500,
    unrealizedPnlUSD: 500,
    realizedPnlUSD: 0,
    untrackedSold: 0,
    tradeCount: 3,
    firstTradeAt: 1,
    lastTradeAt: 2,
    priced: true,
    ...overrides,
  };
}

describe("toAccountPositions", () => {
  it("keeps a missing price as null rather than zero", () => {
    const { positions } = toAccountPositions(
      {
        address: ADDRESS,
        positions: [
          {
            token: "0xabc",
            symbol: "STONK",
            amount: 100,
            costUSD: 5,
            avgEntryUSD: 0.05,
            valueUSD: null,
            unrealizedPnlUSD: null,
            realizedPnlUSD: 0,
            untrackedSold: 0,
            priced: false,
          },
        ],
        totals: { valueUSD: 0, costUSD: 0, unrealizedPnlUSD: 0, realizedPnlUSD: 0, unpricedCount: 1 },
      },
      ADDRESS,
    );
    expect(positions[0].valueUSD).toBeNull();
    expect(positions[0].unrealizedPnlUSD).toBeNull();
    expect(positions[0].priced).toBe(false);
  });

  it("degrades a failed read to an empty account rather than throwing", () => {
    expect(toAccountPositions(null, ADDRESS)).toEqual(emptyAccountPositions(ADDRESS));
  });

  it("carries the totals through verbatim", () => {
    const { totals } = toAccountPositions(
      {
        address: ADDRESS,
        positions: [],
        totals: {
          valueUSD: 51_547.4,
          costUSD: 48_253.06,
          unrealizedPnlUSD: 3294.34,
          realizedPnlUSD: 1208.77,
          unpricedCount: 1,
        },
      },
      ADDRESS,
    );
    expect(totals.valueUSD).toBeCloseTo(51_547.4, 6);
    expect(totals.realizedPnlUSD).toBeCloseTo(1208.77, 6);
    expect(totals.unpricedCount).toBe(1);
  });

  it("falls back to a short address when the broker denormalised no symbol", () => {
    const { positions } = toAccountPositions(
      { positions: [{ token: "0x1234567890abcdef1234567890abcdef12345678", amount: 1 }] },
      ADDRESS,
    );
    expect(positions[0].symbol).toBe("0x1234…5678");
  });
});

describe("positionFlags", () => {
  it("marks a token with no live price unpriced", () => {
    const flags = positionFlags(position({ priced: false, valueUSD: null, unrealizedPnlUSD: null }));
    expect(flags.unpriced).toBe(true);
    expect(flags.dust).toBe(false);
  });

  // The distinction the whole tab exists for: null is unknown, not small.
  it("never calls an unpriced position dust, however small its cost", () => {
    const flags = positionFlags(
      position({ priced: false, valueUSD: null, unrealizedPnlUSD: null, costUSD: 0.01 }),
    );
    expect(flags.unpriced).toBe(true);
    expect(flags.dust).toBe(false);
  });

  it("marks untrackedSold as partial basis", () => {
    expect(positionFlags(position({ untrackedSold: 2_100_000 })).partialBasis).toBe(true);
    expect(positionFlags(position({ untrackedSold: 0 })).partialBasis).toBe(false);
  });

  it("marks a zero amount closed", () => {
    expect(positionFlags(position({ amount: 0, valueUSD: 0, unrealizedPnlUSD: 0 })).closed).toBe(true);
  });

  // A closed row values at zero by arithmetic, not by being a small holding.
  it("never calls a closed position dust", () => {
    const flags = positionFlags(position({ amount: 0, valueUSD: 0, unrealizedPnlUSD: 0 }));
    expect(flags.closed).toBe(true);
    expect(flags.dust).toBe(false);
  });

  // The footer's unpricedCount comes from the server and counts every unpriced
  // row; the row badge deliberately does not, because a closed row's value is
  // not in doubt.
  it("does not badge a closed position unpriced", () => {
    expect(positionFlags(position({ amount: 0, priced: false, valueUSD: null })).unpriced).toBe(false);
  });

  it("marks a priced open position below the threshold as dust", () => {
    expect(positionFlags(position({ valueUSD: DUST_USD - 0.01 })).dust).toBe(true);
    expect(positionFlags(position({ valueUSD: DUST_USD })).dust).toBe(false);
  });

  // The four are independent, and this is the row that proves it must stay so:
  // realised PnL on a partial-basis position is the number most likely to be
  // incomplete, so closing it must not silence the warning.
  it("keeps the partial-basis marker on a closed position", () => {
    const flags = positionFlags(position({ amount: 0, untrackedSold: 500, realizedPnlUSD: 900 }));
    expect(flags.closed).toBe(true);
    expect(flags.partialBasis).toBe(true);
  });
});

describe("unrealizedPct", () => {
  it("is the move against cost basis", () => {
    expect(unrealizedPct(position({ costUSD: 1000, unrealizedPnlUSD: 184.2 }))).toBeCloseTo(18.42, 6);
  });

  it("is withheld when the basis is known to be incomplete", () => {
    expect(unrealizedPct(position({ untrackedSold: 1 }))).toBeNull();
  });

  it("is withheld when there is no price", () => {
    expect(unrealizedPct(position({ priced: false, valueUSD: null, unrealizedPnlUSD: null }))).toBeNull();
  });

  it("is withheld rather than infinite when there is no basis to divide by", () => {
    expect(unrealizedPct(position({ costUSD: 0 }))).toBeNull();
  });

  it("is withheld on a closed position, which has nothing unrealised left", () => {
    expect(unrealizedPct(position({ amount: 0, valueUSD: 0, unrealizedPnlUSD: 0 }))).toBeNull();
  });
});

describe("visiblePositions", () => {
  const rows = [
    position({ token: "0xa", symbol: "ETH", valueUSD: 24_672 }),
    position({ token: "0xb", symbol: "GLOW", valueUSD: 0.4 }),
    position({ token: "0xc", symbol: "GONE", amount: 0, valueUSD: 0, realizedPnlUSD: 120 }),
    position({ token: "0xd", symbol: "STONK", priced: false, valueUSD: null, unrealizedPnlUSD: null }),
  ];

  it("hides dust from the open view until it is asked for", () => {
    expect(visiblePositions(rows, "open", false).map((p) => p.symbol)).toEqual(["ETH", "STONK"]);
    expect(visiblePositions(rows, "open", true).map((p) => p.symbol)).toEqual([
      "ETH",
      "GLOW",
      "STONK",
    ]);
  });

  it("puts closed positions behind their own view, never dropping them", () => {
    expect(visiblePositions(rows, "closed", false).map((p) => p.symbol)).toEqual(["GONE"]);
  });

  it("counts what the dust filter is hiding so the UI can say so", () => {
    expect(hiddenDustCount(rows, "open")).toBe(1);
    expect(hiddenDustCount(rows, "closed")).toBe(0);
  });
});

describe("sortPositions", () => {
  it("ranks by value, then the unpriced, then the closed", () => {
    const sorted = sortPositions([
      position({ token: "0xc", symbol: "GONE", amount: 0, valueUSD: 0, realizedPnlUSD: 120 }),
      position({ token: "0xd", symbol: "STONK", priced: false, valueUSD: null, unrealizedPnlUSD: null }),
      position({ token: "0xb", symbol: "GLOW", valueUSD: 250 }),
      position({ token: "0xa", symbol: "ETH", valueUSD: 24_672 }),
    ]);
    expect(sorted.map((p) => p.symbol)).toEqual(["ETH", "GLOW", "STONK", "GONE"]);
  });

  it("does not mutate its input", () => {
    const rows = [position({ symbol: "A", valueUSD: 1 }), position({ symbol: "B", valueUSD: 2 })];
    sortPositions(rows);
    expect(rows.map((p) => p.symbol)).toEqual(["A", "B"]);
  });
});
