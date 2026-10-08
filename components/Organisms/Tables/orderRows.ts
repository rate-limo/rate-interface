/**
 * Pure helpers behind the account tables (Open orders · History · Fills ·
 * Balances), shared by the desktop tables and the phone cards so the two can
 * never disagree about what a row says.
 */
import { formatPrice } from "@/lib/format/price";
import { explorerUrlForNetwork } from "@/lib/search/explorer";
import { counterpartyOf, type CounterpartyView } from "@/lib/trades/counterparty";

// ── Cancel ──────────────────────────────────────────────────────────────────

/** One entry of `MatchingEngine.cancelOrders(CancelOrderInput[])`. */
export type CancelOrderInput = {
  base: `0x${string}`;
  quote: `0x${string}`;
  isBid: boolean;
  /** uint32 on chain, which viem types as a `number`. */
  orderId: number;
};

type CancellableOrder = {
  base: string;
  quote: string;
  isBid: boolean;
  orderId: number | string | bigint | null | undefined;
};

const UINT32_MAX = 4_294_967_295;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * True when an order-history row crossed the book outright and never rested,
 * so the chain never issued it an id.
 *
 * The gateway says so in `rested`. A gateway older than that field said it
 * through `orderId` alone — null, or 0 for one build that was pushed but never
 * deployed — and that fallback is read ONLY when `rested` is absent. Remove it
 * once every gateway sends `rested`.
 */
export function neverRested(row: {
  rested?: boolean | null;
  orderId?: number | bigint | string | null;
}): boolean {
  if (typeof row.rested === "boolean") return !row.rested;
  return !hasOrderId(row.orderId);
}

/** An engine order id: an integer from 1 up. Ids start at 1, so nothing below is one. */
function hasOrderId(orderId: number | bigint | string | null | undefined): boolean {
  if (orderId === null || orderId === undefined || orderId === "") return false;
  const id = Number(orderId);
  return Number.isInteger(id) && id >= 1;
}

/**
 * The ONE argument `cancelOrders` takes: a list of `{base, quote, isBid, orderId}`.
 *
 * It used to be built as four parallel arrays — `[bases, quotes, isBids, ids]` —
 * which is the shape of an older engine. Against the deployed ABI viem refused
 * to encode it (`AbiEncodingLengthMismatchError`: four values for one input), so
 * nothing was ever sent and the error reached only the console.
 *
 * Throws on a row that cannot be cancelled rather than sending a malformed
 * entry: an order with no id (one that crossed outright) never rested, and a
 * non-address base/quote would revert after costing the user a signature.
 */
export function buildCancelArgs(orders: readonly CancellableOrder[]): CancelOrderInput[] {
  return orders.map((o) => {
    if (!ADDRESS.test(o.base) || !ADDRESS.test(o.quote)) {
      throw new Error(`Cannot cancel order ${String(o.orderId)}: base/quote is not an address`);
    }
    if (o.orderId === null || o.orderId === undefined || o.orderId === "") {
      throw new Error("Cannot cancel an order with no id");
    }
    const id = Number(o.orderId);
    if (!Number.isInteger(id) || id < 1 || id > UINT32_MAX) {
      throw new Error(`Cannot cancel order ${String(o.orderId)}: id is not a uint32 from 1 up`);
    }
    return {
      base: o.base as `0x${string}`,
      quote: o.quote as `0x${string}`,
      isBid: o.isBid,
      orderId: id,
    };
  });
}

// ── History status ──────────────────────────────────────────────────────────

export type HistoryStatusKind = "open" | "filled" | "partial" | "cancelled" | "expired" | "unknown";

type StatusRow = {
  status?: string | null;
  matchHistories?: readonly unknown[] | null;
  fills?: number | null;
};

/**
 * What became of an order, from the broker's `spotOrderHistories.status`.
 *
 * The broker writes `open` on placement, `filled` when a match clears the order
 * (`OrderMatched.clear`), `canceled` — one l — when it is pulled, and `expired`
 * when a deadline passes. A cancelled order that had already traded is
 * "Partly filled": the fills are real and a bare "Cancelled" would hide them.
 *
 * An unrecognised value is `unknown`, never `filled` — claiming a fill that may
 * not have happened is the worse error.
 */
export function historyStatus(row: StatusRow): { kind: HistoryStatusKind; label: string } {
  const s = (row.status ?? "").toLowerCase();
  const traded = (row.matchHistories?.length ?? 0) > 0 || (row.fills ?? 0) > 0;
  switch (s) {
    case "open":
      return { kind: "open", label: traded ? "Open · partly filled" : "Open" };
    case "filled":
      return { kind: "filled", label: "Filled" };
    case "canceled":
    case "cancelled":
      return traded ? { kind: "partial", label: "Partly filled" } : { kind: "cancelled", label: "Cancelled" };
    case "expired":
      return traded ? { kind: "partial", label: "Partly filled" } : { kind: "expired", label: "Expired" };
    default:
      return { kind: "unknown", label: s ? s[0].toUpperCase() + s.slice(1) : "Unknown" };
  }
}

/** History lists FINISHED orders; an open one belongs to the Open tab. */
export function isFinished(row: StatusRow): boolean {
  return historyStatus(row).kind !== "open";
}

type SizedRow = {
  amount?: number | string | null;
  amountBN?: string | number | bigint | null;
  assetDecimals?: number | null;
};

/**
 * The order's size in its deposit asset.
 *
 * Prefers the exact `amountBN`: a full cancel writes `amount: 0` to the history
 * row (OrderCanceled/AccountOrder), so the float column alone printed every
 * cancelled order as "0 KPRF". `amountBN` is untouched by a full cancel.
 */
export function historySize(row: SizedRow): number {
  if (row.amountBN !== null && row.amountBN !== undefined && row.assetDecimals != null) {
    const n = Number(row.amountBN) / 10 ** row.assetDecimals;
    if (Number.isFinite(n) && n > 0) return n;
  }
  const f = Number(row.amount ?? 0);
  return Number.isFinite(f) ? f : 0;
}

type Fill = { baseAmount?: number | null; quoteAmount?: number | null };

/**
 * Size-weighted average fill price (Σquote / Σbase), or null with no fills.
 * Crossed rows carry their own `price` (already the group's), so callers fall
 * back to the order price when this answers null.
 */
export function avgFillPrice(fills: readonly Fill[] | null | undefined): number | null {
  if (!fills || fills.length === 0) return null;
  let base = 0;
  let quote = 0;
  for (const f of fills) {
    base += Number(f.baseAmount ?? 0);
    quote += Number(f.quoteAmount ?? 0);
  }
  return base > 0 && Number.isFinite(quote / base) ? quote / base : null;
}

// ── Formatting ──────────────────────────────────────────────────────────────

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * An amount, grouped: 15000000 → "15,000,000", 1234.5678 → "1,234.57",
 * 0.000123456 → "0.0001235". Never rounds a nonzero amount to "0".
 */
export function formatAmount(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 1) return formatPrice(n, 4);
  const decimals = abs >= 1000 ? 2 : 4;
  const fixed = abs.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const [i, f] = fixed.split(".");
  return (n < 0 ? "-" : "") + (f === undefined ? group(i) : `${group(i)}.${f}`);
}

/** "Oct 4, 14:49" in the viewer's zone; date AND time, since history spans days. */
export function formatDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—";
  const d = new Date(unixSeconds * 1000);
  const month = d.toLocaleString("en-US", { month: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${d.getDate()}, ${hh}:${mm}`;
}

/** Explorer link for a transaction, or null when the hash or explorer is unknown. */
export function txUrl(networkName: string, hash: string | null | undefined): string | null {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  const explorer = explorerUrlForNetwork(networkName);
  return explorer ? `${explorer.replace(/\/$/, "")}/tx/${hash}` : null;
}

/** Explorer link for a wallet or contract, or null when the address or explorer is unknown. */
export function addressUrl(networkName: string, address: string | null | undefined): string | null {
  if (!address || !ADDRESS.test(address)) return null;
  const explorer = explorerUrlForNetwork(networkName);
  return explorer ? `${explorer.replace(/\/$/, "")}/address/${address}` : null;
}

// ── Fills ───────────────────────────────────────────────────────────────────

type FeeRow = {
  isBid: boolean;
  taker?: string | null;
  baseFee?: number | null;
  quoteFee?: number | null;
  /** A band pool's fee, in the token the taker received; null on book fills. */
  poolFee?: number | null;
  poolFeeEstimated?: boolean | null;
  baseSymbol?: string;
  quoteSymbol?: string;
};

export type FeeLabel = {
  /** What the cell shows: "400 KPRF", "≈ 400 KPRF", "0". */
  text: string;
  /** The amount is an estimate — the cell marks it and explains why. */
  estimated: boolean;
  /** The cell's tooltip: what this fee is. */
  title: string;
};

/**
 * The fee cell for one fill, everywhere a fill is listed — the one decision the
 * desktop table, the phone cards and the History fill list share. Never a
 * guessed percentage. In order:
 *
 *  1. **The viewer was the MAKER:** "0". Makers are not charged — the engine
 *     passes `applyFee: false` on the maker leg structurally.
 *  2. **A band pool filled it:** the pool's fee, in the token received. The
 *     pool takes it out of what it pays, and no event carries it, so the broker
 *     recovers it (`poolFee`); "≈" marks an estimate it could not reproduce to
 *     the wei.
 *  3. **Otherwise** the taker fee the broker recorded, on the leg received.
 */
export function fillFeeLabel(row: FeeRow, viewer: string | null | undefined): FeeLabel {
  const isTaker = !viewer || (row.taker ?? "").toLowerCase() === viewer.toLowerCase();
  if (!isTaker) return { text: "0", estimated: false, title: "Makers pay no fee" };

  const received = row.isBid ? row.baseSymbol : row.quoteSymbol;
  const pool = row.poolFee == null ? null : Number(row.poolFee);
  if (pool !== null && Number.isFinite(pool)) {
    const estimated = row.poolFeeEstimated === true;
    return {
      text: `${estimated ? "≈ " : ""}${formatAmount(pool)} ${received ?? ""}`.trim(),
      estimated,
      title: estimated
        ? "Estimated pool fee: the pool's rate on its tightest band. The fill could not be reproduced to the unit, so the exact split across bands is unknown."
        : "Pool fee, taken out of what you received",
    };
  }

  const baseFee = Number(row.baseFee ?? 0);
  const quoteFee = Number(row.quoteFee ?? 0);
  const title = "Taker fee, on the leg received";
  if (baseFee > 0) return { text: `${formatAmount(baseFee)} ${row.baseSymbol ?? ""}`.trim(), estimated: false, title };
  if (quoteFee > 0) return { text: `${formatAmount(quoteFee)} ${row.quoteSymbol ?? ""}`.trim(), estimated: false, title };
  return { text: "0", estimated: false, title };
}

/** The fee cell's text alone. See {@link fillFeeLabel}. */
export function fillFee(row: FeeRow, viewer: string | null | undefined): string {
  return fillFeeLabel(row, viewer).text;
}

// ── Counterparty ─────────────────────────────────────────────────────────────
// Who filled a row, from the viewer's side, lives in lib/trades/counterparty.

/** `{pool, maker}` counts, as the grouped routes return them. */
export type Origins = { pool?: number | null; maker?: number | null };

/**
 * The collapsed row's summary of how an order filled: "3 fills · 1 via pool",
 * "1 fill · via pool", "2 fills". Null for an order that never filled.
 */
export function fillSplitLabel(fills: number, viaPool: number): string | null {
  if (!Number.isFinite(fills) || fills <= 0) return null;
  const head = `${fills} ${fills === 1 ? "fill" : "fills"}`;
  if (viaPool <= 0) return head;
  if (viaPool >= fills) return `${head} · ${fills === 1 ? "via pool" : "all via pool"}`;
  return `${head} · ${viaPool} via pool`;
}

/**
 * How one fill executed, from the viewer's side: the pool filled it, or the
 * viewer was the maker (their resting order was hit), or the taker (they hit a
 * resting order).
 */
export type FillType = "Pool" | "Maker" | "Taker";

/** One fill as the expanded History row lists it. */
export type FillDetailView = {
  key: string;
  when: string;
  type: FillType;
  price: string;
  amount: string;
  /** The fill's own transaction; a rested order's fills land in later ones. */
  tx: string | null;
  /** Who filled it, from the viewer's side. */
  counterparty: CounterpartyView;
  fee: FeeLabel;
};

type FillDetailRow = {
  tradeId?: string | number | bigint | null;
  txHash?: string | null;
  timestamp?: number | null;
  price?: number | null;
  baseAmount?: number | null;
  baseSymbol?: string | null;
  quoteSymbol?: string | null;
  origin?: string | null;
  isBid?: boolean | null;
  taker?: string | null;
  maker?: string | null;
  makerOrderId?: number | null;
  orderId?: number | null;
  baseFee?: number | null;
  quoteFee?: number | null;
  poolFee?: number | null;
  poolFeeEstimated?: boolean | null;
};

/**
 * Pool, Maker or Taker for one fill. The addresses decide when they are there:
 * an order that rested may still have taken liquidity when it was placed, so
 * "rested" alone would mislabel those first fills. `rested` is the fallback
 * for rows that do not name both sides.
 */
export function fillType(
  f: { origin?: string | null; taker?: string | null; maker?: string | null },
  viewer: string | null | undefined,
  rested: boolean,
): FillType {
  if (f.origin === "pool") return "Pool";
  const me = viewer?.toLowerCase();
  if (me && f.taker?.toLowerCase() === me) return "Taker";
  if (me && f.maker?.toLowerCase() === me) return "Maker";
  return rested ? "Maker" : "Taker";
}

/** The fills behind one History row, in the order the gateway sent them. */
export function toFillDetailViews(
  fills: readonly FillDetailRow[] | null | undefined,
  viewer?: string | null,
  opts: { rested?: boolean; networkName?: string } = {},
): FillDetailView[] {
  return (fills ?? []).map((f, i) => ({
    key: `${f.txHash ?? ""}-${String(f.tradeId ?? "")}-${i}`,
    when: formatDateTime(f.timestamp),
    type: fillType(f, viewer, opts.rested === true),
    price: formatPrice(Number(f.price ?? 0)),
    amount: `${formatAmount(f.baseAmount)} ${f.baseSymbol ?? ""}`.trim(),
    tx: opts.networkName ? txUrl(opts.networkName, f.txHash) : null,
    counterparty: counterpartyOf(
      { origin: f.origin, taker: f.taker, maker: f.maker, makerOrderId: f.makerOrderId, orderId: f.orderId },
      viewer,
    ),
    fee: fillFeeLabel(
      {
        isBid: f.isBid === true,
        taker: f.taker,
        baseFee: f.baseFee,
        quoteFee: f.quoteFee,
        poolFee: f.poolFee,
        poolFeeEstimated: f.poolFeeEstimated,
        baseSymbol: f.baseSymbol ?? undefined,
        quoteSymbol: f.quoteSymbol ?? undefined,
      },
      viewer,
    ),
  }));
}

/** Where an expanded History row gets its fills from. */
export type HistoryFillsSource =
  /** A rested order: its fills arrived with the row, in `matchHistories`. */
  | { kind: "inline"; rows: FillDetailView[] }
  /** A crossed order: one request away, by transaction and pair. */
  | { kind: "lazy"; txHash: string; pair: string };

type HistoryFillsRow = {
  account?: string | null;
  rested?: boolean | null;
  orderId?: number | string | null;
  txHash?: string | null;
  pair?: string | null;
  fills?: number | null;
  origins?: Origins | null;
  matchHistories?: readonly FillDetailRow[] | null;
};

/**
 * How one History row filled: the count, how many of those the pool filled,
 * the collapsed summary, and where the per-fill list comes from.
 *
 * A crossed order (`rested: false` — it never rested) carries `fills` and
 * `origins` inline and its fills come from the drill-down route; a rested
 * order carries its fills as `matchHistories`. `viaPool` is null when the
 * gateway sent no counts, and the summary then says only how many fills.
 */
export function historyFills(row: HistoryFillsRow, networkName?: string): {
  fillCount: number;
  viaPool: number | null;
  split: string | null;
  source: HistoryFillsSource | null;
} {
  if (neverRested(row)) {
    const fillCount = Number(row.fills ?? 0);
    const viaPool = row.origins ? Number(row.origins.pool ?? 0) : null;
    const source: HistoryFillsSource | null =
      fillCount > 0 && row.txHash && row.pair ? { kind: "lazy", txHash: row.txHash, pair: row.pair } : null;
    return { fillCount, viaPool, split: fillSplitLabel(fillCount, viaPool ?? 0), source };
  }
  const fills = row.matchHistories ?? [];
  const viaPool = fills.filter((f) => f.origin === "pool").length;
  return {
    fillCount: fills.length,
    viaPool,
    split: fillSplitLabel(fills.length, viaPool),
    // The row's own account is the viewer: a rested order's fills are ones it
    // MADE, so each fill's fee is read from the maker's side.
    source:
      fills.length > 0
        ? { kind: "inline", rows: toFillDetailViews(fills, row.account, { rested: true, networkName }) }
        : null,
  };
}

/**
 * An order's Type in History: Maker if it rested on the book, Pool if every
 * fill came from the pool, Taker otherwise (it took resting orders, alone or
 * alongside the pool).
 */
export function orderType(row: { rested?: boolean | null; orderId?: number | string | null }, fillCount: number, viaPool: number | null): FillType {
  if (!neverRested(row)) return "Maker";
  if (fillCount > 0 && viaPool !== null && viaPool >= fillCount) return "Pool";
  return "Taker";
}

// ── Balances ────────────────────────────────────────────────────────────────

type BalanceRow = { balance?: number | null; valueUSD?: number | null };

/**
 * Non-zero holdings first (largest value, then largest balance), then
 * everything else in the order it arrived. Stable, and does not mutate.
 */
export function sortHoldingsFirst<T extends BalanceRow>(tokens: readonly T[]): T[] {
  const held = (t: T) => Number(t.balance ?? 0) > 0;
  return tokens
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ha = held(a.t);
      const hb = held(b.t);
      if (ha !== hb) return ha ? -1 : 1;
      if (ha && hb) {
        const dv = Number(b.t.valueUSD ?? 0) - Number(a.t.valueUSD ?? 0);
        if (dv !== 0) return dv;
        const db = Number(b.t.balance ?? 0) - Number(a.t.balance ?? 0);
        if (db !== 0) return db;
      }
      return a.i - b.i;
    })
    .map(({ t }) => t);
}
