import { describe, expect, it } from "vitest";
import { formatFeesUsd, lifetimeFeesUsd, vestedFeesUsd } from "./lpFees";

/*
 * Arc's VFVHFK/USDC band pool (0xce74…5981), read on 2026-09-21 through
 * `BandPositionManager.portfolio([2])` on https://rpc.testnet.arc.network and
 * `/api/liquidity/pool/…` on the Arc gateway. Pinned the way
 * `lib/pair/derive.test.ts` pins its live band read: the numbers are small
 * enough that a plausible-looking synthetic fixture would hide the one bug this
 * file exists to catch.
 */
const ARC = {
  vested: { vestedBase: BigInt("2499508481886970"), vestedQuote: BigInt(997) },
  baseDecimals: 18,
  quoteDecimals: 6,
  /** Quote per base, off the same pool read that reports `aprPct: 0.26`. */
  poolPrice: 1.0001822,
  /** USDC, per `/api/token/address/0x3600…0000`. */
  quotePriceUsd: 1,
};

describe("vestedFeesUsd", () => {
  it("prices a real Arc band position", () => {
    const usd = vestedFeesUsd(
      ARC.vested,
      ARC.baseDecimals,
      ARC.quoteDecimals,
      ARC.poolPrice,
      ARC.quotePriceUsd,
    );
    // 0.00249951 VFVHFK at 1.0001822 USDC, plus 0.000997 USDC.
    expect(usd).toBeCloseTo(0.003497, 6);
  });

  it("uses each leg's own decimals", () => {
    // The quote leg alone: 997 at 6 decimals is 0.000997, at 18 it is 1e-15.
    // Getting this wrong is the decimals bug the rules file calls the number
    // one "where did my money go" mistake, and it hides behind a near-zero
    // total that still formats as <$0.01.
    const fees = { vestedBase: BigInt(0), vestedQuote: BigInt(997) };
    expect(vestedFeesUsd(fees, 18, 6, ARC.poolPrice, 1)).toBeCloseTo(0.000997, 9);
  });

  it("needs no pool price when nothing is owed on the base leg", () => {
    // A one-sided band that earned only quote fees still has an answer.
    const fees = { vestedBase: BigInt(0), vestedQuote: BigInt(5_000_000) };
    expect(vestedFeesUsd(fees, 18, 6, null, 1)).toBe(5);
  });

  it("is null, never 0, when the quote cannot be priced", () => {
    expect(vestedFeesUsd(ARC.vested, 18, 6, ARC.poolPrice, null)).toBeNull();
  });

  it("is null, never 0, when a base leg has no pool price", () => {
    expect(vestedFeesUsd(ARC.vested, 18, 6, null, 1)).toBeNull();
    expect(vestedFeesUsd(ARC.vested, 18, 6, 0, 1)).toBeNull();
  });

  it("measures zero as zero — an untraded band earned nothing", () => {
    // Arc tokenIds 24 and 25, bands 1 and 2 of the same pool, read the same
    // day. This is the one case where 0 is a measurement rather than a guess.
    const none = { vestedBase: BigInt(0), vestedQuote: BigInt(0) };
    expect(vestedFeesUsd(none, 18, 6, ARC.poolPrice, 1)).toBe(0);
  });
});

describe("lifetimeFeesUsd", () => {
  it("adds claimed to still-owed", () => {
    // `BandPool.collect` advances the position's fee-growth cursor as it pays,
    // so the two are disjoint and the sum cannot double-count.
    expect(lifetimeFeesUsd(1.25, 0.75)).toBeCloseTo(2, 9);
  });

  it("does not fall when fees are claimed", () => {
    // Before: nothing claimed, $2 owed. After a claim the chain reports 0 owed
    // and the broker reports $2 claimed. The column must not drop to $0.
    const before = lifetimeFeesUsd(0, 2);
    const after = lifetimeFeesUsd(2, 0);
    expect(after).toBe(before);
  });

  it("keeps unpriceable distinct from nothing yet", () => {
    expect(lifetimeFeesUsd(null, null)).toBeNull();
    expect(lifetimeFeesUsd(null, 0)).toBe(0);
    expect(lifetimeFeesUsd(0, null)).toBe(0);
  });
});

describe("formatFeesUsd", () => {
  it("renders a sub-cent fee as <$0.01, not +$0.00", () => {
    /*
     * THE point of this file. Arc's pool turns over ~$7/day at a 5bp LP fee, so
     * a real band position earns thousandths of a cent — and `toFixed(2)` on
     * that prints `+$0.00`, which is indistinguishable from the em-dash this
     * whole change was made to remove. A reader has to be able to tell "too
     * small to print" from "nothing".
     */
    expect(formatFeesUsd(0.003497)).toBe("<$0.01");
    expect(formatFeesUsd(1e-8)).toBe("<$0.01");
    expect(formatFeesUsd(0.004)).toBe("<$0.01");
  });

  it("rounds up into cents once there are cents to show", () => {
    expect(formatFeesUsd(0.006)).toBe("+$0.01");
    expect(formatFeesUsd(12.345)).toBe("+$12.35");
  });

  it("says $0.00 for a measured zero and — for an unmeasured one", () => {
    expect(formatFeesUsd(0)).toBe("$0.00");
    expect(formatFeesUsd(null)).toBe("—");
    expect(formatFeesUsd(Number.NaN)).toBe("—");
  });
});
