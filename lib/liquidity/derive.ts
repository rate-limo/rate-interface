/**
 * Pure derivation for the liquidity overview.
 *
 * Split out of poolStats.ts so it can be unit-tested: that module is
 * `server-only` and pulls in the db client, neither of which a test wants. This
 * file has no imports on purpose — give it rows shaped like the query result and
 * it returns what the page renders.
 */

export interface PoolRow {
  /** "ETH/USDC" */
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseLogoURI?: string;
  quoteLogoURI?: string;
  /** quote per base, i.e. 1 base = `rate` quote */
  rate: number;
  tvlUsd: number;
  /**
   * Quote-side TVL alone, split out from the total.
   *
   * Every listed pool can be summarised by one TVL figure. A launch pool can't:
   * its TVL is mostly the creator's own seeded mint (the launch Seed step forces
   * the position single-sided above the start price), and only the quote half is
   * the number that decides whether it graduates. Showing both side by side is
   * what stops "$137,900 TVL" reading as progress toward a $100,000 threshold.
   */
  quoteTvlUsd: number;
  volume24hUsd: number;
  fees24hUsd: number;
  /**
   * Gross fee APR; not net of impermanent loss.
   *
   * Null — never 0 — when there is no TVL to divide by. A pool with volume and
   * an empty book produces a number that is arithmetic rather than information,
   * and `0%` is indistinguishable from a real, genuinely-zero yield. Same
   * degrade rule as the status bar's price chips.
   */
  aprPct: number | null;
  /** False until the pair graduates. Drives the Launches filter and the row's
   * Unlisted chip; mirrors `spotPairs.verified`. */
  listed: boolean;
}

export interface PoolTotals {
  totalTvlUsd: number;
  totalVolume24hUsd: number;
  totalFees24hUsd: number;
  medianAprPct: number;
}

/** The subset of spotPairs this needs. Numerics arrive as strings from pg. */
export interface RawPairRow {
  id?: string | null;
  symbol?: string | null;
  baseSymbol?: string | null;
  quoteSymbol?: string | null;
  base?: { logoURI?: string | null } | null;
  quote?: { logoURI?: string | null } | null;
  price?: number | string | null;
  dayBaseTvlUSD?: number | string | null;
  dayQuoteTvlUSD?: number | string | null;
  dayBaseVolumeUSD?: number | string | null;
  dayQuoteVolumeUSD?: number | string | null;
  /** The listing gate. Null is read as unlisted — `verified` defaults to false
   * and a null must never be mistaken for a listed pool. */
  verified?: boolean | null;
}

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The pool's share of the taker fee — `poolFeeShare / DENOM` on the engine,
 * 50000000 / 100000000 on both chains today, and carried per chain in the
 * deployments registry.
 *
 * A constant rather than a read: these figures come from a Postgres row with no
 * engine in scope. Exported so the other place that computes LP fees (Explore's
 * PoolsTable, which works from raw volume rather than this module) uses the same
 * number — two copies of a fee split is how one keeps describing venue revenue
 * after the other is corrected.
 */
export const LP_FEE_SHARE = 0.5;

/**
 * spotPairs stores liquidity and flow but not yield, so fees and APR are derived:
 *   fees24h = volume24h × takerFeeRate × LP_FEE_SHARE
 *   apr     = fees24h × 365 / tvl
 *
 * The share is the correction, and it is not cosmetic. The taker fee is SPLIT on
 * chain — `MatchingEngine.poolFeeShare` over `DENOM` is the pool's part, the rest
 * is the protocol's — so `volume × takerFeeRate` is the VENUE's revenue, not the
 * LP's. Every consumer of these two numbers is labelled for LPs ("Fees to LPs ·
 * 24h", "Median LP APR", the LP APR column), so omitting the split overstated
 * what a provider earns by 2x at the current setting.
 *
 * Sorted by TVL descending, and pairs with neither liquidity nor flow are dropped
 * — there is nothing to act on and they'd pad the table with zeroes.
 */
export function derivePools(rows: RawPairRow[], takerFeeRate: number): PoolRow[] {
  return rows
    .map((row) => {
      const quoteTvlUsd = num(row.dayQuoteTvlUSD);
      const tvlUsd = num(row.dayBaseTvlUSD) + quoteTvlUsd;
      const volume24hUsd = num(row.dayBaseVolumeUSD) + num(row.dayQuoteVolumeUSD);
      const fees24hUsd = volume24hUsd * takerFeeRate * LP_FEE_SHARE;
      const baseSymbol = row.baseSymbol ?? "";
      const quoteSymbol = row.quoteSymbol ?? "";

      return {
        symbol:
          row.symbol ??
          ([baseSymbol, quoteSymbol].filter(Boolean).join("/") || "Unknown pair"),
        baseSymbol,
        quoteSymbol,
        baseLogoURI: row.base?.logoURI ?? undefined,
        quoteLogoURI: row.quote?.logoURI ?? undefined,
        rate: num(row.price),
        tvlUsd,
        quoteTvlUsd,
        volume24hUsd,
        fees24hUsd,
        // A pool can record volume before it records TVL. Null rather than 0 —
        // see the field's note; the row renders an em-dash.
        aprPct: tvlUsd > 0 ? (fees24hUsd * 365 * 100) / tvlUsd : null,
        // `verified` is nullable in the schema and defaults to false; anything
        // other than an explicit true is unlisted.
        listed: row.verified === true,
      };
    })
    .filter((pool) => pool.tvlUsd > 0 || pool.volume24hUsd > 0)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

/**
 * Headline figures.
 *
 * Callers pass the LISTED pools only. Including a $6k unlisted launch book in a
 * median LP APR moves a number people size positions against, and the rest of
 * the app already refuses to show those markets — the gateway's list endpoints
 * filter on the same `verified` column. (`/pool` never went through the gateway:
 * it reads Postgres directly, which is how it missed the gate entirely.)
 */
export function poolTotals(pools: PoolRow[]): PoolTotals {
  return {
    totalTvlUsd: pools.reduce((sum, p) => sum + p.tvlUsd, 0),
    totalVolume24hUsd: pools.reduce((sum, p) => sum + p.volume24hUsd, 0),
    totalFees24hUsd: pools.reduce((sum, p) => sum + p.fees24hUsd, 0),
    // Median, not mean: one very deep pool would otherwise drag the headline.
    medianAprPct: median(
      pools
        .map((p) => p.aprPct)
        .filter((apr): apr is number => apr !== null && apr > 0),
    ),
  };
}

/** Split for the Listed / Launches filter. Pre-computed rather than filtered in
 * the component so the counts in the segmented control and the rows in the
 * table can never disagree. */
export function splitPools(pools: PoolRow[]): { listed: PoolRow[]; launches: PoolRow[] } {
  return {
    listed: pools.filter((p) => p.listed),
    launches: pools.filter((p) => !p.listed),
  };
}
