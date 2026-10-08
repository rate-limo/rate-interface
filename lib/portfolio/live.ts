import { fillProgress, formatFillProgress } from "@/lib/orders/fillProgress";
import { viewerSide } from "@/lib/trades/perspective";
import { hasNoTokenLogo } from "@/lib/tokens/logo";
import type { LpToken } from "@/lib/liquidity/positions";
import { feePct, type LaunchPoolRead } from "./launchPool";
import type { CreatorToken, HistoryRow, LpPosition, Market, OpenOrder, StopOrder, TradeRow } from "./types";

/**
 * Mapping the gateway's per-address rows onto the portfolio's row types.
 *
 * Three of the portfolio's tabs — Open orders, Order history, Trades — have had
 * real gateway routes (`/api/orders/:address/:pageSize/:page` and siblings) and
 * real fetchers in `queries/server/{orders,orderhistories,tradehistories}.ts`
 * the whole time. **Nothing called them**; `PortfolioView` built every tab from
 * `indexerData()`. This is the join, not new plumbing.
 *
 * Pure on purpose. This repo's vitest runs in the node environment and cannot
 * render a hook, so the mapping is what gets tested — the same reason
 * `composePairSnapshot` and `createSearchEngine` were factored out.
 *
 * What still has no source keeps its mock: the referee ROWS on the Referrals
 * tab (they want other people's addresses and volumes, which no route
 * publishes) and the Creator tab (nothing records which wallet launched what).
 * Wiring a tab whose data does not exist would mean inventing it, which is what
 * this change is removing.
 */

function market(base: string, quote: string, network: string): Market {
  return { base, quote, network };
}

/**
 * Formats a number for display without inventing precision.
 *
 * `toLocaleString` is deliberately avoided: this repo does not localize numbers
 * (see the i18n note in CLAUDE.md — `1.234,56` misreads a price), and a fixed
 * decimal count would print `0.00` for a real dust amount.
 */
function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return String(value);
}

function finite(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** An order id, or null — 0 is the contract's "no order", not order zero. */
function linkedOrderId(value: unknown): number | null {
  const parsed = optionalFinite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenAmount(value: unknown): string {
  const parsed = finite(value, Number.NaN);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { maximumFractionDigits: 8 })
    : "--";
}

function ageFrom(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Persisted launch ownership plus the token's current indexed market snapshot. */
export function toCreatorTokens(
  tokens: Record<string, unknown>[],
  network: string,
  pairsByBase: Map<string, Record<string, unknown>> = new Map(),
  /** The coin's band pool + own fee, read from chain; keyed by lowercase coin address. */
  launchPools: Map<string, LaunchPoolRead> = new Map(),
): CreatorToken[] {
  return tokens.map((token) => {
    const symbol = String(token.symbol ?? "?");
    const pair = pairsByBase.get(symbol.toUpperCase());
    const launchPool = launchPools.get(String(token.id ?? "").toLowerCase());
    const totalSupply = finite(token.totalSupply);
    // Book (the ladder's resting asks before graduation) PLUS the band pool
    // (where everything goes at graduation). Reading the book alone reported $0
    // for every graduated coin.
    const poolAmount = finite(pair?.dayBaseTvl) + (launchPool?.poolBase ?? 0);
    const takerFeeNum = launchPool?.takerFeeNum ?? null;
    const listingDate = finite(token.listingDate);
    const price = finite(pair?.price, Number.NaN);
    const quoteTvlUsd = finite(pair?.dayQuoteTvlUSD);

    return {
      symbol,
      name: String(token.name ?? symbol),
      address: String(token.id ?? ""),
      network,
      quote: String(pair?.quoteSymbol ?? "—"),
      rate: Number.isFinite(price) ? String(price) : "—",
      change24hPct: optionalFinite(token.dayPriceDifferencePercentage),
      marketCapUsd: optionalFinite(token.marketCap),
      holders: 0,
      volume24hUsd: finite(token.dayVolumeUSD),
      totalSupply: tokenAmount(totalSupply),
      poolAmount: tokenAmount(poolAmount),
      creatorAmount: "—",
      poolPct: totalSupply > 0 ? Math.min(100, Math.max(0, poolAmount / totalSupply * 100)) : 0,
      soldAmount: "—",
      soldPct: 0,
      inRange: true,
      rangeLow: "—",
      rangeHigh: "—",
      feeTierPct: takerFeeNum === null ? 0 : feePct(takerFeeNum),
      feeTierRead: takerFeeNum !== null,
      feesEarnedUsd: 0,
      seededUsd: finite(pair?.dayBaseTvlUSD) + quoteTvlUsd + (launchPool?.valueUsd ?? 0),
      deployedAt: listingDate > 0 ? new Date(listingDate * 1000).toLocaleString("en-US") : "—",
      age: ageFrom(listingDate),
      txHash: "—",
      // Was `.includes("alts")`, which never matched anything. The tag is
      // `iter_alts` but the URL it went with is `.../placeholder_token.png`, so
      // this tested the logo against a substring of a DIFFERENT field and the
      // Creator tab's "logo pending" hint could not fire for any token.
      logoPending: hasNoTokenLogo(token.logoURI),
      logoURI: hasNoTokenLogo(token.logoURI) ? undefined : String(token.logoURI),
      metaClaimed: false,
      pairId: pair ? String(pair.id ?? "") || null : null,
      quoteTvlUsd,
      thresholdUsd: 0,
      graduatedAt: null,
      graduatedAtQuoteTvlUsd: null,
      contractMarketCapUsd: null,
      graduationUsd: 0,
      feeGraduated: token.graduatedAt != null,
      // The coin's own fee from `launches(coin)` (1% for ladder launches);
      // 0.10% is the engine default a market falls back to when it can't be read.
      takerFeeNum: takerFeeNum ?? 100_000,
      maxCreatorTakerFeeNum: 1_000_000,
      creatorFeeLocked: false,
    };
  });
}

export interface LiveOrderRow {
  orderId?: number;
  pair?: string;
  isBid: boolean;
  base?: { id: string };
  quote?: { id: string };
  baseSymbol: string;
  quoteSymbol: string;
  price: number;
  amount?: number | null;
  placed?: number | null;
  amountBN?: string | null;
  placedBN?: string | null;
}

/**
 * Open orders.
 *
 * `filledPct` goes through `lib/orders/fillProgress`, never through arithmetic
 * done here. That module exists because `placed` is a float4 display estimate,
 * not EVM truth — thirty dust fills against a large order can move it not at
 * all — and it returns a discriminated result so "we do not know" stays
 * distinct from "0%".
 *
 * An `unknown` progress becomes 0 here ONLY because `OpenOrder.filledPct` is a
 * plain number with no room to say otherwise. **Do not read that zero as a
 * measurement**; the column that renders it (`Tables/OpenOrders`) does its own
 * clamping and tooltip off the real result. Widening `OpenOrder` to carry the
 * discriminant is the honest fix and belongs with the panel that shows it.
 */
export function toOpenOrders(orders: LiveOrderRow[], network: string): OpenOrder[] {
  return orders.map((o) => {
    const progress = fillProgress(o);
    const percent = progress.kind === "unknown" ? 0 : progress.percent;
    return {
      ...(o.orderId === undefined ? {} : { orderId: o.orderId }),
      ...(o.base?.id ? { baseAddress: o.base.id as `0x${string}` } : {}),
      ...(o.quote?.id ? { quoteAddress: o.quote.id as `0x${string}` } : {}),
      ...(o.pair ? { pairAddress: o.pair as `0x${string}` } : {}),
      ...(Number.isFinite(o.price) ? { priceValue: o.price } : {}),
      market: market(o.baseSymbol, o.quoteSymbol, network),
      side: o.isBid ? "Buy" : "Sell",
      price: num(o.price),
      amount: num(o.amount),
      filledPct: percent,
      fill: formatFillProgress(progress),
      // Partial the moment anything has filled. The chain decides "filled" by
      // deleting the row (see the OrderMatched `clear` flag), so a row being
      // here at all means it has NOT completed — which is why 100% is not a
      // status this function can return.
      status: percent > 0 ? "Partial" : "Open",
    };
  });
}

export function toStopOrders(rows: Record<string, unknown>[], network: string): StopOrder[] {
  return rows.map((row) => {
    const decimals = finite(row.assetDecimals);
    const rawAmount = BigInt(String(row.amountBN ?? "0"));
    const amount = Number(rawAmount) / 10 ** decimals;
    const status = String(row.status ?? "open").toLowerCase();
    return {
      orderId: finite(row.orderId),
      pairAddress: String(row.pair) as `0x${string}`,
      baseAddress: String(row.base) as `0x${string}`,
      quoteAddress: String(row.quote) as `0x${string}`,
      market: market(String(row.baseSymbol ?? "?"), String(row.quoteSymbol ?? "?"), network),
      side: row.isBid ? "Buy" : "Sell",
      kind: row.isMarket ? "Stop-market" : "Stop-limit",
      triggerPrice: num(Number(row.stopPriceBN ?? 0) / 1e8),
      limitPrice: num(Number(row.limitPriceBN ?? 0) / 1e8),
      amount: num(amount),
      deadline: finite(row.deadline),
      status: status === "expired" ? "Expired" : status === "canceled" ? "Canceled" : status === "activated" ? "Activated" : "Open",
      // Broker-written on activation (spotStopOrderHistories.regularOrderId), absent
      // on a dormant stop -- optionalFinite rather than finite so "no id yet" stays
      // null instead of collapsing to order 0.
      //
      // ZERO is also absent, and that is not defensive. Order ids start at 1 on both
      // sides (StopLimitOrderbook.place, ExchangeOrderbook._createOrder), and
      // StopOrderMatchingLib._process emits regularOrderId 0 for a stop-MARKET --
      // which never rests at all, because _executeMarket matches it immediately and
      // refunds the remainder. Passing that through rendered a "View order #0"
      // pointing at an order that cannot exist.
      regularOrderId: linkedOrderId(row.regularOrderId),
    };
  });
}

export interface LiveHistoryRow {
  isBid: boolean;
  baseSymbol: string;
  quoteSymbol: string;
  price: number;
  amount?: number | null;
  timestamp: number;
  /** Broker-written: "open" | "filled" | "canceled". Absent on older rows. */
  status?: string | null;
  /** Present on an order the gateway recovered from its fills. See `fills.ts`. */
  fills?: number | null;
  origins?: { pool: number; maker: number } | null;
}

/**
 * Order history.
 *
 * The broker writes `status` as lowercase `filled` / `canceled` (one `l`, per
 * the payload) and defaults it to `open`. An unrecognised value maps to "Open"
 * rather than guessing: claiming a fill that did not happen is the one error
 * here with consequences, and the same asymmetry is already documented for the
 * toast that reports these.
 *
 * Not every row here is a resting order any more. An order that crossed the
 * book entirely never emitted `OrderPlaced` and so was never written down; the
 * gateway recovers those from their fills. They arrive `filled`, with no
 * `orderId`, and carrying the counts below — which for them are the only record
 * of what the order traded against.
 */
export function toHistoryRows(rows: LiveHistoryRow[], network: string): HistoryRow[] {
  return rows.map((h) => ({
    market: market(h.baseSymbol, h.quoteSymbol, network),
    // Every row on this endpoint is a resting order that closed. The wire
    // carries no maker/taker distinction for the ORDER, so "Limit" is the only
    // honest label available.
    type: "Limit",
    side: h.isBid ? "Buy" : "Sell",
    price: num(h.price),
    size: num(h.amount),
    status: historyStatus(h.status),
    time: isoTime(h.timestamp),
    // Spread conditionally, so a row that carried no counts stays ABSENT rather
    // than arriving as zero — the distinction `fillSummary` refuses to collapse.
    ...(h.fills == null ? {} : { fills: h.fills }),
    ...(h.origins == null ? {} : { origins: h.origins }),
  }));
}

function historyStatus(raw: string | null | undefined): HistoryRow["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "filled":
      return "Filled";
    case "canceled":
    case "cancelled":
      return "Canceled";
    case "expired":
      return "Expired";
    default:
      return "Open";
  }
}

export interface LiveTradeRow {
  isBid: boolean;
  baseSymbol: string;
  quoteSymbol: string;
  price: number;
  baseAmount?: number | null;
  valueUSD?: number | null;
  timestamp: number;
  txHash: string;
  taker?: string;
  /** How many `OrderMatched` events the gateway grouped into this row. */
  fills?: number | null;
  /** Counts, not a verdict — one order routinely takes both kinds of liquidity. */
  origins?: { pool: number; maker: number } | null;
}

/**
 * Executed fills.
 *
 * `side` is from THIS WALLET's point of view. `isBid` describes the taker's
 * direction, so a maker whose resting sell was hit by a buy must not be shown
 * as having bought. When the wallet is the taker the two agree; when it is the
 * maker they are opposite. Without `account` to compare against, `isBid` is
 * reported as-is and flagged by the caller passing no address.
 *
 * The rule itself lives in `lib/trades/perspective` — the Pro terminal's trade
 * table needs the same one, and one wrong side reads as a real trade.
 */
export function toTradeRows(
  rows: LiveTradeRow[],
  network: string,
  account?: string,
): TradeRow[] {
  return rows.map((t) => {
    return {
      kind: "order" as const,
      market: market(t.baseSymbol, t.quoteSymbol, network),
      side: viewerSide(t.isBid, t.taker, account),
      // Passed through rather than defaulted: a gateway that predates the
      // grouping sends neither, and `fills: 1` would claim a single fill we
      // have not been told about.
      ...(t.fills == null ? {} : { fills: t.fills }),
      ...(t.origins == null ? {} : { origins: t.origins }),
      price: num(t.price),
      amount: num(t.baseAmount),
      valueUsd: num(t.valueUSD),
      time: isoTime(t.timestamp),
      txHash: t.txHash,
    };
  });
}

/**
 * Seconds or milliseconds, both accepted.
 *
 * Broker timestamps are seconds; `Date.now()`-derived ones are milliseconds,
 * and both reach these rows. Treating seconds as milliseconds dates every fill
 * to 1970, which renders as a plausible-looking date rather than an error.
 */
export function isoTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  return new Date(ms).toISOString();
}

export interface LiveLpRow {
  base: string | null;
  quote: string | null;
  baseAmount: number | null;
  quoteAmount: number | null;
  minPrice: number;
  maxPrice: number;
  active: boolean;
  inRange: boolean;
  pairSymbol: string | null;
}

/**
 * LP positions.
 *
 * `spotLiquidityRanges` is event-sourced from the PositionManager singleton, and
 * `Pool.addLiquidity`/`removeLiquidity` are `onlyPositionManager` on chain — so
 * the table sees every liquidity change across every pool. The route already
 * joins the pool and pair and computes `inRange` against the live price.
 *
 * **Closed positions are dropped.** `active` false is a withdrawn range, and the
 * tab is "LP positions", not their history. The rows still exist for anything
 * that wants a ledger.
 *
 * `singleSided` is derived rather than stored: a range with liquidity on one leg
 * only is what the swap card's Earn disposition opens, and the portfolio spec
 * calls for labelling it. Both amounts present means a two-sided range.
 *
 * `aprPct` comes from the POOL, keyed by pair symbol, for both generations —
 * there is no per-position APR to have. `feesEarnedUsd` and `valueUsd` ARE per
 * position, and for bands only, assembled by `lib/portfolio/lpFees`. Null
 * propagates rather than becoming zero on any of them.
 */
export function toLpPositions(
  rows: LiveLpRow[],
  network: string,
  aprByPair: Map<string, number | null> = new Map(),
  /**
   * LP tokens, appended after the ranges -- ONE row per token, its bands inside
   * (v2). A separate argument because the shapes share almost nothing: a band
   * token has no min/max and no meaningful `inRange`.
   */
  tokens: LpToken[] = [],
  /** Lifetime fees per token in USD (collected + claimable), or null when unmeasured. */
  feesUsdByToken: Map<string, number | null> = new Map(),
): LpPosition[] {
  const ranges = rows
    .filter((r) => r.active)
    .map((r) => {
      // The positions endpoint stores pool token addresses in base/quote and
      // separately joins the human-readable pair symbol. Displaying the raw
      // addresses as a pair made a valid ETH/USDC position look unidentified.
      const pairParts = r.pairSymbol?.split("/");
      const base = pairParts?.length === 2 && pairParts[0] ? pairParts[0] : (r.base ?? "?");
      const quote = pairParts?.length === 2 && pairParts[1] ? pairParts[1] : (r.quote ?? "?");
      const hasBase = (r.baseAmount ?? 0) > 0;
      const hasQuote = (r.quoteAmount ?? 0) > 0;
      const key = r.pairSymbol ?? `${base}/${quote}`;
      return {
        market: market(base, quote, network),
        provided: providedLabel(r, base, quote),
        aprPct: aprByPair.get(key) ?? null,
        // No per-position fee accrual exists anywhere in the stack.
        feesEarnedUsd: null,
        inRange: r.inRange,
        singleSided: hasBase !== hasQuote,
        kind: "range" as const,
      };
    });

  const bandRows: LpPosition[] = tokens
    .filter((t) => t.active)
    .map((t) => {
      // Identical key to the ranges', so one `aprByPair` serves both generations.
      const key = `${t.baseSymbol}/${t.quoteSymbol}`;
      return {
        market: market(t.baseSymbol, t.quoteSymbol, network),
        provided: `#${t.tokenId} · ${t.bands.length} band${t.bands.length === 1 ? "" : "s"}`,
        aprPct: aprByPair.get(key) ?? null,
        feesEarnedUsd: feesUsdByToken.get(t.tokenId) ?? null,
        // Priced by the gateway in SQL, summed over the token's bands.
        valueUsd: t.valueUSD,
        inRange: true,
        kind: "band" as const,
        tokenId: t.tokenId,
        bands: t.bands.map((b) => ({
          band: b.band,
          sharePct: b.sharePct,
          width: b.toleranceBuy,
          feeMultiplier: b.feeMultiplier,
        })),
      };
    });

  return [...ranges, ...bandRows];
}

function providedLabel(r: LiveLpRow, base: string, quote: string): string {
  const parts: string[] = [];
  if ((r.baseAmount ?? 0) > 0) parts.push(`${num(r.baseAmount)} ${base}`);
  if ((r.quoteAmount ?? 0) > 0) parts.push(`${num(r.quoteAmount)} ${quote}`);
  // A range with neither leg funded is not a position anyone provided to; say so
  // rather than printing an empty cell.
  return parts.length > 0 ? parts.join(" + ") : "--";
}
