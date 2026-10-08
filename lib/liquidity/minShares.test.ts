import { describe, expect, it } from "vitest";
import { canSeedEmptyBand, DEPOSIT_SLIPPAGE_BPS, minSharesFromProbe } from "./minShares";

describe("minSharesFromProbe", () => {
  it("discounts the probed shares by the tolerance", () => {
    // The number a live probe returned on Arc for 1 USDC into ITRA/USDC band 0.
    expect(minSharesFromProbe(BigInt("489847975513103020"))).toBe(
      BigInt("487398735635537504"),
    );
  });

  it("stays below what the probe reported, so the floor cannot trip on its own", () => {
    const probed = BigInt("489847975513103020");
    expect(minSharesFromProbe(probed)).toBeLessThan(probed);
  });

  it("honours a wider tolerance", () => {
    expect(minSharesFromProbe(BigInt(1000), BigInt(1000))).toBe(BigInt(900));
  });

  it("is zero when the probe minted nothing — the pool refuses that itself", () => {
    expect(minSharesFromProbe(BigInt(0))).toBe(BigInt(0));
    expect(minSharesFromProbe(BigInt(-5))).toBe(BigInt(0));
  });

  it("uses the swap card's default tolerance", () => {
    expect(DEPOSIT_SLIPPAGE_BPS).toBe(BigInt(50));
  });
});

describe("canSeedEmptyBand", () => {
  /*
   * Both sides now, which is the contract change: `_price` prices an empty band's
   * opener on whichever side was brought, so a quote-only first deposit opens a band
   * instead of reverting `ZeroLiquidity()`. Pinned on chain by
   * `test_quoteAloneOpensAnEmptyBand` in BandOneSidedWall.t.sol.
   *
   * What an empty band takes is no longer the interesting question — whether a band
   * that already holds something takes ONE token is, and that lives in ./wall.ts.
   */
  it("lets either token open an empty band", () => {
    expect(canSeedEmptyBand(true)).toBe(true);
    expect(canSeedEmptyBand(false)).toBe(true);
  });
});
