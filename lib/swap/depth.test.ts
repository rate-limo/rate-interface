import { describe, expect, it } from "vitest";
import {
  buildDepthModel,
  crossesMarket,
  cumulativeBook,
  fitWindow,
  poolDepthAt,
  priceToX,
  queueAhead,
  stepAreaPath,
  stopBand,
  depthStepFor,
  type PoolRange,
} from "./depth";

const ranges: PoolRange[] = [
  { minPrice: 90, maxPrice: 110, baseAmount: 10, quoteAmount: 1000 },
  { minPrice: 100, maxPrice: 120, baseAmount: 5, quoteAmount: 500 },
  { minPrice: 200, maxPrice: 300, baseAmount: 99, quoteAmount: 9900 },
];

describe("poolDepthAt", () => {
  it("sums every range covering the price, and only those", () => {
    expect(poolDepthAt(ranges, 95, "base")).toBe(10);
    // Both of the first two cover 105.
    expect(poolDepthAt(ranges, 105, "base")).toBe(15);
    expect(poolDepthAt(ranges, 115, "base")).toBe(5);
    expect(poolDepthAt(ranges, 150, "base")).toBe(0);
  });

  it("counts both bounds, because a tiered position is available across its whole interval", () => {
    expect(poolDepthAt(ranges, 90, "base")).toBe(10);
    expect(poolDepthAt(ranges, 110, "base")).toBe(15);
  });

  it("answers a different number per unit — which is why the unit is displayed", () => {
    expect(poolDepthAt(ranges, 105, "base")).toBe(15);
    expect(poolDepthAt(ranges, 105, "quote")).toBe(1500);
  });

  it("ignores null and non-positive amounts rather than coercing them to zero depth", () => {
    const odd: PoolRange[] = [
      { minPrice: 1, maxPrice: 2, baseAmount: null, quoteAmount: 5 },
      { minPrice: 1, maxPrice: 2, baseAmount: -3, quoteAmount: 5 },
    ];
    expect(poolDepthAt(odd, 1.5, "base")).toBe(0);
    expect(poolDepthAt(odd, 1.5, "quote")).toBe(10);
  });
});

describe("cumulativeBook", () => {
  it("accumulates away from mid on each side", () => {
    const bids = cumulativeBook(
      [{ price: 99, size: 1 }, { price: 98, size: 2 }, { price: 97, size: 3 }],
      100,
      "bid",
    );
    expect(bids.map((p) => [p.price, p.book])).toEqual([[99, 1], [98, 3], [97, 6]]);

    const asks = cumulativeBook(
      [{ price: 103, size: 3 }, { price: 101, size: 1 }, { price: 102, size: 2 }],
      100,
      "ask",
    );
    expect(asks.map((p) => [p.price, p.book])).toEqual([[101, 1], [102, 3], [103, 6]]);
  });

  it("drops levels on the wrong side of mid instead of folding a crossed book in", () => {
    const bids = cumulativeBook([{ price: 105, size: 9 }, { price: 99, size: 1 }], 100, "bid");
    expect(bids).toEqual([{ price: 99, book: 1, pool: 0 }]);
  });
});

describe("buildDepthModel", () => {
  const base = {
    bids: [{ price: 99, size: 2 }],
    asks: [{ price: 101, size: 4 }],
    ranges,
    mid: 100,
    window: 0.5,
    unit: "base" as const,
    unitSymbol: "ETH",
  };

  it("attaches pool depth to each book point and reports the axis maximum", () => {
    const m = buildDepthModel(base)!;
    // Sampled at the book's own level AND at the band edges around it, so the
    // point carrying the resting order is found by price rather than by index.
    expect(m.bids.find((p) => p.price === 99)).toMatchObject({ book: 2, pool: 10 });
    expect(m.asks.find((p) => p.price === 101)).toMatchObject({ book: 4, pool: 15 });
    expect(m.max).toBe(19);
    expect(m.unitSymbol).toBe("ETH");
  });

  it("gives the pool its own vertices, so a band is drawn where it actually ends", () => {
    const m = buildDepthModel(base)!;
    // 90 and 110 are band edges, not book levels. Without them the pool is
    // smeared between distant book prices instead of ending where the band does.
    expect(m.bids.map((p) => p.price)).toContain(90);
    expect(m.asks.map((p) => p.price)).toContain(110);
  });

  it("returns null when there is no book AND no pool — not an empty chart", () => {
    expect(buildDepthModel({ ...base, bids: [], asks: [], ranges: [] })).toBeNull();
  });

  it("still renders when the book is empty but the pool is not", () => {
    const m = buildDepthModel({ ...base, bids: [], asks: [] });
    expect(m).not.toBeNull();
    expect(m!.max).toBe(15);
  });

  /*
   * The bug this file did not catch: the model was non-null, so this suite
   * passed, while the chart drew its frame over an empty plot. Non-null is not
   * drawable — a series needs VERTICES, and with no book there were none.
   */
  it("draws the pool with no book at all — points, not just a non-null model", () => {
    const m = buildDepthModel({ ...base, bids: [], asks: [] })!;
    expect(m.bids.length + m.asks.length).toBeGreaterThan(0);
    expect([...m.bids, ...m.asks].some((p) => p.pool > 0)).toBe(true);
  });

  it("takes its bounds from the window, so the axis does not move with the data", () => {
    const m = buildDepthModel(base)!;
    expect(m.lo).toBe(50);
    expect(m.hi).toBe(150);
  });

  it("refuses a nonsensical mid rather than dividing by it", () => {
    expect(buildDepthModel({ ...base, mid: 0 })).toBeNull();
    expect(buildDepthModel({ ...base, mid: Number.NaN })).toBeNull();
  });
});

describe("priceToX", () => {
  const m = { lo: 90, hi: 110 };
  it("maps the window across the plot", () => {
    expect(priceToX(90, m, 200)).toBe(0);
    expect(priceToX(100, m, 200)).toBe(100);
    expect(priceToX(110, m, 200)).toBe(200);
  });
  it("clamps rather than drawing outside the frame", () => {
    expect(priceToX(50, m, 200)).toBe(0);
    expect(priceToX(500, m, 200)).toBe(200);
  });
});

describe("queueAhead", () => {
  it("reports the book sitting in front of a resting order", () => {
    const m = buildDepthModel({
      bids: [{ price: 99, size: 2 }, { price: 98, size: 3 }],
      asks: [],
      ranges: [],
      mid: 100,
      window: 0.5,
      unit: "base",
      unitSymbol: "ETH",
    })!;
    // At 98 both levels are in front of you.
    expect(queueAhead(m, 98, "bid")).toBe(5);
    // At 99 only the 99 level is.
    expect(queueAhead(m, 99, "bid")).toBe(2);
    // Better than every resting bid: nothing ahead.
    expect(queueAhead(m, 99.5, "bid")).toBe(0);
  });
});

describe("crossesMarket", () => {
  const m = buildDepthModel({
    bids: [{ price: 99, size: 1 }],
    asks: [{ price: 101, size: 1 }],
    ranges: [],
    mid: 100,
    window: 0.5,
    unit: "base",
    unitSymbol: "ETH",
  })!;

  it("a buy at or above the best ask fills instead of resting", () => {
    expect(crossesMarket(m, 101, "bid")).toBe(true);
    expect(crossesMarket(m, 100.5, "bid")).toBe(false);
  });

  it("a sell at or below the best bid fills instead of resting", () => {
    expect(crossesMarket(m, 99, "ask")).toBe(true);
    expect(crossesMarket(m, 99.5, "ask")).toBe(false);
  });
});

describe("stopBand", () => {
  it("returns a directed band with the verb the caption uses", () => {
    expect(stopBand(105, 108, "bid")).toEqual({ from: 105, to: 108, verb: "Buy until", valid: true });
    expect(stopBand(95, 92, "ask")).toEqual({ from: 92, to: 95, verb: "Sell until", valid: true });
  });

  it("flags a limit on the wrong side of the trigger — it arms but can never fill", () => {
    expect(stopBand(105, 102, "bid")?.valid).toBe(false);
    expect(stopBand(95, 98, "ask")?.valid).toBe(false);
  });

  it("is null rather than a zero-width band when a price is missing", () => {
    expect(stopBand(0, 100, "bid")).toBeNull();
    expect(stopBand(Number.NaN, 100, "bid")).toBeNull();
  });
});

describe("stepAreaPath", () => {
  const model = buildDepthModel({
    bids: [{ price: 99, size: 2 }],
    asks: [{ price: 101, size: 4 }],
    ranges: [],
    mid: 100,
    window: 0.5,
    unit: "base",
    unitSymbol: "ETH",
  })!;
  const opts = { model, plotW: 200, plotH: 100, x0: 0, y0: 100, layer: "book" as const };

  it("starts at mid on the baseline and closes back to it", () => {
    const d = stepAreaPath(model.asks, opts);
    expect(d.startsWith("M100,100")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("steps rather than sloping — a corner at the level, never a diagonal between prices", () => {
    const d = stepAreaPath(model.asks, opts);
    // window is +-50% of mid=100, so lo=50 hi=150: price 101 -> x = (101-50)/100*200 = 102.
    // Horizontal to the level at the OLD height, then vertical to the new one.
    expect(d).toContain("L102,100 L102,");
  });

  it("is empty for a side with no levels, so nothing is drawn at all", () => {
    expect(stepAreaPath([], opts)).toBe("");
  });
});

describe("fitWindow", () => {
  const bids = [{ price: 1634, size: 1 }, { price: 1610, size: 1 }];
  const asks = [{ price: 1636, size: 1 }, { price: 1660, size: 1 }];

  it("fits the book instead of assuming a width", () => {
    const w = fitWindow({ bids, asks, mid: 1635 });
    // furthest is 1610, 1.53% away; padded by 25%.
    expect(w).toBeCloseTo((25 / 1635) * 1.25, 5);
    // and that is dramatically tighter than the ±50% fetch window
    expect(w).toBeLessThan(0.05);
  });

  it("keeps a marker on-frame — an order at the edge cannot be placed", () => {
    const w = fitWindow({ bids, asks, mid: 1635, marks: [1400] });
    expect(1635 * (1 - w)).toBeLessThan(1400);
  });

  it("clamps a lone far-out level so it cannot flatten everything near mid", () => {
    expect(fitWindow({ bids: [{ price: 10, size: 1 }], asks: [], mid: 1635, max: 0.5 })).toBe(0.5);
  });

  it("falls back to the floor when there is nothing to fit", () => {
    expect(fitWindow({ bids: [], asks: [], mid: 1635 })).toBe(0.01);
    expect(fitWindow({ bids, asks, mid: 0 })).toBe(0.01);
  });
});

describe("depthStepFor", () => {
  // The trap this exists for: too fine a step returns an EMPTY side, not a
  // finer one. Verified live against RISE ETH/USDC at 2,000 — step 0.01
  // returned zero bids while step 10 returned both.
  it("gives ETH/USDC at 2,000 a step that keeps both bids", () => {
    expect(depthStepFor(2000)).toBe("10");
  });

  it("never returns exponent notation, which would reach the URL", () => {
    for (const price of [1e-9, 1e-6, 0.0001, 0.5, 1, 1e12, 1e30]) {
      expect(depthStepFor(price)).not.toMatch(/e/i);
    }
  });

  it("falls back to a coarse step rather than a fine one when there is no price", () => {
    // Too coarse merges levels; too fine hides them. Only one of those is
    // indistinguishable from an empty book.
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(depthStepFor(price)).toBe("1");
    }
  });

  it("agrees with the terminal's getDefaultScale over the same scale ladder", () => {
    // Two surfaces disagreeing about a market's depth is the failure this
    // pins. getDefaultScale picks the first scale strictly greater than
    // price/1000; depthStepFor computes the same number without the array.
    const scales = ["0.0001", "0.001", "0.01", "0.1", "1", "10", "100", "1000", "10000"];
    const getDefaultScale = (price: number) =>
      scales.find((s) => price / 1000 < Number(s)) ?? scales[0];

    for (const price of [0.5, 1, 12, 99, 100, 1000, 2000, 50_000, 999_999]) {
      expect(depthStepFor(price)).toBe(getDefaultScale(price));
    }
  });
});
