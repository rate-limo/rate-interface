import { describe, expect, it } from "vitest";
import {
  bookState,
  bookStateNote,
  depthWithin,
  formatPct,
  levelWidthPct,
  midPrice,
  spreadPct,
} from "./derive";
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
