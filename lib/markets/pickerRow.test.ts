/**
 * Every case here is a claim the picker makes about a market someone is about
 * to trade. The two that matter most are the listing flag — which must not
 * inherit `pairToResult`'s default — and quote TVL, which is the only column
 * that separates two markets sharing a symbol.
 */
import { describe, expect, it } from "vitest";
import type { SpotPair } from "@/types";
import { chainInitials, quoteTvlUsd, toPickerRow, volumeUsd } from "./pickerRow";

/** A gateway pair, shaped from a real `/api/pairs/all` row. */
const pair = (over: Partial<SpotPair> = {}): SpotPair =>
  ({
    id: "0x0B544430b9a0",
    symbol: "SKHY/ETH",
    baseSymbol: "SKHY",
    quoteSymbol: "ETH",
    base: { symbol: "SKHY" },
    quote: { symbol: "ETH" },
    price: 1,
    dayPriceDifferencePercentage: 0,
    dayQuoteVolumeUSD: 110.46208,
    dayQuoteTvlUSD: 317.15015,
    verified: false,
    ...over,
  }) as unknown as SpotPair;

describe("listing state", () => {
  it("treats an explicit true as listed", () => {
    expect(toPickerRow(pair({ verified: true } as Partial<SpotPair>)).unlisted).toBe(false);
  });

  it("treats false, null and ABSENT as unlisted", () => {
    // The safe reading of "unknown" is "not reviewed". The opposite default
    // would present an unreviewed market as a reviewed one.
    expect(toPickerRow(pair({ verified: false } as Partial<SpotPair>)).unlisted).toBe(true);
    expect(toPickerRow(pair({ verified: null } as unknown as Partial<SpotPair>)).unlisted).toBe(true);
    const { verified, ...withoutFlag } = pair() as Record<string, unknown>;
    expect(toPickerRow(withoutFlag as unknown as SpotPair).unlisted).toBe(true);
  });

  it("does NOT inherit pairToResult's default-to-listed", () => {
    // `pairToResult` does `verified: p.verified ?? true`, correct there because
    // its rows come from the gated routes and are listed by construction. These
    // rows come from the ungated route; the same default would stamp "Listed"
    // on every unreviewed market on the chain.
    const { verified, ...withoutFlag } = pair() as Record<string, unknown>;
    expect(toPickerRow(withoutFlag as unknown as SpotPair).unlisted).not.toBe(false);
  });
});

describe("volumeUsd", () => {
  it("doubles, matching what the terminal renders", () => {
    // PairPriceTracker and SpotPairTable both show dayQuoteVolumeUSD * 2. The
    // picker is one click from them; halving it here puts two volumes for one
    // market on one screen.
    expect(volumeUsd(pair({ dayQuoteVolumeUSD: 125.446594 } as Partial<SpotPair>))).toBeCloseTo(250.893188, 6);
  });

  it("is null for zero and for a non-number, never 0", () => {
    expect(volumeUsd(pair({ dayQuoteVolumeUSD: 0 } as Partial<SpotPair>))).toBeNull();
    expect(volumeUsd(pair({ dayQuoteVolumeUSD: undefined } as unknown as Partial<SpotPair>))).toBeNull();
  });
});

describe("quoteTvlUsd", () => {
  it("reads the quote side", () => {
    expect(quoteTvlUsd(pair({ dayQuoteTvlUSD: 690.8924 } as Partial<SpotPair>))).toBeCloseTo(690.8924, 4);
  });

  it("is null when there is none — PHNX/ETH on RISE today", () => {
    // A real market: $52.19 of volume against zero quote TVL. The row renders
    // an em-dash, which is the honest answer and the reason the two columns are
    // shown separately rather than one being derived from the other.
    expect(quoteTvlUsd(pair({ dayQuoteTvlUSD: 0 } as Partial<SpotPair>))).toBeNull();
  });

  it("is not swapped for base TVL", () => {
    const row = toPickerRow(
      pair({ dayQuoteTvlUSD: 3.47, dayBaseTvlUSD: 999_999 } as unknown as Partial<SpotPair>),
    );
    expect(row.quoteTvlUsd).toBeCloseTo(3.47, 2);
  });
});

describe("changePct", () => {
  it("keeps a real zero rather than blanking it", () => {
    // 0.00% means the market has not moved, which is information. Every RISE
    // market reads exactly this today.
    expect(toPickerRow(pair({ dayPriceDifferencePercentage: 0 } as Partial<SpotPair>)).changePct).toBe(0);
  });

  it("keeps a negative", () => {
    expect(toPickerRow(pair({ dayPriceDifferencePercentage: -6.1 } as Partial<SpotPair>)).changePct).toBeCloseTo(-6.1, 2);
  });

  it("is null only when the value is not a number", () => {
    expect(
      toPickerRow(pair({ dayPriceDifferencePercentage: undefined } as unknown as Partial<SpotPair>)).changePct,
    ).toBeNull();
  });
});

describe("symbols", () => {
  it("prefers the joined token symbol and falls back to the pair's own", () => {
    expect(toPickerRow(pair()).baseSymbol).toBe("SKHY");
    const noJoin = pair({ base: undefined, quote: undefined } as unknown as Partial<SpotPair>);
    expect(toPickerRow(noJoin).baseSymbol).toBe("SKHY");
    expect(toPickerRow(noJoin).quoteSymbol).toBe("ETH");
  });
});

describe("chainInitials", () => {
  it("matches ChainBadge's two-letter rule", () => {
    expect(chainInitials("RISE Testnet")).toBe("RT");
    expect(chainInitials("Arc Testnet")).toBe("AT");
  });

  it("handles a single-word name", () => {
    expect(chainInitials("Arc")).toBe("A");
  });
});
