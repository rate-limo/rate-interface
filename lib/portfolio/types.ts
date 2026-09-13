/**
 * Portfolio domain types — the seam between the cross-chain portfolio UI and its
 * two data sources.
 *
 * Balances come per-token, per-chain over RPC (rate-limits independently → the
 * resilient panel). Everything else (orders, LPs, trades, history, rewards,
 * referrals) comes from the indexer (Ponder) fanned out across chains. Today a
 * mock implements both; wire to real multicall + indexer later without touching
 * the components. See apps/web/CLAUDE.md ("Portfolio page").
 */

export type Side = "Buy" | "Sell";

export interface Market {
  base: string;
  quote: string;
  /** network name, e.g. "RISE Testnet" */
  network: string;
}

/* ---------------- balances (RPC, resilient) ---------------- */

export interface TokenBalance {
  symbol: string;
  name: string;
  amount: string;
  usdValue: number;
  logoURI?: string;
}

/** Per-chain load state — the panel degrades per chain, never blanks on one failure. */
export type ChainLoadState = "ok" | "loading" | "stale" | "error";

export interface ChainBalances {
  network: string;
  slug: string;
  state: ChainLoadState;
  tokens: TokenBalance[];
  totalUsd: number;
  /** e.g. "12s ago" / "2m ago" — how fresh this chain's snapshot is. */
  updatedAgo: string;
}

export interface BalancesResult {
  chains: ChainBalances[];
  totalUsd: number;
  loading: boolean;
  refetchAll(): void;
  refetchChain(network: string): void;
}

/* ---------------- indexer data ---------------- */

export interface OpenOrder {
  /** On-chain identity retained from the indexer for single and bulk cancellation. */
  orderId?: number;
  baseAddress?: `0x${string}`;
  quoteAddress?: `0x${string}`;
  market: Market;
  side: Side;
  price: string;
  amount: string;
  filledPct: number;
  status: "Open" | "Partial";
  fromSwap?: boolean;
}

export interface StopOrder {
  orderId: number;
  pairAddress: `0x${string}`;
  baseAddress: `0x${string}`;
  quoteAddress: `0x${string}`;
  market: Market;
  side: Side;
  kind: "Stop-limit" | "Stop-market";
  triggerPrice: string;
  limitPrice: string;
  amount: string;
  deadline: number;
  status: "Open" | "Canceled" | "Activated" | "Expired";
  /**
   * The id of the ORDINARY book order this stop became, once it activated.
   * Null on every other status.
   *
   * An activated stop stops being a stop: `StopOrderEngine.cancel` reverts for it
   * and it is managed through `MatchingEngine.cancelOrder` like any resting order.
   * The chain emits this id on `StopOrderActivated` precisely so a client can make
   * that hand-off visible; without it the row goes read-only and the trader is left
   * to infer that a new entry in Open orders is the same position.
   */
  regularOrderId?: number | null;
}

export interface LpPosition {
  market: Market;
  provided: string;
  /**
   * Pool-level realised fee APR. **Null means not measurable — no in-range
   * liquidity or no indexed volume — and never zero**, which would assert the
   * pool earned nothing. Same convention as `PoolLiquidity.aprPct`; render an
   * em-dash. It is the POOL's figure, so it approximates a concentrated
   * position rather than describing it.
   */
  aprPct: number | null;
  /**
   * Null until a per-position fee source exists. Nothing in broker, gateway or
   * admin-service accrues fees per LP token today, so any number here would be
   * invented — see the portfolio spec's rule about values no service computes.
   */
  feesEarnedUsd: number | null;
  inRange: boolean;
  singleSided?: boolean;
  fromSwap?: boolean;
  /**
   * Which generation of pool this position lives in.
   *
   * "range" is a `Pool.sol` position that owns min/max prices it chose. "band"
   * is a share of ONE band in a BandPool, which has no per-position range at all
   * — `PoolPositions.sol` deleted those columns because `_fillBand` never read
   * them. The distinction reaches the UI because the columns mean different
   * things: a band always straddles the anchor, so `inRange` is true by
   * construction and says nothing, and `provided` is a share count rather than
   * two token amounts.
   *
   * Optional so every existing construction site keeps compiling as "range",
   * which is what they all are.
   */
  kind?: "range" | "band";
  /** Band index, tightest first — band positions only. It IS the fill order. */
  band?: number;
}

export interface TradeRow {
  /** Discriminates against SwapRow in the Trades tab's one timeline. */
  kind: "order";
  market: Market;
  side: Side;
  price: string;
  amount: string;
  valueUsd: string;
  time: string;
  txHash: string;
  /** How many fills this order took. 1 reads exactly as a single fill always did. */
  fills?: number;
  /** How many of those the pool filled, and how many another trader did. Counts
   *  rather than a badge: one order routinely takes both, so a row-level verdict
   *  would have to lie about one of them. */
  origins?: { pool: number; maker: number };
}

/**
 * A routed swap — the card's unit, one row per SwapExecuted.
 *
 * Deliberately NOT a TradeRow. It has no single market (a multi-hop route
 * crosses several), no side in the book's sense, and no counterparty worth
 * naming, so every field TradeRow has would be a small lie here.
 */
export interface SwapRow {
  kind: "swap";
  network: string;
  payAmount: string;
  paySymbol: string;
  receiveAmount: string;
  receiveSymbol: string;
  /** `1 pay = X receive`. A rate, never a USD price. */
  rate: string;
  time: string;
  txHash: string;
}

/** One entry in the Trades tab, at the altitude its owner acted at. */
export type ActivityRow = TradeRow | SwapRow;

export interface HistoryRow {
  market: Market;
  type: "Limit" | "Market";
  side: Side;
  price: string;
  size: string;
  status: "Open" | "Filled" | "Canceled" | "Expired";
  time: string;
}

export type RewardStatus = "Claimable" | "Accruing" | "Claimed";
export interface RewardRow {
  source: string;
  /** null for cross-chain sources like referral bonus */
  network: string | null;
  earnedPts: number;
  epoch: number;
  status: RewardStatus;
}
export interface RewardSummary {
  earnedPts: number;
  claimablePts: number;
  epochPts: number;
  epoch: number;
}

export interface ReferralRow {
  friend: string;
  network: string | null;
  joined: string;
  theirVolumeUsd: string;
  earnedPts: number;
  status: "Active" | "Joined";
}
export interface ReferralSummary {
  code: string;
  link: string;
  referred: number;
  /** Referees who ATTESTED. Only these earn the referrer a boost. */
  active: number;
  earnedPts: number;
  /**
   * Share of the trading fees a referee pays that reaches the referrer, and the
   * capped boost their attested referees have earned.
   *
   * These replace `tier` / `tierPct`. **There was never a tier**: `tEarnConfig`
   * has `referralCutBps` plus a per-attested-referee boost with a ceiling
   * (`boostBpsPerAttestedReferee`, `maxBoostBps`), and the UI's "Tier 3 · 12%"
   * was a rank the accrual has no concept of. admin-service computes these from
   * that config so the page and the accrual cannot disagree.
   */
  cutPct: number;
  boostPct: number;
  maxBoostPct: number;
}

/* ---------------- creator (launched tokens) ---------------- */

/**
 * A token this wallet launched via /launch, as the Creator tab reads it.
 *
 * Three sources merge into one row and none of them is the whole story:
 * the **factory event** says which wallet deployed what (the field that does
 * not exist yet — see apps/web/CLAUDE.md), the **indexer** supplies market
 * stats and the seeded position, and **admin-service** supplies name/logo.
 * `logoPending` and `metaClaimed` exist so the UI can be honest about the
 * third one rather than pretending metadata is already the creator's to edit.
 */
export interface CreatorToken {
  symbol: string;
  name: string;
  /** Checksummed (EIP-55) address of the deployed ERC-20. */
  address: string;
  network: string;
  /** Quote symbol of the launch market — the denominator of `rate`. */
  quote: string;
  /** Quote per base, as a display string. Never a USD price (see the launch spec). */
  rate: string;
  /** null while there is no prior price to compare against (a fresh launch). */
  change24hPct: number | null;
  /**
   * priceUSD × totalSupply, read straight off `spotTokens.marketCap` — a STORED
   * generated column, so the client never recomputes it and can never disagree
   * with the indexer. null when the token has no price yet; render a dash, not $0.
   */
  marketCapUsd: number | null;
  holders: number;
  volume24hUsd: number;
  /** Display strings; these are token amounts, not USD. */
  totalSupply: string;
  poolAmount: string;
  creatorAmount: string;
  /** Share of total supply seeded into the launch position, 0–100. */
  poolPct: number;
  /** How much of the seeded side the book has taken so far. */
  soldAmount: string;
  soldPct: number;
  inRange: boolean;
  rangeLow: string;
  rangeHigh: string;
  feeTierPct: number;
  feesEarnedUsd: number;
  /** Value of the seeded position, in USD — a portfolio number, so USD is right. */
  seededUsd: number;
  deployedAt: string;
  /** e.g. "6d" / "11m" — how long the token has been live. */
  age: string;
  txHash: string;
  /** True when the token has no artwork bound yet — the creator uploaded none,
   *  or the row still carries the legacy `placeholder_token.png`. See
   *  lib/tokens/logo.ts; cleared by binding a logo through `/token-logo/claim`. */
  logoPending: boolean;
  /** True once this wallet has claimed the token's metadata row. Always false today. */
  metaClaimed: boolean;

  /**
   * `spotPairs.id` for the launch market — the key the graduation endpoint takes.
   *
   * Null when the token has no market yet (deployed, no `PairAdded`), which is
   * also the case where there is nothing to graduate.
   */
  pairId: string | null;
  /**
   * Quote-side liquidity in the launch market, USD (`spotPairs.dayQuoteTvlUSD`).
   *
   * The base side is deliberately absent: it is this creator's own seeded mint,
   * so counting it toward the listing threshold would let anyone list anything.
   */
  quoteTvlUsd: number;
  /** USD of quote liquidity needed to list — the operator-set config row, not a
   * constant. Carried per row so the copy and the bar cannot disagree. */
  thresholdUsd: number;
  /** Unix seconds, or null while the market has not graduated. */
  graduatedAt: number | null;
  /** Quote TVL at the moment it crossed. Reported instead of the current figure,
   * which routinely falls afterwards — graduation latches. */
  graduatedAtQuoteTvlUsd: number | null;

  /* ---- CoinGenerator, read from the contract ----
   *
   * A SECOND thing called graduation, and not a later stage of the one above. That one
   * is quote TVL flipping `spotPairs.verified` so the market appears in ranked lists.
   * This one is market cap clearing `graduationUsd` on chain, and its effect is the
   * taker fee dropping and the creator gaining control of it. A coin can have either,
   * both or neither — see apps/web/CLAUDE.md.
   */

  /**
   * Market cap AS THE CONTRACT MEASURES IT — `CoinGenerator.usdValueOf()`, which walks
   * the MatchingEngine books (coin → quote → stablecoin).
   *
   * Deliberately NOT `marketCapUsd`, which is `spotTokens.marketCap`: `priceUSD ×
   * totalSupply` out of the indexer. The two answer the same question from different
   * sources and can disagree, and only this one decides whether `graduate()` succeeds.
   * Showing the indexer's figure next to the threshold would let the UI promise an
   * eligibility the contract then refuses.
   *
   * Null when a hop has no book — the contract reverts rather than valuing it at zero.
   */
  contractMarketCapUsd: number | null;
  /**
   * `CoinGenerator.graduationUsd`, converted to whole dollars.
   *
   * The contract holds it in the stablecoin's BASE UNITS ($69,420 against 6-decimal USDC
   * is `69_420e6`); the seam divides by `10 ** decimals` so everything above this line is
   * dollars, like `thresholdUsd` and `quoteTvlUsd`. Mixing the two scales in one type is
   * how a threshold ends up rendered a million times too large.
   */
  graduationUsd: number;
  /** `launches[coin].graduated`. The fee-tier graduation, not the listing one. */
  feeGraduated: boolean;
  /** `launches[coin].takerFee`, on the contract's 1e8 FEE_DENOM scale. */
  takerFeeNum: number;
  /** `maxCreatorTakerFee` — the ceiling a creator may set. 1e8 scale. */
  maxCreatorTakerFeeNum: number;
  /** `launches[coin].creatorFeeLocked` — an admin took the control away. */
  creatorFeeLocked: boolean;
}

/* ---------------- account profile (header) ---------------- */

/**
 * `GET /api/account/:address` — the social/profile identity behind the
 * portfolio header. A different indexer surface from `IndexerData`: that one
 * is activity (orders/LPs/trades/…), this one is *who the wallet is*.
 *
 * `avatarUrl`/`bannerUrl` are null for every wallet today — there is no
 * upload flow yet, so the header derives a deterministic gradient from the
 * address instead of leaving a blank box (see `addressGradient` in
 * `lib/portfolio/profile.ts`). `displayName`/`handle` are null until a wallet
 * has set one; the header falls back to the short address.
 */
export interface AccountProfile {
  address: string;
  profile: {
    displayName: string | null;
    handle: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    /** Unix seconds the indexer first saw this wallet, or null if unresolved. */
    joinedAt: number | null;
  };
  social: {
    followers: number;
    following: number;
    /**
     * Does the VIEWER follow this wallet? `null` means unknown — nobody
     * connected, or the read was not scoped to a viewer — and is deliberately
     * distinct from `false`, "asked, and they do not". The Follow button paints
     * a neutral state for null and would otherwise claim the viewer does not
     * follow someone they do.
     */
    viewerFollows: boolean | null;
  };
  stats: {
    trades: number;
    volumeUsd: number;
    createdTokens: number;
  };
}

export interface PortfolioSummary {
  netWorthUsd: number;
  availableUsd: number;
  inOrdersUsd: number;
  inLpUsd: number;
  rewardsClaimablePts: number;
}

/* ---------------- spot positions (Positions tab) ---------------- */

/**
 * One token's position as the FILL LEDGER can account for it —
 * `GET /api/account/:address/positions`, backed by `broker.spotPositions`.
 *
 * Deliberately not the wallet balance: tokens also arrive by transfer, airdrop
 * and LP withdrawal, none of which is a fill, so `amount` is the part of a
 * holding whose cost is actually known. The Assets panel is where the balance
 * lives; these two are not meant to agree.
 *
 * `valueUSD` and `unrealizedPnlUSD` are nullable because the join to
 * `spotTokens.priceUSD` can miss. Null is "no price", never "$0.00" — see
 * `lib/portfolio/positions.ts`, which is the only place that decides what a
 * null renders as.
 */
export interface SpotPosition {
  /** The token's contract address — the position's identity, with `account`. */
  token: string;
  symbol: string;
  logoURI: string | null;
  /** Net amount the fill ledger accounts for. Zero means the position is closed. */
  amount: number;
  /** USD cost of the current `amount` under weighted average. */
  costUSD: number;
  /** Server-derived `costUSD / amount`, and a hard 0 once `amount` is 0. */
  avgEntryUSD: number;
  /** Live price × amount, or null when the token has no price. */
  valueUSD: number | null;
  unrealizedPnlUSD: number | null;
  realizedPnlUSD: number;
  /**
   * Amount sold that the ledger never saw bought. Non-zero means the cost basis
   * is incomplete — its proceeds are kept out of `realizedPnlUSD` on purpose,
   * and the UI must say so rather than imply the numbers are whole.
   */
  untrackedSold: number;
  tradeCount: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  /** Whether a live price was found. `valueUSD === null` alone cannot say why. */
  priced: boolean;
}

/** Sums over the PRICED rows only, plus the count of the ones left out. */
export interface PositionTotals {
  valueUSD: number;
  costUSD: number;
  unrealizedPnlUSD: number;
  /**
   * The one total that covers EVERY row: a realised figure is already banked and
   * needs no live price. The three above it are partial by exactly
   * `unpricedCount` rows, which is why the footer labels them differently.
   */
  realizedPnlUSD: number;
  unpricedCount: number;
}

export interface AccountPositions {
  address: string;
  positions: SpotPosition[];
  totals: PositionTotals;
}

export interface IndexerData {
  summary: PortfolioSummary;
  orders: OpenOrder[];
  stopOrders: StopOrder[];
  stopOrderHistory: StopOrder[];
  lps: LpPosition[];
  /** Swaps and orders share one timeline — see lib/portfolio/activity. */
  trades: ActivityRow[];
  history: HistoryRow[];
  rewards: { summary: RewardSummary; rows: RewardRow[] };
  referrals: { summary: ReferralSummary; rows: ReferralRow[] };
  /** Empty for a wallet that has never launched — the Creator tab hides itself then. */
  creator: CreatorToken[];
}
