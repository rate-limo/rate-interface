import type { AccountPositions, PositionTotals, SpotPosition } from "./types";

/**
 * Summing one wallet's positions across every chain it trades on.
 *
 * ## Why this is a client-side fan-out and not a stored rollup
 *
 * The ledger cannot move. `spotPositions` is a fold over one chain's fill
 * ledger in event order, and its own schema note says the weighted average
 * "does not commute" — an out-of-order fill produces a plausible wrong number
 * permanently, not an obvious one. So cost basis stays behind the broker's
 * single-writer lock, on the chain that produced it.
 *
 * That leaves reading. A stored cross-chain rollup could hold the DURABLE half
 * (realised PnL, cost, trade counts — all facts that never change once
 * settled), but not the half the UI leads with: `valueUSD` and
 * `unrealizedPnlUSD` are `holdings × live price`, and `spotPositions` already
 * refuses to store unrealised for exactly that reason — "stale the moment one
 * moves". A cached cross-chain total is wrong on the next tick.
 *
 * So the read fans out and sums here. Everything stays fresh, the per-chain
 * breakdown falls out for free, and no new writer touches the shared database.
 * A rollup is still worth adding the day a cross-chain LEADERBOARD is needed —
 * you cannot sort by a total you compute per-request — and it composes
 * underneath this without changing the shape below.
 *
 * ## Aggregation is not just addition
 *
 * `PositionTotals` carries a distinction that has to survive the sum: realised
 * covers EVERY row, while value/cost/unrealised are partial by exactly
 * `unpricedCount` rows. Summing all five naively keeps that true only if
 * `unpricedCount` is summed too — which is why it is, and why a chain that
 * FAILED to answer is tracked separately from a chain that answered with
 * unpriced rows. They are different kinds of missing:
 *
 *   - `unpricedCount` — we have the position, not its price.
 *   - `failedChains`  — we do not know what is on that chain at all.
 *
 * Collapsing them would let a dead gateway render as a confident smaller
 * portfolio, which is the one failure mode this whole file exists to avoid.
 */

/** One chain's answer, kept whole so the UI can show a per-chain breakdown. */
export interface ChainPositions {
  /** `@iter/deployments` network name, e.g. "Arc Testnet". */
  networkName: string;
  positions: SpotPosition[];
  totals: PositionTotals;
  /** True when this chain's read failed — its numbers are absent, not zero. */
  failed: boolean;
}

/**
 * A position that remembers which chain it is on.
 *
 * `SpotPosition` has no network field — it never needed one when every read was
 * a single chain. Flattening across chains discards exactly the fact that makes
 * two rows distinguishable, and this repo ships the SAME token address on
 * several chains by design (deterministic deploys; USDC exists on both RISE and
 * Arc). Without the tag the table renders two identical "USDC" rows keyed on
 * the same address, which collides in React and cannot be reconciled by eye
 * against the single total above them.
 */
export type TaggedPosition = SpotPosition & { networkName: string };

export interface CrossChainPositions {
  /** Per chain, in the order requested, including the ones that failed. */
  chains: ChainPositions[];
  /** Every position from every chain that answered, each tagged with its chain. */
  positions: TaggedPosition[];
  totals: PositionTotals;
  /**
   * Chains whose read failed. NON-EMPTY means every total here is a floor, not
   * a total, and the UI must say so rather than print a confident number.
   */
  failedChains: string[];
  /** Chains that answered, so "3 chains" is a count of what was actually read. */
  answeredChains: string[];
}

export const EMPTY_TOTALS: PositionTotals = {
  valueUSD: 0,
  costUSD: 0,
  unrealizedPnlUSD: 0,
  realizedPnlUSD: 0,
  unpricedCount: 0,
};

/**
 * Fold one chain's answer into a running total.
 *
 * Separate from `aggregate` so the addition rules are testable on their own and
 * so a caller streaming chains in as they arrive (which is the point of fanning
 * out — a slow chain must not hold the fast ones hostage) can use the same
 * arithmetic the batch path uses.
 */
export function addTotals(a: PositionTotals, b: PositionTotals): PositionTotals {
  return {
    valueUSD: a.valueUSD + b.valueUSD,
    costUSD: a.costUSD + b.costUSD,
    unrealizedPnlUSD: a.unrealizedPnlUSD + b.unrealizedPnlUSD,
    realizedPnlUSD: a.realizedPnlUSD + b.realizedPnlUSD,
    // Summed, not dropped: three of the four totals above are partial by this
    // many rows, and the count is what lets the UI qualify them.
    unpricedCount: a.unpricedCount + b.unpricedCount,
  };
}

/**
 * Combine per-chain answers into one portfolio.
 *
 * A failed chain contributes NOTHING to the totals — not a zero, an absence.
 * Zero would be a claim ("this wallet holds nothing there"); absence plus a
 * name in `failedChains` is the truth ("we could not ask").
 */
export function aggregate(chains: ChainPositions[]): CrossChainPositions {
  const answered = chains.filter((c) => !c.failed);
  return {
    chains,
    positions: answered.flatMap((c) =>
      c.positions.map((p) => ({ ...p, networkName: c.networkName })),
    ),
    totals: answered.reduce((acc, c) => addTotals(acc, c.totals), EMPTY_TOTALS),
    failedChains: chains.filter((c) => c.failed).map((c) => c.networkName),
    answeredChains: answered.map((c) => c.networkName),
  };
}

/**
 * The status of one chain's read, as far as aggregation cares.
 *
 * Deliberately narrower than react-query's result: this is the ONLY property
 * the split depends on, and typing it this way lets the rule be tested without
 * a React renderer.
 */
export interface ChainQueryStatus {
  /** react-query's `status`. "pending" means NO data yet — for any reason. */
  status: "pending" | "success" | "error";
  data?: ChainPositions;
}

/**
 * Which chains have actually answered, and which are still unknown.
 *
 * ## Why this is `status`, not `isLoading`
 *
 * This filtered on `!isLoading`, which is wrong in a way that only shows up
 * offline. In TanStack v5 `isLoading === isPending && isFetching`, so a query
 * that is pending but NOT fetching — the tab is offline and the fetch is
 * `paused`, or the query is disabled — reports `isLoading: false` while holding
 * no data at all.
 *
 * Under the old rule such a chain counted as SETTLED, fell through to
 * `data ?? null`, and was marked FAILED. The card then printed `$0` as a
 * confident, settled headline for a wallet whose chains had simply not been
 * read. The caveat line fired underneath it, but the number above was still a
 * claim nobody had earned.
 *
 * `status === "pending"` means "no data yet", whatever the reason, which is
 * exactly the question being asked. A pending chain is neither answered nor
 * failed — it is unknown, and `pending` is what the caller renders as loading.
 */
export function partitionByStatus(results: readonly ChainQueryStatus[], networks: readonly string[]): {
  settled: ChainPositions[];
  pending: string[];
} {
  const settled: ChainPositions[] = [];
  const pending: string[] = [];
  results.forEach((result, i) => {
    const networkName = networks[i] ?? "";
    if (result.status === "pending") {
      pending.push(networkName);
      return;
    }
    // Settled with no data is a genuine failure — `toChainPositions` marks it.
    settled.push(result.data ?? toChainPositions(networkName, null));
  });
  return { settled, pending };
}

/** One chain's positions, tagged with where they came from. */
export function toChainPositions(
  networkName: string,
  data: AccountPositions | null,
): ChainPositions {
  if (!data) {
    return { networkName, positions: [], totals: EMPTY_TOTALS, failed: true };
  }
  return { networkName, positions: data.positions, totals: data.totals, failed: false };
}

/**
 * How many chains a wallet actually HOLDS something on — not how many were
 * read.
 *
 * The portfolio header prints "N chains" beside a net worth, and the honest
 * reading of that label is "your money is spread across N chains", not "we
 * queried N gateways". A wallet that has never touched RISE should not be told
 * it is on two chains because the app asked two questions.
 */
export function chainsWithHoldings(chains: ChainPositions[]): string[] {
  return chains
    .filter((c) => !c.failed && c.positions.some((p) => (p.amount ?? 0) > 0))
    .map((c) => c.networkName);
}
