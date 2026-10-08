import { makerOrderIdOf } from "./identity";
import { sameAddress, wasTaker } from "./perspective";

/**
 * Who the VIEWER traded with on one row of their history.
 *
 * Seen from the viewer's side, like Side and Role (./perspective): a taker's
 * counterparty is the maker whose order they hit, or the pool; a maker's is
 * the taker who hit them. The gateway's `origins` counts said only "Pool" or
 * "Trader", so this replaces them wherever the row can say more.
 *
 * Where the answer comes from, most exact first:
 *
 *  1. **An explicit set.** `/api/tradehistory` and the crossed rows of
 *     `/api/orderhistory` send `counterparties` (up to five trader addresses),
 *     the exact `counterpartyCount`, and `poolAddress`. A live envelope gets the
 *     same three attached by `useTradeHistory`, from its fills.
 *  2. **One fill's own sides.** A single fill names both parties, so the other
 *     one is the counterparty. Pool when `origin` says so, or when the fill
 *     consumed no resting order (`makerOrderId` null is how the engine spells a
 *     pool fill).
 *  3. **`origins` counts**, from a gateway older than the set: "Pool", "Trader"
 *     or "Pool + Trader", with nothing to link.
 *  4. Nothing: a dash.
 *
 * `maker` on a row covering more than one fill is never read: the gateway
 * reports `min(maker)` there, one of several and not THE counterparty.
 */

export type CounterpartyKind = "none" | "legacy" | "self" | "pool" | "trader" | "many";

export type CounterpartyView = {
  kind: CounterpartyKind;
  /**
   * What the collapsed cell reads with no names resolved yet: "Pool", a short
   * address, "3 traders", "Pool + 2 traders", a legacy "Trader", "You", or "—".
   */
  label: string;
  /** The pool, when it filled any of the row. `address` is null when only a
   *  count said so (older gateway), and the label then cannot link. */
  pool: { address: string | null } | null;
  /** Trader addresses known for the row, at most the gateway's cap. */
  traders: string[];
  /** Traders counted but not listed (`counterpartyCount` past the cap). */
  more: number;
};

type Origins = { pool?: number | null; maker?: number | null };

export type CounterpartyRow = {
  counterparties?: readonly string[] | null;
  counterpartyCount?: number | null;
  poolAddress?: string | null;
  origins?: Origins | null;
  /** Per-fill scalar from the fills routes: "pool" or "maker". */
  origin?: string | null;
  /** How many fills the row stands for; absent or 1 is a single fill. */
  fills?: number | null;
  taker?: string | null;
  maker?: string | null;
  makerOrderId?: number | null;
  orderId?: number | null;
};

const NONE: CounterpartyView = { kind: "none", label: "—", pool: null, traders: [], more: 0 };

/** `0xA3f5…9a61`, for a cell. The full address stays in the link and its title. */
export function shortWallet(address: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function plural(n: number): string {
  return `${n} ${n === 1 ? "trader" : "traders"}`;
}

/** Build the view from a pool (or none) and a trader list. */
function fromSet(pool: CounterpartyView["pool"], traders: string[], count: number): CounterpartyView {
  const total = Math.max(count, traders.length);
  const more = total - traders.length;
  if (pool && total === 0) return { kind: "pool", label: "Pool", pool, traders: [], more: 0 };
  if (!pool && total === 1 && traders.length === 1) {
    return { kind: "trader", label: shortWallet(traders[0]!), pool: null, traders, more: 0 };
  }
  if (total === 0) return NONE;
  return { kind: "many", label: pool ? `Pool + ${plural(total)}` : plural(total), pool, traders, more };
}

function legacyLabel(origins: Origins | null | undefined): string | null {
  if (!origins) return null;
  const pool = Number(origins.pool ?? 0);
  const maker = Number(origins.maker ?? 0);
  if (pool > 0 && maker > 0) return "Pool + Trader";
  if (pool > 0) return "Pool";
  if (maker > 0) return "Trader";
  return null;
}

export function counterpartyOf(row: CounterpartyRow, viewer?: string | null): CounterpartyView {
  // 1. The explicit set.
  if (Array.isArray(row.counterparties)) {
    const traders = row.counterparties.filter((a) => !!a && !sameAddress(a, viewer));
    const poolFilled = !!row.poolAddress || Number(row.origins?.pool ?? 0) > 0;
    const pool = poolFilled ? { address: row.poolAddress ?? null } : null;
    const view = fromSet(pool, traders, Number(row.counterpartyCount ?? traders.length));
    // Nothing but the viewer on the other side: a self-match, which has no
    // counterparty to name. Said, rather than left as a dash that reads as
    // "unknown" — the gateway knows exactly what it was.
    if (view.kind === "none" && Number(row.origins?.maker ?? 0) > 0) {
      return { ...NONE, kind: "self", label: "You" };
    }
    return view;
  }

  // 2. One fill: the other side of it.
  const single = row.fills == null || Number(row.fills) === 1;
  if (single) {
    const tookIt = wasTaker(row.taker, viewer);
    const poolFill =
      tookIt &&
      (row.origin === "pool" ||
        (row.origin == null && (row.makerOrderId !== undefined || row.orderId != null) && makerOrderIdOf(row) === null));
    if (poolFill) return fromSet({ address: row.maker ?? null }, [], 0);
    const other = tookIt ? row.maker : row.taker;
    if (other) {
      if (viewer && sameAddress(other, viewer)) return { ...NONE, kind: "self", label: "You" };
      return fromSet(null, [other], 1);
    }
    if (row.origin === "maker") return { ...NONE, kind: "legacy", label: "Trader" };
  }

  // 3. Counts from an older gateway.
  const legacy = legacyLabel(row.origins);
  if (legacy) {
    return {
      kind: "legacy",
      label: legacy,
      pool: Number(row.origins?.pool ?? 0) > 0 ? { address: null } : null,
      traders: [],
      more: 0,
    };
  }
  return NONE;
}

/**
 * Every trader address a list of views can show, collapsed rows AND the lists
 * behind "N traders", so one `/api/identities` call names all of them and
 * opening a list never fires a second one.
 */
export function counterpartyAddresses(views: readonly CounterpartyView[]): string[] {
  return views.flatMap((v) => v.traders);
}
