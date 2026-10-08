/**
 * ITER season payouts — the ONE implementation of "what is each wallet owed"
 * and "which onchain transfers paid it", shared by the broker (which records
 * Disperse events as the indexer delivers them) and admin-service (whose manual
 * verify reads a receipt). Two copies of either rule would let the two paths
 * disagree about whether a wallet has been paid.
 *
 * ## Owed: the season's budget, split by frozen points
 *
 * There is no points-to-ITER rate. Each chain's operator sets an ITER BUDGET per
 * season, and a wallet's share is `floor(budget × walletPoints / totalPoints)`
 * over the season's frozen `tSnapshots.total` (every source the close summed).
 * Integer math in base units: the shares never exceed the budget, and the
 * rounding remainder — `undistributed` — stays with the treasury.
 *
 * ## Paid: a Disperse batch that matches exactly
 *
 * Anyone can call the public Disperse contract and emit identical-looking
 * logs, so a transfer counts only when ALL of this holds:
 * - the log was EMITTED by this chain's registered Disperse contract;
 * - its `from` (the address Disperse pulled from — always `msg.sender`) is an
 *   operator wallet on the admin-set allowlist;
 * - its `token` is the chain's resolved ITER deployment;
 * - the batch's `DispersedBatch(token, from, count, total)` summary agrees with
 *   the `Dispersed` logs it covers (same count, same sum);
 * - each `Dispersed(to, amount)` is an UNPAID allocation of the season with
 *   exactly that amount.
 * A batch that fails an integrity rule (emitter, operator, summary) is refused
 * whole. Within a sound batch, a log that is not an exact unpaid match is
 * reported and not applied — never double-marked, never "close enough".
 */

export interface SnapshotTotal {
  wallet: string;
  /** 18-decimal points, as `tSnapshots.total` stores it. */
  total: string | null;
}

export interface BudgetShare {
  /** Lowercase. */
  wallet: string;
  pointsRaw: bigint;
  owed: bigint;
}

export interface BudgetAllocation {
  shares: BudgetShare[];
  totalPoints: bigint;
  /** Sum of every share — never more than the budget. */
  allocated: bigint;
  /** Budget minus allocated: rounding dust, or the whole budget if nobody earned. */
  undistributed: bigint;
}

/**
 * Split `budget` (base units) by frozen points. Wallets with zero points, or
 * whose share floors to zero, get no row. A season with no points pays nothing
 * and its whole budget is undistributed.
 */
export function allocateBudget(snapshots: SnapshotTotal[], budget: bigint): BudgetAllocation {
  const points = new Map<string, bigint>();
  let totalPoints = 0n;
  for (const s of snapshots) {
    let p: bigint;
    try {
      p = BigInt(s.total ?? "0");
    } catch {
      continue;
    }
    if (p <= 0n) continue;
    const wallet = s.wallet.toLowerCase();
    points.set(wallet, (points.get(wallet) ?? 0n) + p);
    totalPoints += p;
  }
  const safeBudget = budget > 0n ? budget : 0n;
  const shares: BudgetShare[] = [];
  let allocated = 0n;
  if (totalPoints > 0n && safeBudget > 0n) {
    for (const [wallet, p] of points) {
      const owed = (safeBudget * p) / totalPoints;
      if (owed <= 0n) continue;
      shares.push({ wallet, pointsRaw: p, owed });
      allocated += owed;
    }
  }
  shares.sort((a, b) => (b.owed > a.owed ? 1 : b.owed < a.owed ? -1 : a.wallet.localeCompare(b.wallet)));
  return { shares, totalPoints, allocated, undistributed: safeBudget - allocated };
}

/** One `Dispersed(token, from, to, amount)` log. Addresses any case. */
export interface DispersedLog {
  emitter: string;
  token: string;
  from: string;
  to: string;
  amount: bigint;
  logIndex: number;
}

/** One `DispersedBatch(token, from, count, total)` log. */
export interface DispersedBatchLog {
  emitter: string;
  token: string;
  from: string;
  count: bigint;
  total: bigint;
  logIndex: number;
}

/** What the matcher needs to know about one allocation. */
export interface PayableAllocation {
  wallet: string;
  owed: bigint;
  /** Set when already paid. */
  paidBy: { txHash: string; logIndex: number } | null;
}

export type DispersalReport =
  | { logIndex: number; to: string; amount: string; result: "applied" }
  | { logIndex: number; to: string; amount: string; result: "already recorded" }
  | { logIndex: number; to: string; amount: string; result: "refused"; reason: string };

export type DispersalMatch =
  | { ok: false; error: string }
  | {
      ok: true;
      apply: Array<{ wallet: string; amount: bigint; logIndex: number }>;
      reports: DispersalReport[];
    };

/**
 * The checks on a transaction's Disperse logs that need no season: the logs
 * come from the registered contract, pay ITER, are funded by allowlisted
 * operators, and agree with their summaries. Cheap — the broker runs it BEFORE
 * loading any season, so a flood of lookalike or stranger-funded batches costs
 * one small read each, never a snapshot scan. `matchDispersals` runs it first.
 *
 * Funder = operator is the whole authorisation. Disperse's `from` is its own
 * `msg.sender` (contracts/src/rewards/Disperse.sol, `address from = msg.sender`)
 * and the tokens move by `transferFrom(msg.sender, …)`, so a log naming an
 * operator can only come from a call that account made — as an EOA, as an
 * ERC-4337 smart account, or as an EIP-7702 delegated EOA batching calls.
 * Who signed or where the transaction was addressed proves nothing more.
 */
export function checkDispersalIntegrity(input: {
  dispersed: DispersedLog[];
  batches: DispersedBatchLog[];
  disperse: string;
  token: string;
  operators: ReadonlySet<string>;
}):
  | { ok: true; logs: DispersedLog[]; batches: DispersedBatchLog[] }
  | { ok: false; error: string; tokenMismatch?: true } {
  const disperse = input.disperse.toLowerCase();
  const token = input.token.toLowerCase();
  const operators = new Set([...input.operators].map((o) => o.toLowerCase()));

  // Only the registered contract's logs are evidence; anything else in the
  // receipt (another Disperse deployment, a lookalike) is ignored.
  const logs = input.dispersed.filter((l) => l.emitter.toLowerCase() === disperse);
  const batches = input.batches.filter((b) => b.emitter.toLowerCase() === disperse);
  if (logs.length === 0) return { ok: false, error: "no Dispersed logs from this chain's Disperse contract" };
  if (batches.length === 0) return { ok: false, error: "no DispersedBatch summary from this chain's Disperse contract" };

  // The funder FIRST: a stranger's batch is refused on that alone, whatever
  // token it paid. Only an operator's batch gets as far as the token check —
  // whose failure is flagged `tokenMismatch`, because it can be OUR stale view
  // of the reward token rather than the batch's fault (the broker re-resolves
  // and keeps such a batch pending instead of refusing it for good).
  for (const b of batches) {
    if (!operators.has(b.from.toLowerCase())) {
      return { ok: false, error: `the batch was funded by ${b.from.toLowerCase()}, which is not an operator wallet` };
    }
  }
  for (const l of logs) {
    if (!operators.has(l.from.toLowerCase())) {
      return { ok: false, error: `a payout was funded by ${l.from.toLowerCase()}, which is not an operator wallet` };
    }
  }
  for (const b of batches) {
    if (b.token.toLowerCase() !== token) {
      return { ok: false, error: "the batch paid a token other than this chain's ITER", tokenMismatch: true };
    }
  }
  for (const l of logs) {
    if (l.token.toLowerCase() !== token) {
      return { ok: false, error: "a Dispersed log paid a token other than this chain's ITER", tokenMismatch: true };
    }
  }
  // The summaries must agree with the logs they cover, per funder. Summed per
  // funder rather than per batch so one transaction carrying two
  // `disperseToken` calls (a 7702 batch) still reconciles.
  const summary = new Map<string, { count: bigint; total: bigint }>();
  for (const b of batches) {
    const k = b.from.toLowerCase();
    const cur = summary.get(k) ?? { count: 0n, total: 0n };
    summary.set(k, { count: cur.count + b.count, total: cur.total + b.total });
  }
  const funders = new Set([...summary.keys(), ...logs.map((l) => l.from.toLowerCase())]);
  for (const k of funders) {
    const covered = logs.filter((l) => l.from.toLowerCase() === k);
    const sum = covered.reduce((acc, l) => acc + l.amount, 0n);
    const want = summary.get(k) ?? { count: 0n, total: 0n };
    if (BigInt(covered.length) !== want.count || sum !== want.total) {
      return {
        ok: false,
        error: `the DispersedBatch summary (${want.count} payouts, ${want.total}) does not match the Dispersed logs (${covered.length}, ${sum})`,
      };
    }
  }
  return { ok: true, logs, batches };
}

/** Match one transaction's Disperse logs against one season's allocations. */
export function matchDispersals(input: {
  txHash: string;
  dispersed: DispersedLog[];
  batches: DispersedBatchLog[];
  disperse: string;
  token: string;
  operators: ReadonlySet<string>;
  allocations: PayableAllocation[];
}): DispersalMatch {
  const txHash = input.txHash.toLowerCase();
  const integrity = checkDispersalIntegrity(input);
  if (!integrity.ok) return integrity;
  const { logs } = integrity;

  const byWallet = new Map(input.allocations.map((a) => [a.wallet.toLowerCase(), a]));
  const taken = new Set<string>();
  const apply: Array<{ wallet: string; amount: bigint; logIndex: number }> = [];
  const reports: DispersalReport[] = [];
  for (const l of [...logs].sort((a, b) => a.logIndex - b.logIndex)) {
    const to = l.to.toLowerCase();
    const base = { logIndex: l.logIndex, to, amount: l.amount.toString() };
    const alloc = byWallet.get(to);
    if (!alloc) {
      reports.push({ ...base, result: "refused", reason: "not owed for this season" });
    } else if (alloc.paidBy) {
      if (alloc.paidBy.txHash.toLowerCase() === txHash && alloc.paidBy.logIndex === l.logIndex) {
        reports.push({ ...base, result: "already recorded" });
      } else {
        reports.push({ ...base, result: "refused", reason: `already paid by ${alloc.paidBy.txHash}` });
      }
    } else if (alloc.owed !== l.amount) {
      reports.push({ ...base, result: "refused", reason: `amount ${l.amount} is not the ${alloc.owed} owed` });
    } else if (taken.has(to)) {
      reports.push({ ...base, result: "refused", reason: "a second payout to this wallet in the same transaction" });
    } else {
      taken.add(to);
      apply.push({ wallet: to, amount: l.amount, logIndex: l.logIndex });
      reports.push({ ...base, result: "applied" });
    }
  }
  return { ok: true, apply, reports };
}

/**
 * Confirmations required before a payout is recorded, per chain — by the
 * broker's settlement and admin-service's manual verify alike, so the two can
 * never disagree about whether a transfer is final. A reorg deeper than this
 * would un-send a transfer already marked paid.
 * - RISE (11155931), ~1 s blocks: 30 (about half a minute)
 * - Arc (5042002), ~0.5 s blocks: 60 (about half a minute)
 * - anything else: 12
 */
export function confirmationsFor(chainId: number): number {
  if (chainId === 11155931) return 30;
  if (chainId === 5042002) return 60;
  return 12;
}

/** Is a block deep enough under `head` for `chainId`? The block itself counts
 * as one confirmation. */
export function confirmationDepth(
  chainId: number,
  blockNumber: bigint | number,
  head: bigint | number,
): { ok: boolean; have: bigint; need: number } {
  const need = confirmationsFor(chainId);
  const raw = BigInt(head) - BigInt(blockNumber) + 1n;
  const have = raw < 0n ? 0n : raw;
  return { ok: have >= BigInt(need), have, need };
}

/** ITER amounts are only ever shown to people from base units; parse a stored one. */
export function parseBaseUnits(raw: string | null | undefined): bigint | null {
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  return BigInt(raw.trim());
}

/** The catalogue role the payout asset holds. */
export const REWARD_ROLE = "reward";

/** What an operator is told when the reward asset cannot be resolved. */
export const ASSIGN_REWARD_HINT =
  "Assign the reward role to an asset with a deployment on this chain in Token catalog";

/** The reward asset's deployment on one chain, from identity-service's catalogue. */
export interface RewardAssetDeployment {
  address: `0x${string}`;
  decimals: number;
}

/**
 * The asset holding the `reward` role, on `chainId`, from identity-service
 * (`GET /assets/role/reward`) — the platform's source of truth for multichain
 * assets. Never an env var, never @iter/deployments.
 *
 * Null when the asset has no deployment on this chain. Throws, with a sentence,
 * for everything that makes it unusable: no base URL, no role holder, an
 * unreachable service, MORE THAN ONE deployment on the chain (picking one would
 * be a guess, and a wrong guess pays — or matches payouts of — the wrong
 * token), a deployment without decimals (a payout multiplies by them). Shared
 * by admin-service and the broker so both resolve identically.
 */
export async function lookupRewardAsset(
  chainId: number,
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<RewardAssetDeployment | null> {
  const base = baseUrl?.trim().replace(/\/$/, "");
  if (!base) throw new Error("IDENTITY_SERVICE_URL is not set");
  let res: Response;
  try {
    res = await fetchImpl(`${base}/assets/role/${REWARD_ROLE}`, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new Error(`identity-service is unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 404) throw new Error(`no asset holds the reward role — ${ASSIGN_REWARD_HINT}`);
  if (!res.ok) throw new Error(`identity-service answered ${res.status} for the reward asset`);
  const asset = (await res.json()) as {
    id: string;
    deployments?: Array<{ chainId: number; address: string; decimals: number | null }>;
  };
  const onChain = (asset.deployments ?? []).filter((d) => d.chainId === chainId);
  if (onChain.length > 1) {
    throw new Error(
      `"${asset.id}" has ${onChain.length} deployments on chain ${chainId} (${onChain.map((d) => d.address).join(", ")}) — ` +
        "unlink all but the real one in Token catalog",
    );
  }
  const deployment = onChain[0];
  if (!deployment) return null;
  if (deployment.decimals == null) {
    throw new Error(`"${asset.id}" on chain ${chainId} has no decimals set in Token catalog`);
  }
  return { address: deployment.address as `0x${string}`, decimals: deployment.decimals };
}
