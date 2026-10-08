import type { TransactionReceipt } from "viem";

/**
 * Wait for a transaction to settle, without trusting the block watcher alone.
 *
 * ## The failure this exists for
 *
 * `waitForTransactionReceipt` watches for new blocks and re-checks on each one.
 * When that watch stalls, it does not fail — it waits forever, and every call
 * site here passed no timeout at all. Measured against Arc on 2026-09-28: a
 * deposit signed through the UI MINED — the pair was created and the position
 * token existed on chain with all three bands — and the app sat at "neither
 * settled nor failed" until the e2e run gave up after 180 seconds. The money
 * had moved and the screen never said so.
 *
 * Arc is where it shows up because `apps/web/CLAUDE.md` already records that its
 * RPC returns receipts slowly and its proxy caches `latest`; a watcher that
 * misses the block a receipt arrives in has nothing to wake it again.
 *
 * ## Racing a plain poll against it
 *
 * A timeout alone would only convert a hang into an error, which is the same
 * lie in less time. So this runs the watcher AND a direct `getTransactionReceipt`
 * poll, and takes whichever answers first. The poll needs no subscription, no
 * filter and no block notification — it asks the question the caller actually
 * has, once every `pollMs`.
 *
 * The watcher is kept rather than replaced because it is the half that knows
 * about REPLACEMENT: a sped-up or cancelled transaction gets a different hash,
 * and `getTransactionReceipt` on the original would poll until the deadline for
 * a receipt that is never coming.
 *
 * ## "unknown" is a real answer and must not be rendered as either other one
 *
 * Past the deadline the honest report is that the transaction was sent and has
 * not been seen to settle. Calling that a failure invites the user to sign it
 * again — which, on a withdrawal, is how one becomes two. Calling it a success
 * claims something nobody observed. Callers get `unknown` and are expected to
 * say so.
 */
export type Settlement =
  | { status: "success"; receipt: TransactionReceipt }
  | { status: "reverted"; receipt: TransactionReceipt }
  | { status: "unknown"; receipt: null };

export interface AwaitReceiptOptions {
  /** How often the direct poll asks. */
  pollMs?: number;
  /** When to give up and answer `unknown`. */
  timeoutMs?: number;
}

/** Just the two calls this needs, so a test can supply them without a chain. */
export interface ReceiptClient {
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
    timeout?: number;
  }): Promise<TransactionReceipt>;
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<TransactionReceipt>;
}

const DEFAULT_POLL_MS = 1_500;
/**
 * Long enough that a slow chain is not cut off mid-settle, short enough that a
 * stalled watcher does not hold a dialog open past a person's patience. Arc
 * measures 1–4s end to end and RISE 4–9s (apps/web/CLAUDE.md), so this is two
 * orders of magnitude of headroom, not a guess at the common case.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function awaitReceipt(
  client: ReceiptClient,
  hash: `0x${string}`,
  { pollMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: AwaitReceiptOptions = {},
): Promise<Settlement> {
  const settle = (receipt: TransactionReceipt): Settlement =>
    receipt.status === "success"
      ? { status: "success", receipt }
      : { status: "reverted", receipt };

  return new Promise<Settlement>((resolve) => {
    let done = false;
    const finish = (value: Settlement) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish({ status: "unknown", receipt: null }), timeoutMs);

    // The watcher. Its own timeout matches ours so it cannot outlive the answer.
    client
      .waitForTransactionReceipt({ hash, timeout: timeoutMs })
      .then((receipt) => finish(settle(receipt)))
      // A rejection here is not the outcome — the poll may still answer, and the
      // deadline above is what ends it if neither does.
      .catch(() => {});

    // The poll. `getTransactionReceipt` THROWS while a transaction is pending
    // rather than answering null, so the miss is the catch, not a falsy check.
    void (async () => {
      while (!done) {
        try {
          const receipt = await client.getTransactionReceipt({ hash });
          if (receipt) {
            finish(settle(receipt));
            return;
          }
        } catch {
          // Not mined yet, or a read that failed. Either way, ask again.
        }
        if (done) return;
        await sleep(pollMs);
      }
    })();
  });
}
