/**
 * Choosing a transaction's nonce on the wallet frame.
 *
 * ## The bug this exists for
 *
 * An order sent right after its approval failed with "nonce too low: next
 * nonce 1, tx nonce 0". viem asks the chain's public RPC for the pending
 * transaction count, and the node that answers can be behind the one that
 * mined the approval a moment ago. So the second transaction was signed with
 * the approval's nonce and rejected. Measured on RISE, 2026-10-04: a pause of
 * a few seconds after the approval made it go away. That is what a lagging
 * read looks like.
 *
 * ## Two defences, both needed
 *
 * 1. **A high-water mark.** The frame records the nonce of every transaction it
 *    sends, so the next one uses `max(rpc pending count, last sent + 1)`. A
 *    stale read can no longer reuse a nonce this tab just spent. The mark is
 *    only trusted for `RECENT_MS`: past that the RPC has long caught up, and a
 *    mark kept forever would leave a gap if a sent transaction was dropped,
 *    stalling every later one behind it.
 * 2. **A retry on rejection.** The mark only knows about this tab. A second tab,
 *    or a wallet reloaded mid-flight, can still hand the node a nonce it
 *    already has. The node's error usually names the nonce it expects ("next
 *    nonce 1"), so the retry uses that number. Without one it re-reads.
 *
 * Nothing here can sign twice: a rejected transaction was never accepted, and
 * only a rejection is retried. Errors that do not mean "wrong nonce" are thrown
 * unchanged.
 */

/** How long a recorded nonce is trusted over the RPC's answer. */
export const RECENT_MS = 60_000;
/** Total attempts, the first send included. */
export const MAX_ATTEMPTS = 3;

type Key = `${number}:${string}`;
const lastSent = new Map<Key, { nonce: number; at: number }>();

function key(chainId: number, address: string): Key {
  return `${chainId}:${address.toLowerCase()}`;
}

/** The nonce to use given what the RPC reported as pending. */
export function nextNonce(chainId: number, address: string, rpcPending: number, now = Date.now()): number {
  const last = lastSent.get(key(chainId, address));
  if (!last || now - last.at > RECENT_MS) return rpcPending;
  return Math.max(rpcPending, last.nonce + 1);
}

export function recordSent(chainId: number, address: string, nonce: number, now = Date.now()): void {
  const k = key(chainId, address);
  const prev = lastSent.get(k);
  if (!prev || nonce >= prev.nonce || now - prev.at > RECENT_MS) lastSent.set(k, { nonce, at: now });
}

/** Test seam: forget every recorded nonce. */
export function resetNonces(): void {
  lastSent.clear();
}

function messageOf(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; e && i < 6; i++) {
    const o = e as { shortMessage?: string; message?: string; details?: string; cause?: unknown };
    for (const s of [o.shortMessage, o.message, o.details]) if (typeof s === "string") parts.push(s);
    e = o.cause;
  }
  return parts.join(" | ");
}

/** True when a send was rejected because its nonce was already used. */
export function isNonceTooLow(err: unknown): boolean {
  return /nonce too low|nonce has already been used|already known|lower than the current nonce|replacement transaction underpriced|NonceTooLow/i.test(
    messageOf(err),
  );
}

/** The nonce the node said it expects ("next nonce 1"), when it said one. */
export function expectedNonce(err: unknown): number | null {
  const m = /next nonce:?\s*(\d+)/i.exec(messageOf(err)) ?? /expected:?\s*(?:nonce\s*)?(\d+)/i.exec(messageOf(err));
  return m ? Number(m[1]) : null;
}

/**
 * Send with a nonce this tab has not used, retrying a "nonce too low"
 * rejection with the nonce the node expects.
 *
 * `send` must use exactly the nonce it is given; `pending` reads the RPC's
 * pending transaction count.
 */
export async function sendWithNonce<T>(opts: {
  chainId: number;
  address: string;
  pending: () => Promise<number>;
  send: (nonce: number) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<T> {
  const { chainId, address, pending, send } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let floor = 0;
  for (let attempt = 1; ; attempt++) {
    const nonce = Math.max(floor, nextNonce(chainId, address, await pending()));
    try {
      const out = await send(nonce);
      recordSent(chainId, address, nonce);
      return out;
    } catch (err) {
      if (!isNonceTooLow(err) || attempt >= MAX_ATTEMPTS) throw err;
      const expected = expectedNonce(err);
      // A number the node named beats any read; without one, give the RPC a
      // moment to catch up and never go back below what was just refused.
      floor = expected !== null && expected > nonce ? expected : nonce + 1;
      if (expected === null) await sleep(400 * attempt);
    }
  }
}
