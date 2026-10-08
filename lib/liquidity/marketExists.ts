/**
 * Does this market already exist, and what should the launch screen offer?
 *
 * "Launch a pool" used to ASSERT the answer. The pair step rendered a constant —
 * `launch ? "This pair has no pool" : "Current rate"` — so on a live market it
 * said "This pair has no pool", invited a starting price, and enabled Continue.
 * Measured on Arc against TITER/USDC, which has both a book and a pool.
 *
 * The price was then discarded without a word: `ConfirmFlow` re-reads the pool
 * before sending and skips `addPair` when one exists, so the number never
 * reaches a contract. A field that cannot be used must not be offered.
 *
 * Two reads answer it — `getPair` on the engine, `getPool` on the factory — and
 * `ConfirmFlow` already performs both, just one transaction from the end.
 */

export type MarketState =
  /** The reads have not come back. Assert nothing; this is a real state. */
  | { kind: "checking" }
  /** No book and no pool. The only state where launching is the right verb. */
  | { kind: "none" }
  /** Book and pool both live. Launching would revert; providing is one click. */
  | { kind: "exists"; pair: `0x${string}`; pool: `0x${string}` }
  /**
   * A book with no pool, and none is possible — EVER.
   *
   * `addPair` opens no band pool for a wrapped-native leg, because settlement
   * unwraps and the pool's balance-delta accounting cannot see it. It cannot be
   * added afterwards either: `createPool` is gated to the engine, and the engine
   * only calls it from `addPair`, which would now revert `PairAlreadyExists`.
   * Real on RISE today — ETH/USDC is book `0xFCAeaAB5`, pool `0x0`.
   */
  | { kind: "bookOnly"; pair: `0x${string}` };

const ZERO = "0x0000000000000000000000000000000000000000";

const real = (a: string | undefined | null): a is `0x${string}` =>
  typeof a === "string" && a.toLowerCase() !== ZERO && a !== "0x";

/**
 * @param pair  `getPair(base, quote)` on the engine.
 * @param pool  the pool, resolved in EITHER orientation — the factory's salt is
 *              order sensitive, so a pool listed the other way round is still a
 *              pool. `undefined` for both means the reads are in flight.
 */
export function marketState(
  pair: string | undefined | null,
  pool: string | undefined | null,
): MarketState {
  if (pair === undefined || pool === undefined) return { kind: "checking" };
  if (!real(pair)) return { kind: "none" };
  if (real(pool)) return { kind: "exists", pair, pool };
  return { kind: "bookOnly", pair };
}

/** Whether Continue may proceed into a launch from this state. */
export function canLaunch(state: MarketState): boolean {
  return state.kind === "none";
}
