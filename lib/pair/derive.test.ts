import { describe, expect, it } from "vitest";
import {
  withPoolQuotes,
  bookState,
  bookStateNote,
  depthAnchor,
  depthCurveSide,
  depthWithin,
  formatPct,
  cumulativePoolQuote,
  levelWidthPct,
  midPrice,
  midReadout,
  poolDepthWithin,
  poolSideInventory,
  poolTvlUsd,
  spreadPct,
} from "./derive";
import type { PoolBand } from "./derive";
import type { BookLevel, PairSnapshot } from "./types";

/*
 * Ladder fixtures, moved here when lib/pair/mock.ts was deleted on 2026-08-08.
 *
 * They were the mock's, and the mock existed to feed the UI — once the profile
 * went live the module had no consumer but this file. Leaving it in lib/ as an
 * importable "mock snapshot" is how a component quietly picks it up again and
 * the page silently goes back to fabricated depth. Test data belongs with the
 * test.
 *
 * Deterministic, not random: a helper under test cannot be pinned against
 * numbers that change per run.
 */
function ladder(
  mid: number,
  side: "bid" | "ask",
  levels: number,
  sizeAt: (i: number) => number,
): BookLevel[] {
  const out: BookLevel[] = [];
  let cumulative = 0;
  for (let i = 0; i < levels; i++) {
    // 0.15% per step, walking away from the mid.
    const step = mid * 0.0015 * (i + 1);
    const price = side === "bid" ? mid - step : mid + step;
    const size = sizeAt(i);
    cumulative += size;
    out.push({ price, size, cumulative });
  }
  return out;
}

const PROVENANCE = { book: true, trades: true, liquidity: true };

function twoSidedSnapshot(rate: number): PairSnapshot {
  const bids = ladder(rate, "bid", 8, (i) => 4 + i * 2.5);
  const asks = ladder(rate, "ask", 8, (i) => 3 + i * 3.1);
  return {
    bestBid: bids[0]?.price ?? null,
    bestAsk: asks[0]?.price ?? null,
    bids,
    asks,
    depthUpUsd: null,
    depthDownUsd: null,
    trades: [],
    lpAprPct: 14.2,
    lpTvlUsd: 1_204_000,
    accruedFees24hQuote: null,
    yourPositionUsd: null,
    yourBands: null,
    yourPositionCount: 0,
    yourFeesUsd: null,
    provenance: PROVENANCE,
  };
}

/** A market nobody has quoted the far side of — the state a fresh launch is actually in. */
function oneSidedSnapshot(rate: number): PairSnapshot {
  const asks = ladder(rate, "ask", 5, (i) => 120_000 + i * 40_000);
  return {
    bestBid: null,
    bestAsk: asks[0]?.price ?? null,
    bids: [],
    asks,
    depthUpUsd: null,
    depthDownUsd: null,
    trades: [],
    lpAprPct: null,
    lpTvlUsd: 104_000,
    accruedFees24hQuote: null,
    yourPositionUsd: null,
    yourBands: null,
    yourPositionCount: 0,
    yourFeesUsd: null,
    provenance: PROVENANCE,
  };
}


const NOW = 1_785_600_000;
const snapshot = twoSidedSnapshot(1_635);

const empty: PairSnapshot = {
  bestBid: null,
  bestAsk: null,
  bids: [],
  asks: [],
  depthUpUsd: null,
  depthDownUsd: null,
  trades: [],
  lpAprPct: null,
  lpTvlUsd: null,
  accruedFees24hQuote: null,
  yourPositionUsd: null,
    yourBands: null,
    yourPositionCount: 0,
    yourFeesUsd: null,
  provenance: { book: true, trades: true, liquidity: true },
};

describe("midPrice", () => {
  it("is the midpoint of a two-sided book", () => {
    expect(midPrice({ bestBid: 100, bestAsk: 102 })).toBe(101);
  });

  /**
   * The load-bearing case. Taking the one resting side as the mid would report a spread
   * of zero — a market nobody can trade described as the tightest on the venue.
   */
  it("is null on a one-sided book", () => {
    expect(midPrice({ bestBid: null, bestAsk: 102 })).toBeNull();
    expect(midPrice({ bestBid: 100, bestAsk: null })).toBeNull();
  });
});

describe("spreadPct", () => {
  it("measures against the mid, not against either side", () => {
    // bid 99, ask 101, mid 100 → 2%
    expect(spreadPct({ bestBid: 99, bestAsk: 101 })).toBeCloseTo(2, 10);
  });

  it("is null rather than zero when there is no two-sided book", () => {
    expect(spreadPct({ bestBid: null, bestAsk: 101 })).toBeNull();
    expect(spreadPct(empty)).toBeNull();
    expect(formatPct(spreadPct(empty))).toBe("—");
  });
});

describe("depthWithin", () => {
  const mid = 1_635;

  it("counts quote notional inside the band and stops at the edge", () => {
    const inside = depthWithin(
      [
        { price: mid * 1.001, size: 2, cumulative: 2 },
        { price: mid * 1.019, size: 1, cumulative: 3 },
        { price: mid * 1.05, size: 100, cumulative: 103 },
      ],
      mid,
      2,
    );
    // the 5% level is excluded entirely, not counted partially
    expect(inside).toBeCloseTo(mid * 1.001 * 2 + mid * 1.019 * 1, 6);
  });

  it("is null without a mid, and zero for an empty side", () => {
    expect(depthWithin([], null, 2)).toBeNull();
    expect(depthWithin([], mid, 2)).toBe(0);
  });

  it("agrees with the mock's own ladder", () => {
    const mid2 = midPrice(snapshot);
    expect(mid2).not.toBeNull();
    const up = depthWithin(snapshot.asks, mid2, 2);
    const down = depthWithin(snapshot.bids, mid2, 2);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });
});

describe("levelWidthPct", () => {
  it("scales against the deepest level shown, and clamps", () => {
    const levels: BookLevel[] = snapshot.bids;
    const widths = levels.map((l) => levelWidthPct(l, levels));
    expect(Math.max(...widths)).toBe(100);
    expect(Math.min(...widths)).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeLessThanOrEqual(100);
  });

  it("is zero rather than NaN when nothing is resting", () => {
    expect(levelWidthPct({ price: 1, size: 0, cumulative: 0 }, [])).toBe(0);
  });
});

describe("bookState", () => {
  it("names the three shapes", () => {
    expect(bookState(snapshot)).toBe("two-sided");
    expect(bookState(oneSidedSnapshot(0.04))).toBe("one-sided");
    expect(bookState(empty)).toBe("empty");
  });

  /**
   * A fresh launch is one-sided by construction — the creator seeded a single-sided
   * range and nobody has quoted back. The profile explains that rather than rendering
   * a page of dashes.
   */
  it("explains the thin cases and stays quiet on a healthy book", () => {
    expect(bookStateNote("one-sided", "NOVA/WETH")).toContain("one side only");
    expect(bookStateNote("empty", "NOVA/WETH")).toContain("no resting orders");
    expect(bookStateNote("two-sided", "ETH/USDC")).toBeNull();
  });
});

describe("formatPct", () => {
  it("dashes on null so a missing spread never reads as a measured zero", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(0.4235)).toBe("0.42%");
    expect(formatPct(14.2, 1)).toBe("14.2%");
  });
});

describe("formatPct below 1", () => {
  /*
   * The venue-wide rule for a figure below 1 and above 0. It reaches percentages
   * through pool APR: a band pool holding launch-scale liquidity against testnet
   * volume earns 0.0004%, which `toFixed(1)` renders as "0.0%" — a yield
   * judgement on a pool that is in fact earning.
   */
  it("uses subscript-zero notation rather than rounding a real yield to 0.0%", () => {
    expect(formatPct(0.000414, 1)).toBe("0.0\u2083414%");
  });

  it("leaves the normal range on the caller's digits", () => {
    expect(formatPct(18.25, 1)).toBe("18.3%");
    expect(formatPct(0.42)).toBe("0.42%");
  });

  it("keeps a sub-1 negative signed", () => {
    expect(formatPct(-0.000414, 1)).toBe("-0.0\u2083414%");
  });

  it("still says em-dash for null", () => {
    expect(formatPct(null)).toBe("—");
  });
});

describe("depthAnchor", () => {
  it("prefers the mid when the book has two sides", () => {
    expect(depthAnchor({ bestBid: 99, bestAsk: 101 }, 1234)).toBe(100);
  });

  /*
   * The bug this exists for. A one-sided book has no mid, `depthWithin` refuses
   * a null anchor, and BOTH depth figures rendered an em-dash — including the
   * side that was holding real resting orders, on a market whose header was at
   * that moment printing a perfectly good rate.
   */
  it("falls back to the market rate when one side is missing", () => {
    expect(depthAnchor({ bestBid: 0.99, bestAsk: null }, 1.0002)).toBe(1.0002);
    expect(depthAnchor({ bestBid: null, bestAsk: 1.01 }, 1.0002)).toBe(1.0002);
  });

  it("falls back on an empty book too", () => {
    expect(depthAnchor({ bestBid: null, bestAsk: null }, 2.5)).toBe(2.5);
  });

  /* A dash is honest when there is no usable price anywhere. */
  it("is null when the fallback is missing or unusable", () => {
    expect(depthAnchor({ bestBid: null, bestAsk: null }, null)).toBeNull();
    expect(depthAnchor({ bestBid: null, bestAsk: null }, 0)).toBeNull();
    expect(depthAnchor({ bestBid: null, bestAsk: null }, Number.NaN)).toBeNull();
    expect(depthAnchor({ bestBid: null, bestAsk: null }, -3)).toBeNull();
  });

  it("gives the resting side a real figure where the mid gave a dash", () => {
    const bids: BookLevel[] = [{ price: 0.99, size: 2.015113, cumulative: 2.015113 }];
    // What the page did before: anchored on the mid, which is null here.
    expect(depthWithin(bids, midPrice({ bestBid: 0.99, bestAsk: null }), 2)).toBeNull();
    // What it does now.
    const anchor = depthAnchor({ bestBid: 0.99, bestAsk: null }, 1.0002);
    expect(depthWithin(bids, anchor, 2)).toBeCloseTo(0.99 * 2.015113, 9);
    // And the unquoted side reads zero rather than unknown, which is true.
    expect(depthWithin([], anchor, 2)).toBe(0);
  });
});

describe("bookStateNote", () => {
  /*
   * The copy is pinned because it makes a CLAIM about behaviour — that depth is
   * measured from the market rate — and a sentence like that outlives the code
   * it describes unless something fails when they part ways.
   */
  it("tells a one-sided market where its depth figures come from", () => {
    const note = bookStateNote("one-sided", "VFVHFK/USDC");
    expect(note).toContain("measured from the market rate");
    expect(note).toContain("no spread");
  });

  it("says an empty book is zero depth, not unknown depth", () => {
    expect(bookStateNote("empty", "X/USDC")).toContain("both depth figures are zero");
  });

  it("says nothing when the book has two sides", () => {
    expect(bookStateNote("two-sided", "X/USDC")).toBeNull();
  });
});

/*
 * The live band from Arc's TITER/USDC pool, read through `/api/liquidity/ranges` on
 * 2026-09-21. A real band is ±0.02% wide around a spot of 1.0210236 — four
 * hundred times narrower than the ±2% window the profile measures depth over — so
 * it is the fixture that catches a fraction-vs-whole error: anything that treats
 * the overlap as a slice of the WINDOW rather than a slice of the BAND reports a
 * fraction of a percent of the real inventory.
 */
const TITER_BAND: PoolBand = {
  minPrice: 1.02081939528,
  maxPrice: 1.0212278047199999,
  baseAmount: 996.854453,
  quoteAmount: 3.509024,
};
const TITER_MID = 1.0210236;

/**
 * Walked to its own edge, a side reaches its WHOLE leg — the quote is spent
 * between the band's floor and the mid, the base between the mid and its
 * ceiling, so neither is charged for the half of the band it never trades over.
 * That is what makes these agree with `poolSideInventory`, and with the
 * order-book ladder that renders it.
 */
const TITER_BID_LEG = TITER_BAND.quoteAmount;
const TITER_ASK_LEG = TITER_BAND.baseAmount * ((TITER_MID + TITER_BAND.maxPrice) / 2);

describe("poolDepthWithin", () => {
  it("counts a band that sits entirely inside the window, whole — one LEG per side", () => {
    const up = poolDepthWithin([TITER_BAND], TITER_MID, 2, "ask")!;
    const down = poolDepthWithin([TITER_BAND], TITER_MID, 2, "bid")!;
    /*
     * The band is 0.04% wide and the window ±2%, so every unit of it is inside one
     * side or the other. What each side gets is its OWN leg, whole: an ask fills
     * from base, a bid from quote.
     *
     * This used to assert `up + down === base x mid + quote`, and that sum is the
     * bug — it counts each leg on both sides. On Arc's TITER/USDC it reported
     * $13.09 of bid depth against a real $7.48, the difference being the base leg
     * a falling price cannot spend.
     */
    expect(up).toBeCloseTo(TITER_ASK_LEG, 6);
    expect(down).toBeCloseTo(TITER_BID_LEG, 6);
    // Still the band's real size, not the ~0.1 a window-relative fraction would give.
    expect(up).toBeGreaterThan(500);
    // And explicitly NOT the old invariant, which is the shape of the bug.
    expect(up + down).not.toBeCloseTo(TITER_BAND.baseAmount * TITER_MID + TITER_BAND.quoteAmount, 2);
  });

  it("splits a straddling band by side rather than counting it twice", () => {
    const band: PoolBand = { minPrice: 90, maxPrice: 110, baseAmount: 0, quoteAmount: 200 };
    const up = poolDepthWithin([band], 100, 50, "ask")!;
    const down = poolDepthWithin([band], 100, 50, "bid")!;
    // Half the band's width lies below the mid, so half its quote leg is bid depth.
    // Its whole quote leg is spent between the band's floor and the mid.
    expect(down).toBeCloseTo(200, 6);
    // And it holds no base, so it is not depth for an ask at any price.
    expect(up).toBe(0);
  });

  it("counts only the overlapping slice when the window cuts the band", () => {
    const band: PoolBand = { minPrice: 100, maxPrice: 120, baseAmount: 2, quoteAmount: 0 };
    // The band sits entirely above the mid, so its base spreads over its whole
    // width; ±10% reaches 110, which is half of it, valued at that half's own
    // rate of 105.
    expect(poolDepthWithin([band], 100, 10, "ask")).toBeCloseTo(1 * 105, 6);
  });

  it("sums overlapping bands, because a wider band is available near spot too", () => {
    const inner: PoolBand = { minPrice: 99, maxPrice: 101, baseAmount: 0, quoteAmount: 10 };
    const outer: PoolBand = { minPrice: 95, maxPrice: 105, baseAmount: 0, quoteAmount: 50 };
    const bid = poolDepthWithin([inner, outer], 100, 5, "bid")!;
    // Each band's whole quote leg is reachable walking down to its floor, and
    // ±5% reaches 95 — past `inner`'s floor of 99 and exactly to `outer`'s.
    // Added, not deduplicated and not max'd.
    expect(bid).toBeCloseTo(10 + 50, 6);
  });

  it("is null without a mid, matching depthWithin", () => {
    expect(poolDepthWithin([TITER_BAND], null, 2, "ask")).toBeNull();
    expect(poolDepthWithin([TITER_BAND], 0, 2, "ask")).toBeNull();
  });

  it("is zero, not null, when the pool exists and holds nothing", () => {
    expect(poolDepthWithin([], 100, 2, "ask")).toBe(0);
  });

  it("ignores a degenerate band rather than dividing by its zero width", () => {
    const flat: PoolBand = { minPrice: 100, maxPrice: 100, baseAmount: 5, quoteAmount: 5 };
    expect(poolDepthWithin([flat], 100, 2, "ask")).toBe(0);
  });
});

describe("cumulativePoolQuote", () => {
  it("grows as the price walks away from the mid and stops at the band edge", () => {
    // Quote-only band BELOW the mid — the interval a falling price spends it
    // over. A band above the mid is never reached walking down, which is the
    // case the next test pins.
    const band: PoolBand = { minPrice: 90, maxPrice: 100, baseAmount: 0, quoteAmount: 100 };
    expect(cumulativePoolQuote([band], 100, 97.5, "bid")).toBeCloseTo(25, 6);
    expect(cumulativePoolQuote([band], 100, 92.5, "bid")).toBeCloseTo(75, 6);
    // Past the band's own floor there is nothing more to accumulate.
    expect(cumulativePoolQuote([band], 100, 50, "bid")).toBeCloseTo(100, 6);
  });

  /**
   * The rule the depth curve was missing. A pool holding only quote can fill a
   * bid — that is what quote is for — and can fill NO ask at any price. It used
   * to report the quote as ask depth too, so both sides of the chart claimed the
   * same tokens.
   */
  it("does not offer one leg as depth on the side the other leg fills", () => {
    const quoteOnly: PoolBand = { minPrice: 90, maxPrice: 100, baseAmount: 0, quoteAmount: 100 };
    expect(cumulativePoolQuote([quoteOnly], 100, 50, "bid")).toBeCloseTo(100, 6);
    expect(cumulativePoolQuote([quoteOnly], 100, 130, "ask")).toBe(0);

    const baseOnly: PoolBand = { minPrice: 100, maxPrice: 110, baseAmount: 2, quoteAmount: 0 };
    expect(cumulativePoolQuote([baseOnly], 100, 50, "bid")).toBe(0);
    // Valued at the covered interval's own rate, as everything here is.
    expect(cumulativePoolQuote([baseOnly], 100, 130, "ask")).toBeCloseTo(2 * 105, 6);
  });

  /**
   * The disagreement that prompted this: the order-book ladder prints the
   * pool's whole quote leg for the bid side, and the depth curve reported half
   * of it. A band straddling the mid was charging each leg for the half of the
   * band it never trades over, and that half went to neither side.
   */
  it("reaches the SAME total the ladder prints, for a band straddling the mid", () => {
    const straddling: PoolBand = { minPrice: 99, maxPrice: 101, baseAmount: 4, quoteAmount: 60 };
    const ladder = poolSideInventory([straddling], "bid")!;
    expect(cumulativePoolQuote([straddling], 100, 90, "bid")).toBeCloseTo(ladder.amount, 6);
  });

  it("agrees with poolDepthWithin at the window's edge", () => {
    const edge = TITER_MID * 1.02;
    expect(cumulativePoolQuote([TITER_BAND], TITER_MID, edge, "ask")).toBeCloseTo(
      poolDepthWithin([TITER_BAND], TITER_MID, 2, "ask")!,
      6,
    );
  });

  it("is zero at the mid itself", () => {
    expect(cumulativePoolQuote([TITER_BAND], TITER_MID, TITER_MID, "ask")).toBe(0);
  });
});

describe("poolSideInventory", () => {
  it("reports the ask leg as base and the bid leg as quote", () => {
    expect(poolSideInventory([TITER_BAND], "ask")).toEqual({
      amount: TITER_BAND.baseAmount,
      minPrice: TITER_BAND.minPrice,
      maxPrice: TITER_BAND.maxPrice,
    });
    expect(poolSideInventory([TITER_BAND], "bid")?.amount).toBe(TITER_BAND.quoteAmount);
  });

  it("is null when that leg is empty, so the ladder draws no line at all", () => {
    const baseOnly: PoolBand = { minPrice: 1, maxPrice: 2, baseAmount: 10, quoteAmount: 0 };
    expect(poolSideInventory([baseOnly], "bid")).toBeNull();
    expect(poolSideInventory([], "ask")).toBeNull();
  });

  it("spans every contributing band, not just the first", () => {
    const a: PoolBand = { minPrice: 1, maxPrice: 2, baseAmount: 10, quoteAmount: 1 };
    const b: PoolBand = { minPrice: 0.5, maxPrice: 3, baseAmount: 5, quoteAmount: 1 };
    expect(poolSideInventory([a, b], "ask")).toEqual({ amount: 15, minPrice: 0.5, maxPrice: 3 });
  });
});

describe("poolTvlUsd", () => {
  it("values the pool in quote, then converts once", () => {
    // 996.854453 TITER at 1.0210236 + 3.509024 USDC, all at $1.
    expect(poolTvlUsd(996.854453, 3.509024, 1.0210236, 1)).toBeCloseTo(
      996.854453 * 1.0210236 + 3.509024,
      6,
    );
  });

  it("is null without a quote USD price rather than mislabelling quote as USD", () => {
    expect(poolTvlUsd(100, 100, 1.02, null)).toBeNull();
    expect(poolTvlUsd(100, 100, 1.02, 0)).toBeNull();
  });

  it("is null without a rate, because the base leg cannot be valued", () => {
    expect(poolTvlUsd(100, 100, 0, 1)).toBeNull();
  });
});

/*
 * The gap test, and the two it opens onto.
 *
 * Every figure the pair profile prints about the pool passes through one of the
 * functions below, so "does band liquidity reach the depth chart / the ladder"
 * is answerable here rather than only in a screenshot. The shape that made the
 * bug possible is the one pinned hardest: a band is TIGHT — ±0.02% on Arc — so
 * anything that drops it, rounds it away or bins it into an edge reports a
 * market with no pool on a market that has one.
 */
describe("depthCurveSide — band liquidity reaching the depth chart", () => {
  const ladder: BookLevel[] = [
    { price: 1.05, size: 100, cumulative: 100 },
    { price: 1.1, size: 100, cumulative: 200 },
  ];

  it("carries the pool onto the curve even when the book is empty", () => {
    const samples = depthCurveSide([], [TITER_BAND], TITER_MID, TITER_MID * 1.02, "ask");
    expect(samples.length).toBeGreaterThan(0);
    const deepest = samples.at(-1)!;
    expect(deepest.book).toBe(0);
    // This is the whole regression: a pool-only market used to draw nothing.
    expect(deepest.pool).toBeGreaterThan(0);
    expect(deepest.pool).toBeCloseTo(
      poolDepthWithin([TITER_BAND], TITER_MID, 2, "ask")!,
      6,
    );
  });

  it("samples the band's edges, so a ±0.02% band is not flattened into one step", () => {
    const samples = depthCurveSide([], [TITER_BAND], TITER_MID, TITER_MID * 1.02, "ask");
    const prices = samples.map((s) => s.price);
    // The band's far edge is a bend in the ramp and must be a sample point.
    expect(prices).toContain(TITER_BAND.maxPrice);
    // The pool ramps rather than jumping: a mid-band sample is strictly between.
    const inside = samples.filter((s) => s.price > TITER_MID && s.price < TITER_BAND.maxPrice);
    for (const s of inside) expect(s.pool).toBeLessThan(deepestPool(samples));
  });

  it("keeps the book a staircase and the pool a ramp", () => {
    const samples = depthCurveSide(ladder, [], 1, 1.2, "ask");
    // Two samples share each level's price — the riser of the step.
    const atLevel = samples.filter((s) => s.price === 1.05);
    expect(atLevel).toHaveLength(2);
    expect(atLevel[0]!.book).toBe(0);
    expect(atLevel[1]!.book).toBeCloseTo(1.05 * 100, 6);
  });

  it("is quote notional, not base size — the unit the stats and caption use", () => {
    const samples = depthCurveSide(ladder, [], 1, 1.2, "ask");
    const total = samples.at(-1)!.book;
    // `size x price` per level, exactly as depthWithin sums it — NOT `cumulative`,
    // which would give 200.
    expect(total).toBeCloseTo(1.05 * 100 + 1.1 * 100, 6);
    expect(total).not.toBeCloseTo(200, 1);
  });

  it("agrees with the ±2% stat at the window edge, so chart and caption cannot drift", () => {
    const edge = TITER_MID * 1.02;
    const samples = depthCurveSide(ladder, [TITER_BAND], TITER_MID, edge, "ask");
    const deepest = samples.at(-1)!;
    const stat =
      depthWithin(ladder, TITER_MID, 2)! + poolDepthWithin([TITER_BAND], TITER_MID, 2, "ask")!;
    expect(deepest.book + deepest.pool).toBeCloseTo(stat, 6);
  });

  it("puts a band's quote leg on the bid side and its base leg on the ask side", () => {
    const up = depthCurveSide([], [TITER_BAND], TITER_MID, TITER_MID * 1.02, "ask").at(-1)!;
    const down = depthCurveSide([], [TITER_BAND], TITER_MID, TITER_MID * 0.98, "bid").at(-1)!;
    /*
     * What the test's own name always said, and what it did not check. It
     * asserted that the two sides SUM to the band's total value, which is only
     * true if each leg is counted on both sides — and that is the defect the
     * chart shipped: a pool holding 11.00 base and 14.96 quote drew $13.09 of
     * depth on each side, a suspiciously exact symmetry that was the two legs
     * being averaged rather than assigned.
     */
    expect(up.pool).toBeCloseTo(TITER_ASK_LEG, 6);
    expect(down.pool).toBeCloseTo(TITER_BID_LEG, 6);
  });

  it("draws nothing from a pool that holds nothing, rather than a flat zero ramp", () => {
    const samples = depthCurveSide(ladder, [], 1, 1.2, "ask");
    expect(samples.every((s) => s.pool === 0)).toBe(true);
  });

  it("refuses a curve with no mid to measure from", () => {
    expect(depthCurveSide(ladder, [TITER_BAND], 0, 1.2, "ask")).toEqual([]);
  });
});

function deepestPool(samples: { pool: number }[]): number {
  return samples.reduce((max, s) => Math.max(max, s.pool), 0) + 1e-12;
}

describe("midReadout", () => {
  const book = (bestBid: number | null, bestAsk: number | null) =>
    ({ bestBid, bestAsk }) as Pick<PairSnapshot, "bestBid" | "bestAsk">;

  it("is the MID when both sides are quoted", () => {
    expect(midReadout(book(0.98, 1.02), 1.5)).toEqual({ label: "Mid", value: 1 });
  });

  it("falls back to the MARKET rate on a one-sided book, and says so", () => {
    // The reported bug: nothing resting on the ask side printed an em-dash
    // beside a depth chart centred on the market rate, on a pair whose header
    // showed that rate.
    expect(midReadout(book(0.98, null), 1.02)).toEqual({ label: "Market", value: 1.02 });
    expect(midReadout(book(null, 1.02), 1.02)).toEqual({ label: "Market", value: 1.02 });
  });

  it("falls back on an EMPTY book too", () => {
    expect(midReadout(book(null, null), 1.02)).toEqual({ label: "Market", value: 1.02 });
  });

  it("never calls one side's best quote a mid", () => {
    // Widening `midPrice` instead would report a spread of zero on a market
    // nobody can trade — the mistake its own note warns about.
    expect(midReadout(book(0.98, null), 1.02).value).not.toBe(0.98);
  });

  it("dashes only when there is neither a book nor an indexed rate", () => {
    expect(midReadout(book(null, null), null)).toEqual({ label: "Mid", value: null });
    expect(midReadout(book(null, null), 0)).toEqual({ label: "Mid", value: null });
  });

  it("agrees with depthAnchor, which the figures beside it already use", () => {
    // Chart, depth figures and this readout must be measured from one number.
    const snapshot = book(null, null);
    expect(midReadout(snapshot, 1.02).value).toBe(depthAnchor(snapshot, 1.02));
  });
});

describe("withPoolQuotes", () => {
  // Arc TITER/USDC, 2026-10-04: book 0.98 / 1.02, pool at 1.02 holding both legs.
  const bands = [
    { minPrice: 1.019796, maxPrice: 1.020204, baseAmount: 3.94, quoteAmount: 3.94 },
    { minPrice: 1.01898, maxPrice: 1.02102, baseAmount: 3.94, quoteAmount: 3.94 },
  ] as PoolBand[];

  it("lets the pool's price set the best bid inside the book's spread", () => {
    const q = withPoolQuotes({ bestBid: 0.98, bestAsk: 1.02 }, bands, 1.02);
    expect(q).toEqual({ bestBid: 1.02, bestAsk: 1.02 });
    expect(depthAnchor(q, 1.02)).toBeCloseTo(1.02);
  });

  it("does not quote a leg the pool holds none of", () => {
    const baseOnly = bands.map((b) => ({ ...b, quoteAmount: 0 }));
    expect(withPoolQuotes({ bestBid: 0.98, bestAsk: 1.05 }, baseOnly, 1.02)).toEqual({ bestBid: 0.98, bestAsk: 1.02 });
  });

  it("leaves the book alone with no pool price", () => {
    expect(withPoolQuotes({ bestBid: 0.98, bestAsk: 1.02 }, bands, null)).toEqual({ bestBid: 0.98, bestAsk: 1.02 });
  });
});

describe("depthWithin at the band edge", () => {
  it("counts a level exactly 2% from the mid", () => {
    expect(depthWithin([{ price: 1.02, size: 10, cumulative: 10 }], 1, 2)).toBeCloseTo(10.2);
  });
});
