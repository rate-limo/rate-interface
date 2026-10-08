import { describe, expect, it } from "vitest";
import { BAND_DENOM, toBandSet, type ChainBandSet } from "./bandSet";
import { mockBandSet, usableBands } from "./bands";

/**
 * Arc's ITRA/USDC band pool `0x332abF42DfBf394803d6BC4CE7AA96e0Ee9baB92`, read
 * on 2026-09-24 with `cast` against https://rpc.testnet.arc.network:
 *
 *   bandCount()            3
 *   maturity()             600
 *   bands(0..2).tolerance  20000 / 60000 / 100000
 *   bands(0..2).open       true / true / true
 *   bandFeeMultiplier      1e8 / 2e8 / 3e8
 *   getSpread(ob, ↑/↓)     100000 / 100000
 *   aprBasis.lpFeeRate     0.0005   (gateway)
 *
 * Pinned rather than invented, the way `lib/pair/derive.test.ts` pins its live
 * band read: every scale below is a place a wrong divisor renders something
 * plausible, so a synthetic fixture would agree with a broken implementation.
 */
const ARC: ChainBandSet = {
  maturitySec: 600,
  spreadReach: 100_000,
  lpFeeRate: 0.0005,
  bands: [
    { tolerance: 20_000, open: true, feeMultiplier: 100_000_000, baseReserve: BigInt("30190500000000000"), quoteReserve: BigInt(30_191) },
    { tolerance: 60_000, open: true, feeMultiplier: 200_000_000, baseReserve: BigInt(0), quoteReserve: BigInt(0) },
    { tolerance: 100_000, open: true, feeMultiplier: 300_000_000, baseReserve: BigInt(0), quoteReserve: BigInt(0) },
  ],
};

describe("toBandSet", () => {
  it("reads the ladder CLAUDE.md describes for a 0.10% pair", () => {
    // "a 0.10% pair reads 0.02/0.06/0.10%" — the chain's own numbers, over 1e8.
    const set = toBandSet(ARC);
    expect(set.bands.map((b) => b.tolerance)).toEqual([0.0002, 0.0006, 0.001]);
    expect(set.bands.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(set.maturitySec).toBe(600);
    expect(set.feePct).toBe(0.0005);
  });

  it("scales the fee multiplier, which is 1e8-based and not bare", () => {
    /*
     * `bandFeeMultiplier` returns 1e8/2e8/3e8 for a 1×/2×/3× ladder. The mock
     * carries `1, 2, 3`, so reading the chain value raw puts a 100,000,000×
     * multiplier beside a deposit amount — plausible-looking in the type and
     * absurd on screen.
     */
    expect(toBandSet(ARC).bands.map((b) => b.feeMultiplier)).toEqual([1, 2, 3]);
  });

  it("puts the widest band exactly AT the spread, not beyond it", () => {
    /*
     * `_scaleLadderToSpread` fits the ladder to the pair's spread on the first
     * deposit, so the outermost tolerance equals `reach` — and
     * `_requireWithinSpread` reverts only on `tolerance > reach`. Every band is
     * therefore usable, and an off-by-one in either divisor breaks that.
     */
    const set = toBandSet(ARC);
    expect(set.spreadReach).toBe(0.001);
    expect(Math.max(...set.bands.map((b) => b.tolerance))).toBe(set.spreadReach);
    expect(usableBands(set)).toEqual([0, 1, 2]);
  });

  it("does not invent the display half", () => {
    // `liquidityUSD`/`feesBase`/`feesQuote` need per-token prices this module is
    // not given. Zero here is "not supplied", and nothing reads them to decide
    // anything — the mock's $18,200 carried onto a real pool would be a figure
    // nobody measured on the screen where capital is committed.
    for (const band of toBandSet(ARC).bands) {
      expect(band.liquidityUSD).toBe(0);
      expect(band.feesBase).toBe(0);
      expect(band.feesQuote).toBe(0);
    }
  });

  it("carries a closed band through as closed", () => {
    const withClosed: ChainBandSet = {
      ...ARC,
      bands: [...ARC.bands, { tolerance: 100_000, open: false, feeMultiplier: 400_000_000, baseReserve: BigInt(0), quoteReserve: BigInt(0) }],
    };
    const set = toBandSet(withClosed);
    expect(set.bands[3]!.open).toBe(false);
    expect(usableBands(set)).not.toContain(3);
  });

  it("is a different pool from the one the mock describes", () => {
    /*
     * The point of the whole change, stated as an assertion so it cannot quietly
     * stop being true. The mock's reach is 10x the real pool's and its ladder 5x
     * wider, so planning a deposit from it offers bands the contract reverts on.
     */
    const real = toBandSet(ARC);
    const mock = mockBandSet();
    expect(mock.spreadReach).toBeGreaterThan(real.spreadReach * 5);
    expect(Math.max(...mock.bands.map((b) => b.tolerance))).toBeGreaterThan(real.spreadReach);
    expect(mock.bands.length).not.toBe(real.bands.length);
  });

  it("keeps BAND_DENOM equal to the contract's", () => {
    // `MatchingEngine.sol`: `uint32 public constant DENOM = 100000000;`
    expect(BAND_DENOM).toBe(100_000_000);
  });
});


describe("the v2 spreadFrac trap", () => {
  /*
   * `bands(i)`'s first field is `spreadFrac`, NOT a tolerance. The contract:
   * "tolerance = spreadFrac x pairLimit(side) / DENOM". Measured on Arc's
   * TITER/USDC pool 0x8a7cCE…6D15: spreadFrac is 2e7/6e7/1e8 (20/60/100% of the
   * pair's limit) while `bandTolerances` gives 2e4/6e4/1e5 (0.02/0.06/0.10%).
   *
   * Feeding the first field in made every band look 200x wider than the reach,
   * so `bandReachable` refused all of them and `usableBands` came back EMPTY —
   * which removed the deposit card's band distribution entirely, because
   * `BandShapePicker` hides below two usable bands.
   *
   * A v1 pool stored the absolute value in that slot, so the first verification
   * of the hook passed and the trap only appeared on pools created after the v2
   * generation shipped.
   */
  const spreadReach = 100_000;
  const band = (tolerance: number): ChainBandSet["bands"][number] => ({
    tolerance, open: true, feeMultiplier: 100_000_000, baseReserve: BigInt(0), quoteReserve: BigInt(0),
  });

  it("accepts the DERIVED tolerances and leaves every band reachable", () => {
    const set = toBandSet({ maturitySec: 600, spreadReach, lpFeeRate: 0.0005,
      bands: [band(20_000), band(60_000), band(100_000)] });
    expect(set.bands.map((b) => b.tolerance)).toEqual([0.0002, 0.0006, 0.001]);
    expect(usableBands(set)).toEqual([0, 1, 2]);
  });

  it("would refuse every band if spreadFrac were passed instead", () => {
    // The regression, stated as the thing that must NOT be the input. If a
    // future edit reads `bands(i)[0]` again, the ladder looks like this.
    const set = toBandSet({ maturitySec: 600, spreadReach, lpFeeRate: 0.0005,
      bands: [band(20_000_000), band(60_000_000), band(100_000_000)] });
    expect(Math.max(...set.bands.map((b) => b.tolerance))).toBeGreaterThan(set.spreadReach);
    expect(usableBands(set)).toEqual([]);
  });
});
