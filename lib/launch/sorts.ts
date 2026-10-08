import type { TokenRanking } from "@/hooks/useTokens";

/**
 * The orders the launch directory offers.
 *
 * ## Every one of these is served
 *
 * There is no entry here that the gateway cannot rank, and that is the whole
 * constraint. A sort that silently does nothing — or quietly falls back to
 * another order — is a control that appears to work and changes nothing, which
 * is worse than not offering it. `Holders` is the option this list is missing
 * for that reason: nothing in the monorepo indexes ERC-20 `Transfer`, so holder
 * count is not a missing endpoint but a missing indexer. It appears the day
 * that lands, not before.
 *
 * ## `progress` is the one client-side sort, and only because it is safe
 *
 * The grid fetches one page. Sorting that page in the browser orders the rows
 * it happened to GET — and which rows it got was itself chosen by the ranking —
 * so "sort client-side" normally answers a different question than the one
 * asked. Progress is the exception: it is market cap divided by a constant
 * threshold, so it is monotonic with the market-cap ranking that fetches the
 * page. The page is already the right set of rows; only the order changes.
 *
 * That asymmetry does not generalise. Anything else added here must come with a
 * route.
 */
export type LaunchSort =
  | "marketcap"
  | "last-trade"
  | "volume"
  | "change"
  | "trades"
  | "price"
  | "newest"
  | "oldest"
  | "trending"
  | "progress";

export interface LaunchSortOption {
  key: LaunchSort;
  label: string;
  /** The gateway ranking that fetches the page for this sort. */
  ranking: TokenRanking;
  /** Ordered in the browser over the fetched page. Only `progress`. */
  client?: true;
  /** Shown under the label when the sort needs explaining. */
  note?: string;
}

export const LAUNCH_SORTS: readonly LaunchSortOption[] = [
  { key: "marketcap", label: "Market cap", ranking: "top-marketcap" },
  { key: "last-trade", label: "Last trade", ranking: "last-trade", note: "live as trades land" },
  { key: "volume", label: "24h volume", ranking: "top-volume" },
  { key: "change", label: "24h change", ranking: "top-gainer" },
  { key: "trades", label: "Trade count", ranking: "trade-count" },
  { key: "price", label: "Price", ranking: "price" },
  { key: "newest", label: "Newest", ranking: "new" },
  { key: "oldest", label: "Oldest", ranking: "oldest" },
  { key: "trending", label: "Trending", ranking: "trending" },
  {
    key: "progress",
    label: "Progress",
    // Deliberately the market-cap page: progress is cap ÷ a constant, so the
    // ranking that fetches the rows already agrees with the order applied over
    // them. See the note above.
    ranking: "top-marketcap",
    client: true,
    note: "to the listing threshold",
  },
];

export const DEFAULT_LAUNCH_SORT: LaunchSort = "marketcap";

export function launchSort(key: string): LaunchSortOption {
  return LAUNCH_SORTS.find((s) => s.key === key) ?? LAUNCH_SORTS[0]!;
}

/**
 * Whether a trade should MOVE a card or merely mark it.
 *
 * Under "Last trade" the live hoist IS this sort — a fill is exactly what the
 * list is ordered by, so moving the card keeps the ranking true between
 * fetches. Under anything else it is a second ordering fighting the one the
 * reader chose: pick "Market cap" and a hoisting grid is not sorted by market
 * cap. The `traded` chip still appears either way, because the trade is worth
 * knowing about; it just stops overruling the order.
 */
export function hoistReorders(sort: LaunchSort): boolean {
  return sort === "last-trade";
}

/**
 * Applies the one client-side order, or returns the rows untouched.
 *
 * Tokens with no market cap sort LAST rather than as zero — the same rule the
 * gateway's NULLS LAST gives every server-side ranking. An unknown cap is not a
 * cap of nothing.
 */
export function applyClientSort<T extends { marketCap?: number | null }>(
  tokens: readonly T[],
  sort: LaunchSort,
): T[] {
  if (sort !== "progress") return [...tokens];
  // Progress is cap ÷ threshold and the threshold is the same for every row, so
  // ordering by cap IS ordering by progress — no threshold needed here, and no
  // divide-by-zero to guard when the operator has not set one.
  return [...tokens].sort((a, b) => {
    const left = typeof a.marketCap === "number" && Number.isFinite(a.marketCap) ? a.marketCap : -1;
    const right = typeof b.marketCap === "number" && Number.isFinite(b.marketCap) ? b.marketCap : -1;
    return right - left;
  });
}
