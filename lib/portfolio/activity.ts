import type { ActivityRow } from "./types";

/**
 * The Trades tab: one timeline, two row shapes.
 *
 * Swaps and orders are different units — a swap is a whole route, an order is
 * one book's worth of fills — but they are the same person's afternoon, so they
 * share one time-ordered list and the row SHAPE carries the difference. Filters
 * narrow it; separate tabs would split it.
 *
 * That choice is forced as much as chosen: `ActivityTabs` already renders six
 * tabs plus a conditional Creator, and an eighth would split a wallet's history
 * by a distinction they made hours ago and will not recall — so answering "what
 * did I trade today" would mean checking two places and adding them up.
 *
 * ## The invariant this module exists to hold
 *
 * A card swap and the fills underneath it are the SAME money. `spotSwaps` has
 * one row per route and `spotTrades` has one per fill, and both are fetched, so
 * a naive concatenation lists a swap twice — once as itself, once as the trade
 * its fills grouped into. Anyone totalling their history would count it twice
 * and disagree with their own wallet.
 *
 * `mergeActivity` is where that is prevented: a swap's transaction wins, and any
 * order row sharing its hash is dropped. The swap is the higher altitude and the
 * one the user acted at; its fills remain reachable through Pro.
 */

export type ActivityFilter = "all" | "swaps" | "orders";

/** Newest first; ties broken by hash so the order is stable across renders. */
function byTimeDesc(a: ActivityRow, b: ActivityRow): number {
  if (a.time === b.time) return a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0;
  return a.time < b.time ? 1 : -1;
}

/**
 * One entry per transaction, newest first.
 *
 * Swaps take precedence over orders on the same transaction — see the invariant
 * above. An order row with no `txHash` cannot be checked against anything, so it
 * is kept: dropping rows we cannot identify would silently shrink a history.
 */
export function mergeActivity(swaps: ActivityRow[], orders: ActivityRow[]): ActivityRow[] {
  const swapTx = new Set(
    swaps.map((s) => s.txHash).filter((h): h is string => !!h).map((h) => h.toLowerCase()),
  );
  const kept = orders.filter((o) => !o.txHash || !swapTx.has(o.txHash.toLowerCase()));
  return [...swaps, ...kept].sort(byTimeDesc);
}

export function filterActivity(rows: ActivityRow[], filter: ActivityFilter): ActivityRow[] {
  if (filter === "all") return rows;
  const want = filter === "swaps" ? "swap" : "order";
  return rows.filter((r) => r.kind === want);
}

/**
 * The counts beside the filter chips.
 *
 * Computed from the MERGED list, not from the two inputs: a chip that counts
 * rows the list does not contain is how a user learns to distrust the filter.
 */
export function activityCounts(rows: ActivityRow[]): Record<ActivityFilter, number> {
  let swaps = 0;
  for (const r of rows) if (r.kind === "swap") swaps += 1;
  return { all: rows.length, swaps, orders: rows.length - swaps };
}
