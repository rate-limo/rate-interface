/**
 * Claiming a deposit that arrived without the app watching.
 *
 * ## The problem this exists for
 *
 * A deposit made by scanning the QR — or by pasting the address into a phone
 * wallet, or an exchange withdrawal — happens entirely outside this app. It
 * never touches a code path here, so nothing records it and the transfer list
 * cannot show it. That is not a bug in the list; it is what "send to this
 * address" means.
 *
 * ## Why this verifies on chain instead of reporting to a backend
 *
 * The obvious shape is a webhook: the app tells a service "a deposit happened",
 * the service writes a row. That is strictly WEAKER than what is done here, for
 * two reasons.
 *
 * It is unverified. A webhook carries the app's claim, and the app is a browser
 * — anything it asserts about someone else's money is a client asserting it.
 * Reading the receipt from the chain asks the only party that knows.
 *
 * And it cannot see the deposits that matter. A webhook fires when the APP
 * submits a transfer, which is exactly the case already recorded, hash and all.
 * The transfers it would miss are the ones it was never present for — which is
 * the entire problem.
 *
 * So a claim takes a transaction HASH and checks it: did this transaction
 * succeed, and did it actually move value to this account? Nothing is taken on
 * trust, no service is required, and it works for a transfer made from anywhere
 * by anyone.
 *
 * The real fix remains an indexer handler for `Transfer` filtered to the
 * account, which would make claiming unnecessary rather than merely honest.
 * Until then this is the difference between "we cannot see it" and "paste the
 * hash and we will".
 */

/** ERC-20 `Transfer(address,address,uint256)`. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TransactionLike {
  /** Recipient. Null for a contract creation. */
  to: string | null;
  /** Sender. Needed to judge a WITHDRAWAL, which this account signed. */
  from?: string;
  value: bigint;
}

export interface ReceiptLike {
  status: "success" | "reverted";
  logs: readonly { address: string; topics: readonly string[]; data: string }[];
}

export type ClaimFailure =
  | "reverted"
  | "not-yours"
  | "no-value";

export type ClaimResult =
  | { ok: true; kind: "native"; amount: bigint }
  | { ok: true; kind: "erc20"; token: string; amount: bigint }
  | { ok: false; reason: ClaimFailure };

/** Is this 32-byte topic the padded form of `address`? */
function topicIs(topic: string | undefined, address: string): boolean {
  if (!topic || topic.length !== 66) return false;
  return topic.slice(26).toLowerCase() === address.slice(2).toLowerCase();
}

/**
 * Did this transaction move value TO `account`?
 *
 * Deliberately strict about direction. A transaction the account SENT also
 * mentions it, and counting that would let someone "claim" their own withdrawal
 * as an incoming deposit — so only the recipient side is read: `to` for a
 * native transfer, and the second indexed topic of a `Transfer` log for an
 * ERC-20.
 *
 * A reverted transaction is refused before anything else. It appears on an
 * explorer, has a hash, and moved nothing.
 */
export function verifyDeposit(
  tx: TransactionLike,
  receipt: ReceiptLike,
  account: string,
): ClaimResult {
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };

  // ERC-20 first: a token transfer's own `to` is the CONTRACT, so checking the
  // native recipient first would answer "not yours" for every token deposit.
  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!topicIs(log.topics[2], account)) continue;
    let amount: bigint;
    try {
      amount = BigInt(log.data);
    } catch {
      continue;
    }
    if (amount <= BigInt(0)) continue;
    return { ok: true, kind: "erc20", token: log.address, amount };
  }

  if (tx.to && tx.to.toLowerCase() === account.toLowerCase()) {
    // A zero-value call to the account is not a deposit — a contract
    // interaction, or a wallet probing the address.
    if (tx.value <= BigInt(0)) return { ok: false, reason: "no-value" };
    return { ok: true, kind: "native", amount: tx.value };
  }

  return { ok: false, reason: "not-yours" };
}

export const CLAIM_FAILURE_COPY: Record<ClaimFailure, string> = {
  reverted: "That transaction failed on chain, so nothing was transferred.",
  "not-yours": "That transaction did not send anything to this wallet. Check the hash and the network.",
  "no-value": "That transaction reached this wallet but moved no funds.",
};

/**
 * Did this transaction move value AWAY from `account`?
 *
 * The mirror of `verifyDeposit`, and it exists for a different reason. A
 * withdrawal is submitted by this app, so its hash is already known — the check
 * is not there to discover it but to stop a client writing a row that says
 * money left a wallet when it did not, on a record other devices will read.
 *
 * `from` is the whole test. Anyone can name a transaction; only the account
 * that signed one appears as its sender.
 */
export function verifyWithdrawal(
  tx: TransactionLike,
  receipt: ReceiptLike,
  account: string,
): ClaimResult {
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  if (!tx.from || tx.from.toLowerCase() !== account.toLowerCase()) {
    return { ok: false, reason: "not-yours" };
  }

  // ERC-20 first, for the same reason as a deposit: a token transfer's own `to`
  // is the contract, and its `value` is zero.
  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!topicIs(log.topics[1], account)) continue;
    let amount: bigint;
    try {
      amount = BigInt(log.data);
    } catch {
      continue;
    }
    if (amount <= BigInt(0)) continue;
    return { ok: true, kind: "erc20", token: log.address, amount };
  }

  // A native send. `to === account` would be a self-send, which costs a fee and
  // moves nothing — not a withdrawal.
  if (tx.value > BigInt(0) && tx.to && tx.to.toLowerCase() !== account.toLowerCase()) {
    return { ok: true, kind: "native", amount: tx.value };
  }

  return { ok: false, reason: "no-value" };
}

/** The direction a reported transfer claims to be. */
export type TransferDirection = "deposit" | "withdraw";

/** Verify a reported transfer in whichever direction it claims. */
export function verifyTransfer(
  direction: TransferDirection,
  tx: TransactionLike,
  receipt: ReceiptLike,
  account: string,
): ClaimResult {
  return direction === "withdraw"
    ? verifyWithdrawal(tx, receipt, account)
    : verifyDeposit(tx, receipt, account);
}
