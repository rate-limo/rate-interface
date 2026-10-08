/** Season payouts: the budget split, and the Disperse matcher.
 *
 * packages/types/node_modules/.bin/tsx --test src/rewardPayout.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateBudget,
  checkDispersalIntegrity,
  confirmationDepth,
  confirmationsFor,
  lookupRewardAsset,
  matchDispersals,
  parseBaseUnits,
  type DispersedBatchLog,
  type DispersedLog,
  type PayableAllocation,
} from "./rewardPayout";

const E18 = 10n ** 18n;
const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const A = w(1);
const B = w(2);
const C = w(3);
const DISPERSE = w(0xd1);
const FAKE_DISPERSE = w(0xd2);
const ITER = w(0x1e);
const OTHER = w(0x0e);
const OPERATOR = w(0x0a);
const STRANGER = w(0x0b);
const TX = `0x${"11".repeat(32)}`;

test("shares sum to at most the budget, and the dust is undistributed", () => {
  // 1,000 ITER over 3 equal wallets: 333.33… each, floored.
  const budget = 1_000n * E18;
  const out = allocateBudget(
    [
      { wallet: A.toUpperCase().replace("0X", "0x"), total: (10n * E18).toString() },
      { wallet: B, total: (10n * E18).toString() },
      { wallet: C, total: (10n * E18).toString() },
    ],
    budget,
  );
  assert.equal(out.shares.length, 3);
  assert.ok(out.allocated <= budget);
  assert.equal(out.allocated + out.undistributed, budget);
  assert.equal(out.undistributed, 1n); // 10^21 = 3 × 333333333333333333333 + 1
  assert.equal(out.shares[0]!.wallet, A);
});

test("shares are proportional to frozen points across every source", () => {
  const out = allocateBudget(
    [
      { wallet: A, total: (3n * E18).toString() },
      { wallet: B, total: (1n * E18).toString() },
    ],
    400n,
  );
  assert.deepEqual(
    out.shares.map((s) => [s.wallet, s.owed]),
    [
      [A, 300n],
      [B, 100n],
    ],
  );
  assert.equal(out.undistributed, 0n);
});

test("a zero-point season, or no budget, pays nothing", () => {
  const zero = allocateBudget([{ wallet: A, total: "0" }, { wallet: B, total: null }], 1_000n);
  assert.deepEqual(zero.shares, []);
  assert.equal(zero.undistributed, 1_000n);
  const noBudget = allocateBudget([{ wallet: A, total: "5" }], 0n);
  assert.deepEqual(noBudget.shares, []);
  assert.equal(noBudget.undistributed, 0n);
});

test("a share that floors to zero gets no row", () => {
  const out = allocateBudget(
    [
      { wallet: A, total: "1000000" },
      { wallet: B, total: "1" },
    ],
    100n,
  );
  assert.deepEqual(out.shares.map((s) => s.wallet), [A]);
  assert.equal(out.allocated + out.undistributed, 100n);
});

const unpaid = (wallet: string, owed: bigint): PayableAllocation => ({ wallet, owed, paidBy: null });
const log = (to: string, amount: bigint, logIndex: number, over: Partial<DispersedLog> = {}): DispersedLog => ({
  emitter: DISPERSE,
  token: ITER,
  from: OPERATOR,
  to,
  amount,
  logIndex,
  ...over,
});
const batch = (count: bigint, total: bigint, over: Partial<DispersedBatchLog> = {}): DispersedBatchLog => ({
  emitter: DISPERSE,
  token: ITER,
  from: OPERATOR,
  count,
  total,
  logIndex: 99,
  ...over,
});
const match = (dispersed: DispersedLog[], batches: DispersedBatchLog[], allocations = [unpaid(A, 300n), unpaid(B, 100n)]) =>
  matchDispersals({ txHash: TX, dispersed, batches, disperse: DISPERSE, token: ITER, operators: new Set([OPERATOR]), allocations });

test("a sound batch applies exact matches and reports the rest", () => {
  const out = match([log(A, 300n, 1), log(B, 99n, 2), log(C, 5n, 3)], [batch(3n, 404n)]);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.apply, [{ wallet: A, amount: 300n, logIndex: 1 }]);
  assert.deepEqual(
    out.reports.map((r) => r.result),
    ["applied", "refused", "refused"],
  );
});

test("logs from a contract other than the registered Disperse are not evidence", () => {
  const out = match([log(A, 300n, 1, { emitter: FAKE_DISPERSE })], [batch(1n, 300n, { emitter: FAKE_DISPERSE })]);
  assert.equal(out.ok, false);
});

test("a batch funded by a wallet that is not an operator is refused whole", () => {
  const out = match([log(A, 300n, 1, { from: STRANGER })], [batch(1n, 300n, { from: STRANGER })]);
  assert.equal(out.ok, false);
  assert.match(!out.ok ? out.error : "", /not an operator/);
});

test("the wrong token is refused", () => {
  assert.equal(match([log(A, 300n, 1, { token: OTHER })], [batch(1n, 300n, { token: OTHER })]).ok, false);
});

test("a summary that disagrees with its logs is refused", () => {
  assert.equal(match([log(A, 300n, 1)], [batch(1n, 301n)]).ok, false);
  assert.equal(match([log(A, 300n, 1)], [batch(2n, 300n)]).ok, false);
  assert.equal(match([log(A, 300n, 1)], []).ok, false);
});

test("two batches from one operator in one transaction reconcile together", () => {
  const out = match([log(A, 300n, 1), log(B, 100n, 3)], [batch(1n, 300n, { logIndex: 2 }), batch(1n, 100n, { logIndex: 4 })]);
  assert.equal(out.ok && out.apply.length, 2);
});

test("a replay of the same transaction is a no-op, and another tx cannot double-mark", () => {
  const paid: PayableAllocation[] = [{ wallet: A, owed: 300n, paidBy: { txHash: TX, logIndex: 1 } }];
  const replay = match([log(A, 300n, 1)], [batch(1n, 300n)], paid);
  assert.deepEqual(replay.ok && replay.apply, []);
  assert.deepEqual(replay.ok && replay.reports.map((r) => r.result), ["already recorded"]);
  const other = matchDispersals({
    txHash: `0x${"22".repeat(32)}`,
    dispersed: [log(A, 300n, 1)],
    batches: [batch(1n, 300n)],
    disperse: DISPERSE,
    token: ITER,
    operators: new Set([OPERATOR]),
    allocations: paid,
  });
  assert.deepEqual(other.ok && other.apply, []);
});

test("parseBaseUnits accepts integers only", () => {
  assert.equal(parseBaseUnits("1000"), 1000n);
  assert.equal(parseBaseUnits("1.5"), null);
  assert.equal(parseBaseUnits("-1"), null);
  assert.equal(parseBaseUnits(null), null);
});

test("the integrity pre-check refuses a stranger or a foreign token without any allocations", () => {
  const pre = (dispersed: DispersedLog[], batches: DispersedBatchLog[]) =>
    checkDispersalIntegrity({ dispersed, batches, disperse: DISPERSE, token: ITER, operators: new Set([OPERATOR]) });
  assert.equal(pre([log(A, 1n, 1, { from: STRANGER })], [batch(1n, 1n, { from: STRANGER })]).ok, false);
  assert.equal(pre([log(A, 1n, 1, { token: OTHER })], [batch(1n, 1n, { token: OTHER })]).ok, false);
  assert.equal(pre([log(A, 1n, 1)], [batch(1n, 1n)]).ok, true);
  // A stranger is refused on the funder even in a foreign token (never a
  // "maybe our token view is stale" case); an operator's foreign token is flagged.
  const stranger = pre([log(A, 1n, 1, { from: STRANGER, token: OTHER })], [batch(1n, 1n, { from: STRANGER, token: OTHER })]);
  assert.deepEqual(stranger.ok ? null : [stranger.error.includes("not an operator"), "tokenMismatch" in stranger], [true, false]);
  const foreign = pre([log(A, 1n, 1, { token: OTHER })], [batch(1n, 1n, { token: OTHER })]);
  assert.equal(!foreign.ok && foreign.tokenMismatch, true);
});

test("confirmations: one table for the broker and the manual verify", () => {
  assert.equal(confirmationsFor(11155931), 30);
  assert.equal(confirmationsFor(5042002), 60);
  assert.equal(confirmationsFor(1), 12);
  // The block itself is one confirmation.
  assert.deepEqual(confirmationDepth(11155931, 100, 129), { ok: true, have: 30n, need: 30 });
  assert.equal(confirmationDepth(11155931, 100, 128).ok, false);
  assert.equal(confirmationDepth(5042002, 100n, 90n).have, 0n);
});

const assetFetch = (deployments: Array<{ chainId: number; address: string; decimals: number | null }>) =>
  (async () => new Response(JSON.stringify({ id: "iter", deployments }), { status: 200 })) as unknown as typeof fetch;

test("the reward asset REFUSES a chain with more than one deployment rather than guess", async () => {
  const two = assetFetch([
    { chainId: 5042002, address: ITER, decimals: 18 },
    { chainId: 5042002, address: OTHER, decimals: 18 },
  ]);
  await assert.rejects(lookupRewardAsset(5042002, "http://id", two), /2 deployments on chain 5042002/);
  const one = assetFetch([
    { chainId: 5042002, address: ITER, decimals: 18 },
    { chainId: 11155931, address: OTHER, decimals: 18 },
  ]);
  assert.deepEqual(await lookupRewardAsset(5042002, "http://id", one), { address: ITER, decimals: 18 });
  assert.equal(await lookupRewardAsset(1, "http://id", one), null);
});
