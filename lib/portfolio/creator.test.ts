import { describe, it, expect } from "vitest";
import {
  amountCompact,
  canEditMetadata,
  canGraduateFeeTier,
  canSetTakerFee,
  feeControlBlockedBy,
  feeTierProgressPct,
  feeTierState,
  formatTakerFee,
  canGraduate,
  changeTone,
  creatorSummary,
  formatChange,
  formatMarketCap,
  formatRate,
  graduationHelp,
  graduationProgressPct,
  graduationState,
  supplySplit,
  usdCompact,
} from "./creator";
import { indexerData } from "./mock";
import type { CreatorToken } from "./types";

const base: CreatorToken = {
  symbol: "NOVA",
  name: "Nova Protocol",
  address: "0x8Fd2A1c5B7e3D40912Ab6F8c11d4E7a09B3c19aC",
  network: "RISE Testnet",
  quote: "USDC",
  rate: "0.0412",
  change24hPct: 18.4,
  marketCapUsd: 4_120_000,
  holders: 312,
  volume24hUsd: 84210,
  totalSupply: "100,000,000",
  poolAmount: "42,000,000",
  creatorAmount: "58,000,000",
  poolPct: 42,
  soldAmount: "7,180,000",
  soldPct: 17,
  inRange: true,
  rangeLow: "0.0400",
  rangeHigh: "0.1200",
  feeTierPct: 0.3,
  feesEarnedUsd: 126.4,
  seededUsd: 11400,
  deployedAt: "26 Jul 2026 · 14:02",
  age: "6d",
  txHash: "0x4c1e…8a70",
  logoPending: false,
  metaClaimed: false,
  pairId: "0x7f3a1c9d0e5b2a48f6c3d19e740b52ac8d61f309",
  quoteTvlUsd: 41_200,
  thresholdUsd: 100_000,
  graduatedAt: null,
  graduatedAtQuoteTvlUsd: null,
  contractMarketCapUsd: 4_050_000,
  graduationUsd: 69_420,
  feeGraduated: false,
  takerFeeNum: 1_000_000,
  maxCreatorTakerFeeNum: 1_000_000,
  creatorFeeLocked: false,
};

describe("formatRate", () => {
  it("writes a rate, never a dollar price", () => {
    expect(formatRate(base)).toBe("1 NOVA = 0.0412 USDC");
    expect(formatRate(base)).not.toContain("$");
  });

  it("denominates in the launch market's quote, not USD", () => {
    expect(formatRate({ ...base, quote: "MON", rate: "0.9" })).toBe("1 NOVA = 0.9 MON");
  });
});

describe("formatChange", () => {
  it("renders an em-dash when there is no prior price", () => {
    expect(formatChange(null)).toBe("—");
    expect(changeTone(null)).toBe("flat");
  });

  it("signs both directions with a real minus", () => {
    expect(formatChange(18.4)).toBe("+18.4%");
    expect(formatChange(-4.2)).toBe("−4.2%");
    expect(changeTone(18.4)).toBe("up");
    expect(changeTone(-4.2)).toBe("down");
  });

  it("treats an exact zero as flat, not as a gain", () => {
    expect(formatChange(0)).toBe("0.0%");
    expect(changeTone(0)).toBe("flat");
  });
});

describe("formatMarketCap", () => {
  it("prints compact USD, matching the token tables", () => {
    expect(formatMarketCap(4_120_000)).toBe("$4.1M");
    expect(formatMarketCap(850_000)).toBe("$850.0K");
  });

  /**
   * A token with no price has an unknown market cap — spotTokens.marketCap is
   * NULL, because it is generated from priceUSD. `$0` would read as measured.
   */
  it("dashes when the indexer has no price yet", () => {
    expect(formatMarketCap(null)).toBe("—");
    expect(formatMarketCap(Number.NaN)).toBe("—");
  });
});

describe("supplySplit", () => {
  it("gives the creator the remainder", () => {
    expect(supplySplit({ poolPct: 42 })).toEqual({ pool: 42, creator: 58 });
  });

  it("clamps, so a bad value can never draw a bar wider than the track", () => {
    expect(supplySplit({ poolPct: 140 })).toEqual({ pool: 100, creator: 0 });
    expect(supplySplit({ poolPct: -5 })).toEqual({ pool: 0, creator: 100 });
  });
});

describe("creatorSummary", () => {
  it("sums across chains — the panel is cross-chain like every other tab", () => {
    const s = creatorSummary([base, { ...base, network: "Monad Testnet", holders: 47, seededUsd: 3200, feesEarnedUsd: 4.1 }]);
    expect(s).toEqual({ launched: 2, seededUsd: 14600, feesEarnedUsd: 130.5, holders: 359 });
  });

  it("is all zeroes rather than NaN when there is nothing", () => {
    expect(creatorSummary([])).toEqual({ launched: 0, seededUsd: 0, feesEarnedUsd: 0, holders: 0 });
  });
});

describe("canEditMetadata", () => {
  /**
   * Pins the blocker. adminTokenMeta has no ownerAddress column, so the server
   * accepts metadata writes only from the operator key — a live edit control
   * would offer a capability the server refuses. Flip this test when the
   * draft → claim write lands, not before.
   */
  it("is false for every mocked token, because no wallet can claim one yet", () => {
    expect(indexerData().creator.every((t) => !canEditMetadata(t))).toBe(true);
  });

  it("opens up once a token is claimed", () => {
    expect(canEditMetadata({ metaClaimed: true })).toBe(true);
  });
});

describe("the creator mock", () => {
  const rows = indexerData().creator;

  it("keeps every rate free of a currency symbol", () => {
    for (const t of rows) expect(t.rate).not.toMatch(/[$€]/);
  });

  it("splits supply into pool + creator with nothing unaccounted for", () => {
    for (const t of rows) {
      const { pool, creator } = supplySplit(t);
      expect(pool + creator).toBe(100);
    }
  });

  it("carries a checksummed address per row", () => {
    for (const t of rows) expect(t.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("has a market cap on every row, since each has a price", () => {
    for (const t of rows) expect(t.marketCapUsd).toBeGreaterThan(0);
  });
});

/* ─────────────────────────── graduation ─────────────────────────── */

const below = { quoteTvlUsd: 41_200, thresholdUsd: 100_000, graduatedAt: null, graduatedAtQuoteTvlUsd: null };
const eligible = { ...below, quoteTvlUsd: 104_900 };
const graduated = {
  quoteTvlUsd: 83_100,
  thresholdUsd: 100_000,
  graduatedAt: 1_785_398_400,
  graduatedAtQuoteTvlUsd: 101_400,
};

describe("graduationState", () => {
  it("is 'below' while the quote side is short", () => {
    expect(graduationState(below)).toBe("below");
  });

  it("is 'eligible' at exactly the threshold, not one dollar above", () => {
    expect(graduationState({ ...below, quoteTvlUsd: 100_000 })).toBe("eligible");
  });

  it("stays 'graduated' after liquidity falls back below the threshold", () => {
    // The latch. A graduated market never returns to 'below' — reporting it
    // that way would read as a pending de-listing, which cannot happen.
    expect(graduationState(graduated)).toBe("graduated");
  });
});

describe("canGraduate", () => {
  it("is false below the threshold, because the server would refuse", () => {
    // The control is still RENDERED — disabled, not hidden, same call as the
    // struck-through approval row. It just must not be clickable.
    expect(canGraduate(below)).toBe(false);
  });

  it("is true once the threshold is met", () => {
    expect(canGraduate(eligible)).toBe(true);
  });

  it("is false once graduated — there is nothing left to ask for", () => {
    expect(canGraduate(graduated)).toBe(false);
  });
});

describe("graduationProgressPct", () => {
  it("clamps over-funded markets to 100 so the bar cannot overflow", () => {
    expect(graduationProgressPct(eligible)).toBe(100);
  });

  it("reports the fraction below", () => {
    expect(graduationProgressPct(below)).toBeCloseTo(41.2, 6);
  });

  it("treats a zero threshold as met rather than dividing to Infinity", () => {
    expect(graduationProgressPct({ ...below, thresholdUsd: 0 })).toBe(100);
  });
});

describe("graduationHelp", () => {
  it("names the shortfall while below", () => {
    expect(graduationHelp("NOVA", below)).toContain("$58.8K to go");
  });

  it("reports what a graduated market graduated AT, not where it is now", () => {
    const help = graduationHelp("HALO", graduated);
    expect(help).toContain("$101.4K");
    expect(help).not.toContain("$83.1K");
  });

  it("says a graduated market stays listed if liquidity falls", () => {
    expect(graduationHelp("HALO", graduated)).toMatch(/stays listed even if liquidity falls/i);
  });

  it("tells an eligible market it will list on its own anyway", () => {
    // The button is a shortcut, not the only path — the sweep gets there too.
    expect(graduationHelp("ORBIT", eligible)).toMatch(/on its own/i);
  });
});

describe("usdCompact", () => {
  it("has a billions branch, so 2.5e9 is not printed as $2500.00M", () => {
    // It stopped at millions. A graduation threshold never reaches that, but
    // `amountCompact` sends every USD figure through here and a market cap does.
    expect(usdCompact(2_500_000_000)).toBe("$2.50B");
    expect(usdCompact(-2_500_000_000)).toBe("$-2.50B");
  });

  it("compacts thousands and millions", () => {
    expect(usdCompact(41_200)).toBe("$41.2K");
    expect(usdCompact(4_120_000)).toBe("$4.12M");
  });

  it("renders a non-finite value as an em-dash, never $NaN", () => {
    expect(usdCompact(Number.NaN)).toBe("—");
  });
});

describe("the mock covers every graduation state", () => {
  it("has one row in each of below / eligible / graduated", () => {
    // The three-state control is only exercisable in dev if the mock supplies
    // all three; a mock with three identical rows hides two thirds of the UI.
    const states = indexerData().creator.map(graduationState).sort();
    expect(states).toEqual(["below", "eligible", "graduated"]);
  });

  it("gives every row the pair id the graduate endpoint takes", () => {
    for (const t of indexerData().creator) {
      expect(t.pairId).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });
});

/* ─────────────── fee tier: the contract's graduation ─────────────── */

const feeInfo = {
  contractMarketCapUsd: base.contractMarketCapUsd,
  graduationUsd: base.graduationUsd,
  feeGraduated: base.feeGraduated,
  takerFeeNum: base.takerFeeNum,
  maxCreatorTakerFeeNum: base.maxCreatorTakerFeeNum,
  creatorFeeLocked: base.creatorFeeLocked,
};

describe("formatTakerFee", () => {
  it("renders the contract's 1e8 numerator as a percent", () => {
    expect(formatTakerFee(1_000_000)).toBe("1.00%");
    expect(formatTakerFee(100_000)).toBe("0.10%");
    expect(formatTakerFee(0)).toBe("0.00%");
  });
});

describe("feeTierState", () => {
  it("is eligible once the CONTRACT's market cap clears the requirement", () => {
    expect(feeTierState(feeInfo)).toBe("eligible");
    expect(canGraduateFeeTier(feeInfo)).toBe(true);
  });

  it("is starting below it", () => {
    expect(feeTierState({ ...feeInfo, contractMarketCapUsd: 41_000 })).toBe("starting");
  });

  /** usdValueOf reverts for an unpriced coin; a null must not read as eligible. */
  it("is starting, never eligible, when the coin has no price", () => {
    const unpriced = { ...feeInfo, contractMarketCapUsd: null };
    expect(feeTierState(unpriced)).toBe("starting");
    expect(canGraduateFeeTier(unpriced)).toBe(false);
    expect(feeTierProgressPct(unpriced)).toBe(0);
  });

  /** graduationUsd of 0 makes graduate() revert GraduationRequirementNotSet. */
  it("is never eligible while Iter has not set a requirement", () => {
    expect(canGraduateFeeTier({ ...feeInfo, graduationUsd: 0 })).toBe(false);
    expect(feeTierProgressPct({ ...feeInfo, graduationUsd: 0 })).toBe(0);
  });

  it("stays graduated regardless of what the market cap does afterwards", () => {
    const dropped = { ...feeInfo, feeGraduated: true, contractMarketCapUsd: 1 };
    expect(feeTierState(dropped)).toBe("graduated");
  });
});

describe("feeControlBlockedBy", () => {
  it("blocks the creator until the coin graduates", () => {
    expect(feeControlBlockedBy(feeInfo)).toBe("not-graduated");
    expect(canSetTakerFee(feeInfo)).toBe(false);
  });

  it("opens up after graduation", () => {
    const graduated = { ...feeInfo, feeGraduated: true, takerFeeNum: 100_000 };
    expect(feeControlBlockedBy(graduated)).toBeNull();
    expect(canSetTakerFee(graduated)).toBe(true);
  });

  it("stays blocked when an operator paused the control", () => {
    const locked = { ...feeInfo, feeGraduated: true, creatorFeeLocked: true };
    expect(feeControlBlockedBy(locked)).toBe("locked");
  });

  /** A zero cap is how the feature is disabled venue-wide. A slider would be a lie. */
  it("reports no headroom when the cap is zero and the fee already is", () => {
    const capped = { ...feeInfo, feeGraduated: true, maxCreatorTakerFeeNum: 0, takerFeeNum: 0 };
    expect(feeControlBlockedBy(capped)).toBe("no-headroom");
  });

  it("still allows the one move DOWN to zero when the cap is zero", () => {
    const capped = { ...feeInfo, feeGraduated: true, maxCreatorTakerFeeNum: 0, takerFeeNum: 100_000 };
    expect(feeControlBlockedBy(capped)).toBeNull();
  });
});

describe("the two graduations are separate", () => {
  /**
   * The whole reason these live in different helpers. A coin listed on quote TVL has not
   * necessarily graduated on market cap, and vice versa — reading one off the other is
   * how a UI promises a fee drop that never happened.
   */
  it("listing state and fee-tier state do not imply each other", () => {
    const listedNotGraduated = { ...base, graduatedAt: 1_785_600_000, feeGraduated: false };
    expect(graduationState(listedNotGraduated)).toBe("graduated");
    expect(feeTierState(listedNotGraduated)).toBe("eligible");

    const graduatedNotListed = { ...base, graduatedAt: null, quoteTvlUsd: 0, feeGraduated: true };
    expect(graduationState(graduatedNotListed)).toBe("below");
    expect(feeTierState(graduatedNotListed)).toBe("graduated");
  });
});

/**
 * The two bases. A market graded on an amount of its quote asset must never be
 * read through the USD figures: the button below the bar is enabled exactly
 * when the server would act, so a USD reading either offers a creator a button
 * the server then refuses, or shows 40% while the sweep lists them.
 */
describe("graduation on a per-quote amount", () => {
  const quoteBased = {
    // Deliberately contradictory: the USD figures say "listed five times over",
    // the quote figures say "40% of the way". Only the second decides.
    quoteTvlUsd: 500_000,
    thresholdUsd: 100_000,
    basis: "quote" as const,
    unit: "USDC",
    amount: 40_000,
    required: 100_000,
    graduatedAt: null,
    graduatedAtQuoteTvlUsd: null,
  };

  it("reads the state from the quote amount, not the USD figure", () => {
    expect(graduationState(quoteBased)).toBe("below");
    expect(canGraduate(quoteBased)).toBe(false);
  });

  it("draws the bar from the quote amount", () => {
    expect(graduationProgressPct(quoteBased)).toBe(40);
  });

  it("names the shortfall in the quote asset, never in dollars", () => {
    const help = graduationHelp("PEPE", quoteBased);
    expect(help).toContain("60,000 USDC");
    expect(help).not.toContain("$");
  });

  it("lists on the quote amount even when the USD figure is far below", () => {
    // The mirror image, and the reason the USD fields are reporting-only: this
    // market holds every USDC it was asked for while the price feed says it is
    // worth $12.
    const met = { ...quoteBased, amount: 100_000, quoteTvlUsd: 12 };
    expect(graduationState(met)).toBe("eligible");
    expect(graduationProgressPct(met)).toBe(100);
  });

  it("reports what it graduated ON, in that unit", () => {
    const grad = {
      ...quoteBased,
      graduatedAt: 1_785_398_400,
      graduatedAtQuoteTvlUsd: 99_997,
      graduatedAtAmount: 100_000,
      graduatedAtUnit: "USDC",
    };
    expect(graduationHelp("PEPE", grad)).toContain("100,000 USDC");
  });

  it("falls back to USD when no basis is given", () => {
    // An admin-service deployed before per-quote amounts existed sends no
    // basis, and USD is what it genuinely grades on — a correct reading, not a
    // guess.
    expect(graduationState(below)).toBe("below");
    expect(graduationProgressPct({ ...below, basis: undefined })).toBeCloseTo(41.2);
  });

  it("ignores a quote basis that arrives without its figures", () => {
    // A half-populated payload must not divide by an undefined requirement.
    const partial = { ...below, basis: "quote" as const, unit: "USDC" };
    expect(graduationProgressPct(partial)).toBeCloseTo(41.2);
  });
});

describe("amountCompact", () => {
  it("never puts a dollar sign on a quote amount", () => {
    expect(amountCompact(30, "WETH")).toBe("30 WETH");
  });

  it("keeps the digits that distinguish 0.5 from 0.05", () => {
    expect(amountCompact(0.05, "WBTC")).toBe("0.05 WBTC");
  });

  it("uses the compact USD form for USD", () => {
    expect(amountCompact(100_000, "USD")).toBe("$100.0K");
  });
});
