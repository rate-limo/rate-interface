/**
 * Swap domain types — the seam between the swap card UI and quoting/execution.
 *
 * These are intentionally decoupled from the raw token-list shape: an adapter
 * (lib/swap/tokens) maps the token list into SwapToken. When the real
 * Router/Pool.sol quote lands, only lib/swap/quote changes — the card and these
 * types stay put. See apps/web/CLAUDE.md ("Swap page & swap card").
 */

export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  /** Listing price today (indexers are the live source); swap to live last price later. */
  priceUsd: number;
  logoURI?: string;
}

/** What happens to the part of the order the book can't fill right now. */
export type Disposition = "none" | "limit" | "lp";

/** One hop of a (possibly multi-hop) route and how it filled. */
export interface HopFill {
  from: SwapToken;
  to: SwapToken;
  inUsd: number;
  matchedUsd: number;
  placedUsd: number;
  depthUsd: number;
}

/** A remainder that would rest (limit) or be provided (lp) at one hop. */
export interface RestingPlacement {
  from: SwapToken;
  to: SwapToken;
  inAmount: number; // in `from`
  outAmount: number; // in `to`, at the resting/limit price
  /** false when this rests at an intermediate hop → settles into `to`, not the target. */
  settlesToTarget: boolean;
}

export interface QuoteInput {
  pay: SwapToken;
  get: SwapToken;
  amountIn: number;
  /** default 0.005 (0.5%) */
  slippagePct?: number;
}

export interface SwapQuote {
  amountIn: number;
  payUsd: number;
  route: SwapToken[];
  hops: HopFill[];
  /** amount of `get` delivered now (after impact + taker fee) */
  delivered: number;
  deliveredUsd: number;
  /** total USD value that couldn't fill now (== Σ placements, invariant with delivered) */
  placedUsd: number;
  placements: RestingPlacement[];
  impactPct: number;
  minReceived: number;
  feeUsd: number;
  /** Exact route returned by the gateway. Present only on executable live quotes. */
  execution?: {
    path: `0x${string}`[];
    lpMinPrice: number;
    lpMaxPrice: number;
    lpSlippageLimit: number;
  };
}
