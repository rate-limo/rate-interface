/**
 * Pair-profile domain types — the seam between the reading surface and the book.
 *
 * The pair profile needs five things: the spread, depth within ±2%, the book at a glance,
 * recent trades, and the pool's LP economics. All five are WIRED as of 2026-08-08 —
 * `hooks/usePairSnapshot` composes them and `lib/pair/snapshot.ts` holds the rules:
 *
 * - spread / depth / book → `GET /api/orderbook/blocks/:base/:quote/:step/:depth/:isSingle`
 * - trades                → `GET /api/trades/pair/:base/:quote/:pageSize/:page`
 * - LP economics          → `GET /api/liquidity/pool/:base/:quote`
 *
 * **Not `/liquidity/apr`.** That route estimates what a PROSPECTIVE deposit of a given
 * size and range would earn; `lpAprPct` below is a pool-level figure. The realised
 * number rides on `/liquidity/pool` as `aprPct` for exactly this reason.
 *
 * The seam survives the wiring: this is still an interface, the same pattern as
 * `SwapExecution` and `LaunchExecution`, and the component above it did not change shape
 * when the mock came out. What it must NOT become is a component that fabricates numbers
 * inline — the profile's whole job
 * is to be a place you can trust a market's figures.
 */

export interface BookLevel {
  /** Quote per base. A rate, never a USD price. */
  price: number;
  /** Base size resting at this level. */
  size: number;
  /** Base size resting at this level or better, walking away from the mid. */
  cumulative: number;
}

export interface PairTrade {
  price: number;
  amount: number;
  side: "Buy" | "Sell";
  /** Unix seconds. Formatted at render time so the server and client agree. */
  timestamp: number;
  txHash: string;
}

/**
 * One funded band of the connected wallet's position, for the profile's ladder.
 *
 * `toleranceFrac` is the half-width as a fraction (0.02 = ±2%), already resolved
 * from the pair limit by `lib/liquidity/positions.ts`. It is what makes a rung
 * legible — a band is an interval around the anchor, and the interval is the
 * thing the LP chose.
 */
export interface YourBandRung {
  band: number;
  /** Half-width per side as a fraction; null when the chain read did not answer. */
  toleranceFrac: number | null;
  valueUsd: number;
  /** This band's share of the POSITION's value, 0..100. */
  sharePct: number;
  /** False when the creator has closed the band to new trades. */
  open: boolean | null;
  /** Vesting ramp of this band's capital, 0..100; null when unknown. */
  vestedPct: number | null;
}

/**
 * Everything the profile reads that is not already on `SpotPair`.
 *
 * Every field is nullable on purpose. A market with an empty book has no spread and no
 * depth, and that is a fact about the market rather than a loading state — the UI renders
 * an em-dash and says why, instead of a zero that reads as "measured, and it is nothing".
 */
export interface PairSnapshot {
  bestBid: number | null;
  bestAsk: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
  /** Quote-denominated notional resting within 2% above the mid. */
  depthUpUsd: number | null;
  /** …and within 2% below. Asymmetric books are the norm, so these are separate. */
  depthDownUsd: number | null;
  trades: PairTrade[];
  /** Pool-level fee APR. NOT a per-position figure — see the portfolio's est markers. */
  lpAprPct: number | null;
  lpTvlUsd: number | null;
  /** Fees accrued by the pool over the indexed 24h window, denominated in quote. */
  accruedFees24hQuote: number | null;
  /** The connected wallet's position in this pool, USD. Null when there is none. */
  yourPositionUsd: number | null;
  /**
   * The wallet's BAND position in this pool — one rung per funded band.
   *
   * Separate from `yourPositionUsd` because a band position is not one number.
   * One ERC-1155 token holds a whole ladder, and which rungs it funds is the
   * decision the LP actually made; collapsing it to a total throws that away.
   *
   * Null when the wallet holds no band position here (or none is known yet),
   * which is not the same as an empty array — that would mean a position with
   * no funded band, which cannot exist.
   */
  yourBands: YourBandRung[] | null;
  /** How many ERC-1155 positions back `yourBands`. An LP may hold several. */
  yourPositionCount: number;
  /** Fees this wallet can collect from those positions now, in USD. */
  yourFeesUsd: number | null;
  /** Which figures are still illustrative. See `SnapshotProvenance`. */
  provenance: SnapshotProvenance;
}

/**
 * Which of the three legs are illustrative rather than measured — `true` meaning
 * "not from the gateway". The `Est` markers on the profile key off this.
 *
 * This replaced a single `illustrative: boolean`, which could not describe the
 * state the page is in most of the time: a live book beside an APR that is null
 * for want of in-range liquidity. One flag would have to lie about one of them,
 * and the lie that matters is the one that stamps "est" on a real number — teach
 * a reader the marker is noise and it stops working everywhere it is true.
 */
export interface SnapshotProvenance {
  book: boolean;
  trades: boolean;
  liquidity: boolean;
}

export interface PairDataSource {
  snapshot(base: string, quote: string): Promise<PairSnapshot>;
}
