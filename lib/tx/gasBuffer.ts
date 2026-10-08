/**
 * Gas headroom for order writes, and why an order needs any.
 *
 * ## The failure this exists to stop
 *
 * `wagmi`/`viem` estimate gas at the moment of sending and use the estimate
 * as-is. For a transfer that is fine — the cost does not depend on anyone else.
 * For an order it is not, because what an order COSTS depends on what it MATCHES,
 * and the book can change between the estimate and the block that includes it.
 *
 * Measured on RISE against a live market, same account and same allowance, with
 * only the gas limit varied:
 *
 * | order                              | gas     |
 * |------------------------------------|---------|
 * | rests, matches nothing             | ~240,000 |
 * | matches one resting order          | ~373,000 |
 *
 * So an order priced into an empty book and mined a moment after someone rests
 * an ask is sent with roughly a third less gas than it now needs, and dies with
 * an out-of-gas revert — which returns EMPTY revert data, so nothing downstream
 * can say what happened. Worse, `TransferHelper` used to catch the resulting
 * failed sub-call and report it as the string `"TFF"`, which reads as an
 * approval problem and sends the user to fix something that was never wrong.
 *
 * The irony worth keeping in mind: the order failed BECAUSE liquidity arrived.
 * Nothing was wrong with it.
 *
 * ## The bound, and why it beats a multiplier
 *
 * A multiplier is a guess. `2x` covers the measured empty-book-to-one-match jump
 * (1.55x) and nothing promises it covers a book that gains five levels.
 *
 * There IS a bound, though, and it is exact: **the engine can never match more
 * than `n` levels**, because `MatchingLib.limitOrder` loops on `state.i < input.n`
 * and reverts outright if `n` exceeds `maxMatches`. So sizing for `n` matches
 * cannot be beaten by any depth that arrives after the estimate:
 *
 *     limit = estimate + n * GAS_PER_MATCH
 *
 * The estimate already pays for whatever the node saw; the term after it covers
 * every level that could appear before inclusion. This is the whole reason the
 * off-chain fix is worth having on its own: it needs no redeploy, and the
 * on-chain reserve (`MATCH_GAS_RESERVE`) is what catches the case where a wallet
 * overrides the limit anyway.
 *
 * ## What it costs
 *
 * Nothing that is spent — unused gas is refunded, so an order that matches one
 * level pays for one level whatever the limit said. What it does cost is the
 * **max fee a wallet displays** before signing, which is computed from the limit
 * rather than from what will actually be used. On `n = 20` that is roughly
 * 2.1M gas of headroom shown against ~370k spent. That is the trade being made:
 * a number that looks large in the wallet, against an order that cannot run out
 * of gas.
 */
// `BigInt(...)`, not the `2n` literal: this package targets below ES2020, where
// bigint literals are a compile error.
export const ORDER_GAS_MULTIPLIER = BigInt(2);

/**
 * What one matched level costs.
 *
 * ## Raised 77,000 -> 105,000 on 2026-09-29, and the old number was not a typo
 *
 * It was 77,000, taken from `contracts/CLAUDE.md`'s table (75,012 per extra level
 * on a limit order, 77,334 on a market order, the larger of the two). Those are
 * WARM figures -- measured in a Foundry suite running `isolate = false`, where the
 * calls that build a book leave every slot warm for the call under test. A real
 * transaction carries a fresh EIP-2929 access list, so every slot is cold and a
 * read costs 2,100 instead of 100.
 *
 * Re-measured under `isolate`, which is the only regime that prices a real
 * transaction: a marginal matched level is **104,234**, and the first one (cold
 * across the whole path) is 187,229. 105,000 is the marginal figure rounded up.
 * See `MatchingLib`'s `MATCH_GAS_RESERVE` docstring, which was wrong the same way
 * and for the same reason, and `contracts/test/exchange/orderbook/ReserveSweep.t.sol`
 * for the measurements.
 *
 * ## Why being under here does not revert, and is still a bug
 *
 * Unlike every other term in this module, understating this one cannot run an
 * order out of gas -- `MATCH_GAS_RESERVE` catches that on chain. What it does is
 * make the limit short of what `n` levels actually need, so the engine's guard
 * fires earlier than the trader expected and the order comes back a partial fill
 * with the remainder rested. No error, no revert, just less filled than asked
 * for. That is a quiet wrong answer rather than a loud one, which is why it is
 * worth carrying the true number even though nothing breaks without it.
 *
 * Over is refunded; under is a smaller fill. Round up.
 */
export const GAS_PER_MATCH = BigInt(105_000);

/**
 * The pool leg a TAKER's remainder may now take, on top of the book walk.
 *
 * Since `PoolFallbackLib`, an order that does not rest its remainder gets one more
 * venue: the pair's pool. That is a whole extra swap in the same transaction —
 * ~116,000 warm for the first band plus ~44,765 for each one after — and the engine
 * holds `SWAP_GAS_RESERVE` (180,000) back inside it.
 *
 * It is NOT free to omit. The pool call sits inside a `try`, so a pool that reverts
 * is caught — but a child frame that runs out of gas leaves only 1/64 for the catch
 * branch to approve-to-zero and refund, which can itself run out. An underfunded
 * taker order is still a revert.
 *
 * Only applies when the order is a taker. Since 2026-10-04 every MARKET order the
 * Pro ticket sends is `isMaker: false` (a market order that rested its remainder
 * as a bid was the bug), so market orders pass `poolLeg: true`; limit orders are
 * still makers and never reach the pool.
 */
export const POOL_FALLBACK_GAS = BigInt(300_000);

/**
 * Gas the engine insists is still UNSPENT before it will match another level.
 *
 * `MatchingLib` breaks out of its matching loop when `gasleft() <
 * MATCH_GAS_RESERVE`, holding this back so a halted match can still settle and
 * rest the remainder rather than reverting. It is not consumed -- it is headroom
 * that has to be there -- so budgeting for it costs nothing but the max fee a
 * wallet displays. Mirrors `MATCH_GAS_RESERVE` in
 * contracts/src/exchange/libraries/MatchingLib.sol, which also exposes it as the
 * public pure `matchGasReserve()`; `matchGasReserve.test.ts` pins the two together.
 *
 * ## Leaving it out does not fail loudly -- it fails SILENTLY, and it did
 *
 * Every other term here is sized so an order cannot run OUT of gas, and the
 * module's header reasons carefully about reverts. This one is different in kind:
 * falling short of the reserve is **not a revert**. The loop simply breaks before
 * its first iteration, the transaction SUCCEEDS, tokens move, a price update is
 * emitted, and nothing matches.
 *
 * Which means `eth_estimateGas` cannot save us and in fact walks straight into
 * it: estimation searches for the least gas that makes the call succeed, and
 * "succeeds having matched nothing" succeeds. The estimate converges on the
 * halting path, and any multiplier applied to it is a multiple of a number that
 * was never enough to match.
 *
 * Measured on RISE, 2026-09-13: 20 sweeps in one 5,000-block window, every one
 * `matched=0`, sent with a limit of 328,808 -- which is exactly `2 x 164,404`,
 * the doubled estimate, against a 300,000 reserve. Each burned ~187,000 gas and
 * produced no trade. It was invisible until `MatchingHaltedForGas` was indexed,
 * because a successful transaction that fills nothing looks like a quiet market.
 *
 * ## Raised 300,000 -> 500,000 on 2026-09-28, with the contract
 *
 * The contract's 300,000 was measured WARM -- in a Foundry suite running
 * `isolate = false`, where the calls that build a book leave every slot warm for
 * the call under test. A real transaction has a fresh access list, so every slot
 * is cold: the settle-and-rest tail alone costs ~353,000, more than the whole old
 * reserve. `MatchingLib`'s docstring has the re-derivation and
 * `ReserveSweep.t.sol` the measurements. The guard also moved into `matchAt`, so
 * it is now checked per ORDER rather than per price level -- without that no
 * constant is correct, because a level holds an unbounded queue.
 *
 * This copy has to move in the SAME commit as the contract, in this direction
 * especially: the contract now requires 500,000 unspent, so a client still
 * budgeting 300,000 sends orders that reach the loop, break out of it immediately
 * and match NOTHING -- succeeding, which is the silent failure this whole comment
 * is about. `matchGasReserve.test.ts` is what makes that a red test instead of a
 * quiet market.
 */
export const MATCH_GAS_RESERVE = BigInt(500_000);

/** Apply the buffer to a raw estimate. Pure, so the arithmetic is pinned by a test. */
export function bufferGas(estimate: bigint, multiplier: bigint = ORDER_GAS_MULTIPLIER): bigint {
  if (estimate <= BigInt(0)) return BigInt(0);
  if (multiplier <= BigInt(0)) return estimate;
  return estimate * multiplier;
}

/**
 * A limit that covers every level this order could still cross.
 *
 * `maxMatches` is the order's own `n`. Falls back to the plain multiplier when
 * it is unknown, since a guess is still better than a bare estimate.
 */
export function orderGasLimit(
  estimate: bigint,
  maxMatches?: number,
  /**
   * True when this order can reach the pool — i.e. it is a TAKER order
   * (`isMaker: false`), the only branch `PoolFallbackLib` runs on.
   *
   * Defaulted false because limit orders are sent `isMaker: true`, which rests
   * the remainder and never reaches the pool; budgeting for a leg that cannot
   * happen would only inflate the wallet's displayed max fee. Market orders are
   * takers and pass true.
   */
  poolLeg = false,
): bigint {
  if (estimate <= BigInt(0)) return BigInt(0);
  const pool = poolLeg ? POOL_FALLBACK_GAS : BigInt(0);
  // Added on EVERY path, including the fallback below. The reserve is what the
  // engine requires to be left over before it will match at all, so an order
  // that omits it can reach the matching loop and break out of it having matched
  // nothing -- succeeding, and filling none of what the trader asked for. This
  // is the same shape as the contract's own documented budget,
  // `base + levels * perMatch + matchGasReserve()` (see MatchingLib).
  const reserve = MATCH_GAS_RESERVE;
  if (maxMatches === undefined || !Number.isFinite(maxMatches) || maxMatches <= 0) {
    // `maxMatches` is 0 for a book this order does not currently cross -- which
    // is NOT the same as an order that will not match, because depth can arrive
    // between the estimate and inclusion. That is the case this module already
    // exists to cover, and it is precisely where the reserve was missing: the
    // doubled estimate is the exact limit the observed halts were sent with.
    return bufferGas(estimate) + pool + reserve;
  }
  const headroom = BigInt(Math.floor(maxMatches)) * GAS_PER_MATCH;
  const bounded = estimate + headroom + pool + reserve;
  // Never below the old multiplier: on a tiny estimate (a rest that matches
  // nothing) `n * perMatch` is the dominant term anyway, and this keeps the
  // function monotonic in `estimate`.
  const doubled = bufferGas(estimate) + pool + reserve;
  return bounded > doubled ? bounded : doubled;
}

/**
 * What an order costs OUTSIDE the matching loop, cold: pull the funds in, take the
 * fee, settle, rest or refund, emit. `MatchingLib`'s `MATCH_GAS_RESERVE` docstring
 * measures this tail at ~353,000 under `isolate` (ReserveSweep.t.sol); rounded up.
 */
export const ORDER_TAIL_GAS = BigInt(360_000);

/**
 * The FIRST matched level, which is cold across the whole path: 187,229 measured
 * under `isolate` against 104,234 for each one after (see `GAS_PER_MATCH`).
 */
export const FIRST_MATCH_GAS = BigInt(190_000);

/**
 * The least gas an order is ever sent with, whether or not it could be estimated.
 *
 * ## Why a floor exists: a failed estimate used to send NO gas field at all
 *
 * `bufferedGasFor` returned undefined when `eth_estimateGas` threw, and the caller
 * then omitted `gas`, so the wallet estimated on its own. Its bare estimate is the
 * halting path (see `MATCH_GAS_RESERVE`): measured on RISE, a market buy went out
 * with 468,546 against a 500,000 reserve, skipped matching entirely
 * (`MatchingHaltedForGas`, matched=0), rested, and "succeeded".
 *
 * And the estimate failed for a reason of ours: it ran with no `account`, so the
 * node simulated from the zero address, which has no allowance — every order
 * estimate reverted `ERC20InsufficientAllowance`. `account` is now passed; this
 * floor is what still holds when an estimate fails for any other reason.
 *
 * It is the contract's own budget shape: tail + the levels this order may cross
 * (at least one — depth can arrive before inclusion) + the reserve the engine
 * insists stays unspent, + the pool leg for a taker. Unused gas is refunded.
 */
export function orderGasFloor(maxMatches?: number, poolLeg = false): bigint {
  const n =
    maxMatches !== undefined && Number.isFinite(maxMatches) && maxMatches > 1
      ? BigInt(Math.floor(maxMatches))
      : BigInt(1);
  const pool = poolLeg ? POOL_FALLBACK_GAS : BigInt(0);
  return ORDER_TAIL_GAS + FIRST_MATCH_GAS + (n - BigInt(1)) * GAS_PER_MATCH + MATCH_GAS_RESERVE + pool;
}

/** The shape of the estimator, so callers can pass a viem public client. */
export interface GasEstimator {
  estimateContractGas: (request: never) => Promise<bigint>;
}

export interface OrderGasOptions {
  /**
   * The address that will SEND the transaction. Without it the node estimates
   * from the zero address, which holds no allowance, so every order estimate
   * reverts and the limit falls to the floor.
   */
  account?: `0x${string}`;
  /** The order's own `n`. Omit for a call that does no matching. */
  maxMatches?: number;
  /** True for a TAKER order, which may take the pool leg. See `POOL_FALLBACK_GAS`. */
  poolLeg?: boolean;
}

/**
 * A gas limit for `request`: the buffered estimate, never below `orderGasFloor`.
 *
 * Always returns a number. It used to return undefined on a failed estimate so the
 * caller could omit `gas` and "let wagmi estimate as before" — which is precisely
 * how orders went out under the reserve and matched nothing. A genuinely reverting
 * order still reverts at send with its DECODED reason (`decodeOrderSubmitError`);
 * sending it with a generous limit changes nothing about that.
 */
export async function bufferedGasFor(
  client: GasEstimator | undefined | null,
  request: unknown,
  { account, maxMatches, poolLeg = false }: OrderGasOptions = {},
): Promise<bigint> {
  const floor = orderGasFloor(maxMatches, poolLeg);
  if (!client) return floor;
  try {
    const withAccount =
      account && request && typeof request === "object"
        ? { ...(request as Record<string, unknown>), account }
        : request;
    const estimate = await client.estimateContractGas(withAccount as never);
    const limit = orderGasLimit(estimate, maxMatches, poolLeg);
    return limit > floor ? limit : floor;
  } catch {
    return floor;
  }
}
