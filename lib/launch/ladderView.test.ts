import { describe, expect, it } from "vitest";
import { countdown, ladderDisplay, ladderNotches, type Ladder } from "./ladderView";

// USDC launch: $5k → $25k across five geometric steps.
const CAPS = [5_000, 7_478, 11_180, 16_719, 25_000];

function ladder(over: Partial<Ladder> = {}): Ladder {
  return {
    state: "selling",
    stepsSold: 1,
    stepsTotal: 5,
    steps: CAPS.map((c, i) => ({ step: i, marketCapQuote: c, marketCapUsd: c, sold: i < 1 })),
    marketCapQuote: 7_500,
    marketCapUsd: 7_500,
    graduationMarketCap: { quote: 25_000, usd: 25_000 },
    toGraduateQuote: 17_500,
    toGraduateUsd: 17_500,
    progress: 0.3,
    readyAt: null,
    graduatedAt: null,
    poolValueQuote: null,
    poolValueUsd: null,
    quote: { address: "0xq", symbol: "USDC", decimals: 6, priceUsd: 1 },
    ...over,
  };
}

describe("ladderDisplay", () => {
  it("selling: pill names the step on offer, headline is what is left to graduate", () => {
    const d = ladderDisplay(ladder(), 0);
    expect(d.tone).toBe("step");
    expect(d.pill).toBe("step 2 / 5");
    expect(d.headline).toBe("$17.5K to graduate");
    expect(d.detail).toBe("next step at $11.2K (+50%)");
    expect(d.progress).toBe(0.3);
  });

  it("selling on the last step: no next step to name", () => {
    const steps = CAPS.map((c, i) => ({ step: i, marketCapQuote: c, marketCapUsd: c, sold: i < 4 }));
    const d = ladderDisplay(ladder({ steps, stepsSold: 4 }), 0);
    expect(d.pill).toBe("step 5 / 5");
    expect(d.detail).toBe("last step · graduates at $25.0K");
  });

  it("sold out: ready to graduate, full ring", () => {
    const d = ladderDisplay(ladder({ state: "soldOut", stepsSold: 5 }), 0);
    expect(d.pill).toBe("sold out");
    expect(d.headline).toBe("Ready to graduate");
    expect(d.detail).toBe("all 5 steps sold");
    expect(d.progress).toBe(1);
  });

  it("armed: counts down to readyAt, blue", () => {
    const d = ladderDisplay(ladder({ state: "armed", readyAt: 1_000 }), 808);
    expect(d.tone).toBe("armed");
    expect(d.pill).toBe("armed");
    expect(d.headline).toBe("Graduating in 3:12");
    expect(d.detail).toBe("pool opens at $25.0K");
    expect(d.countdownTo).toBe(1_000);
  });

  it("graduated: market cap and locked pool, green", () => {
    const d = ladderDisplay(
      ladder({ state: "graduated", marketCapUsd: 41_200, poolValueUsd: 3_100, progress: 1 }),
      0,
    );
    expect(d.tone).toBe("graduated");
    expect(d.pill).toBe("✓ graduated");
    expect(d.headline).toBe("$41.2K market cap");
    expect(d.detail).toBe("pool $3.1K locked");
  });

  it("an unpriced quote falls back to its own units", () => {
    const d = ladderDisplay(
      ladder({ graduationMarketCap: { quote: 139, usd: null }, toGraduateUsd: null, toGraduateQuote: 97, quote: { address: "0xq", symbol: "NVDA", decimals: 18, priceUsd: null } }),
      0,
    );
    expect(d.headline).toBe("97 NVDA to graduate");
  });
});

describe("ladderNotches", () => {
  it("marks where steps 2–5 start, as fractions of the graduation cap", () => {
    const n = ladderNotches(ladder());
    expect(n).toHaveLength(3);
    expect(n[0]).toBeCloseTo(7_478 / 25_000);
    expect(n[2]).toBeCloseTo(16_719 / 25_000);
  });
});

describe("countdown", () => {
  it("never goes negative", () => {
    expect(countdown(-5)).toBe("0:00");
    expect(countdown(65)).toBe("1:05");
  });
});
