import type { Band, BandSet } from "./bands";

/**
 * The pool's REAL band ladder, converted from what the chain returns.
 *
 * ## The open item this closes
 *
 * `bands.ts`'s `mockBandSet()` says "Illustrative band set, until the pool read
 * exists … Swap this for a contract read; nothing above it needs to change",
 * and `apps/web/CLAUDE.md` has carried "the band set is still `mockBandSet()`,
 * which matches a stock three-band pool by coincidence" as an open item since
 * the deposit flow was written.
 *
 * It is not a coincidence that holds. Measured on Arc's ITRA/USDC pool
 * `0x332abF…aB92` on 2026-09-24:
 *
 * | | mock | chain |
 * |---|---|---|
 * | tolerances | 0.1% / 0.3% / 0.5% (+ a closed 1%) | 0.02% / 0.06% / 0.10% |
 * | `spreadReach` | 1% | 0.1% |
 * | bands | 4 | 3 |
 *
 * The mock's ladder is five times wider than the pool's and its reach is ten
 * times wider. `usableBands` compares one against the other, so planning a
 * deposit from it offers bands `_requireWithinSpread` would revert — after two
 * approvals, which is the same shape as the "One token" bug that sat beside
 * this one in the same list.
 *
 * ## Every scale here was measured, not inferred
 *
 * `DENOM` is `100_000_000` (1e8) — `contracts/src/exchange/MatchingEngine.sol`
 * — and `BandPool` divides by it for both tolerance and fee rate. The live
 * reads agree field for field:
 *
 *  - `bands(i).tolerance` → `20000 / 60000 / 100000`, i.e. 0.02% / 0.06% /
 *    0.10%, exactly the ladder CLAUDE.md describes for a 0.10% pair;
 *  - `bandFeeMultiplier(i)` → `1e8 / 2e8 / 3e8`. **Scaled, not bare.** The mock
 *    carries `1, 2, 3`, so reading this raw renders a 100,000,000× multiplier
 *    beside a deposit amount;
 *  - `spreadReach` is `min(getSpread(ob, true, true), getSpread(ob, false,
 *    true))` on the ENGINE, per `_requireWithinSpread` — `100000`, i.e. 0.1%,
 *    exactly equal to the widest band, which is what `_scaleLadderToSpread`
 *    fits on the first deposit.
 */

/** `MatchingEngine.DENOM`. Tolerance, fee rate and spread all divide by it. */
export const BAND_DENOM = 100_000_000;

/** One band, exactly as `BandPool.bands(uint8)` returns it. */
export interface ChainBand {
  /** `uint32`, over `BAND_DENOM`. 20000 is 0.02%. */
  tolerance: number;
  open: boolean;
  /** `bandFeeMultiplier(uint8)`, ALSO over `BAND_DENOM`. 1e8 is 1×. */
  feeMultiplier: number;
  /** `bandReserves(uint8)`, raw. Display only — see `liquidityUSD` below. */
  baseReserve: bigint;
  quoteReserve: bigint;
}

export interface ChainBandSet {
  /** `maturity()`, in seconds. */
  maturitySec: number;
  /** `min(getSpread(up), getSpread(down))` on the engine, over `BAND_DENOM`. */
  spreadReach: number;
  /**
   * The pool's BASE LP fee, as a fraction.
   *
   * Not `effectiveFeeRate(band, amount)`: that one scales with the trade's
   * impact and returns `MAX_FEE_RATE` (3e6, i.e. 3%) for anything large against
   * a thin band — measured, at 1e18 into a band holding 0.06 quote. Quoting a
   * deposit at the cap would misprice every estimate on the card. The gateway's
   * `aprBasis.lpFeeRate` is the base rate and is what this takes.
   */
  lpFeeRate: number;
  bands: ChainBand[];
}

/**
 * Convert to the shape the deposit flow already plans against.
 *
 * `liquidityUSD`, `feesBase` and `feesQuote` are **display** fields on `Band`
 * and are deliberately left at zero here rather than derived from
 * `bandReserves`. Pricing reserves to USD needs per-token prices this module
 * does not take, and the rule the LP table already enforces applies: a figure
 * nobody measured is not written as a number. Wire them when a caller supplies
 * prices; until then nothing reads them for a decision — `usableBands`,
 * `selectableBands` and `allocateAcross` use `tolerance`, `open` and `index`
 * alone, which is the half that decides the transaction and is fully sourced.
 */
export function toBandSet(chain: ChainBandSet): BandSet {
  const bands: Band[] = chain.bands.map((b, index) => ({
    index,
    tolerance: b.tolerance / BAND_DENOM,
    open: b.open,
    feeMultiplier: b.feeMultiplier / BAND_DENOM,
    liquidityUSD: 0,
    feesBase: 0,
    feesQuote: 0,
    // Exact, and the only per-side figures on `Band`. `lib/liquidity/wall.ts`
    // decides the no-conversion deposit mode from these two.
    baseReserve: b.baseReserve,
    quoteReserve: b.quoteReserve,
  }));

  return {
    maturitySec: chain.maturitySec,
    feePct: chain.lpFeeRate,
    spreadReach: chain.spreadReach / BAND_DENOM,
    bands,
  };
}
