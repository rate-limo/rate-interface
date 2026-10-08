import { describe, expect, it, vi } from "vitest";
import type { TransactionReceipt } from "viem";
import { awaitReceipt, type ReceiptClient } from "./awaitReceipt";

const HASH = "0xabc" as `0x${string}`;
const receipt = (status: "success" | "reverted") =>
  ({ status, transactionHash: HASH }) as unknown as TransactionReceipt;

/** A watcher that never answers — the Arc failure, in one line. */
const stalled = () => new Promise<TransactionReceipt>(() => {});

const client = (over: Partial<ReceiptClient>): ReceiptClient => ({
  waitForTransactionReceipt: stalled,
  getTransactionReceipt: () => Promise.reject(new Error("not mined")),
  ...over,
});

describe("awaitReceipt", () => {
  it("takes the watcher's answer when it arrives", async () => {
    const out = await awaitReceipt(
      client({ waitForTransactionReceipt: async () => receipt("success") }),
      HASH,
    );
    expect(out.status).toBe("success");
  });

  /**
   * The whole point. A transaction that MINED while the block watch stalled used
   * to leave the caller waiting forever: measured on Arc, a deposit whose pair
   * and position both existed on chain sat unsettled for 180 seconds.
   */
  it("answers from the direct poll when the watcher stalls", async () => {
    const out = await awaitReceipt(
      client({ getTransactionReceipt: async () => receipt("success") }),
      HASH,
      { pollMs: 1 },
    );
    expect(out.status).toBe("success");
  });

  it("polls again after a pending read throws, rather than giving up on it", async () => {
    let calls = 0;
    const out = await awaitReceipt(
      client({
        getTransactionReceipt: async () => {
          calls += 1;
          // viem throws while a transaction is pending; it does not answer null.
          if (calls < 3) throw new Error("TransactionReceiptNotFoundError");
          return receipt("success");
        },
      }),
      HASH,
      { pollMs: 1 },
    );
    expect(out.status).toBe("success");
    expect(calls).toBe(3);
  });

  it("reports a mined revert as reverted, never as unknown", async () => {
    const out = await awaitReceipt(
      client({ getTransactionReceipt: async () => receipt("reverted") }),
      HASH,
      { pollMs: 1 },
    );
    expect(out.status).toBe("reverted");
    expect(out.receipt).not.toBeNull();
  });

  /**
   * "Sent, not seen to settle" is its own answer. Reporting it as a failure is
   * what invites a second signature for a transaction already in flight — on a
   * withdrawal, how one becomes two.
   */
  it("answers unknown at the deadline, with no receipt", async () => {
    const out = await awaitReceipt(client({}), HASH, { pollMs: 1, timeoutMs: 20 });
    expect(out.status).toBe("unknown");
    expect(out.receipt).toBeNull();
  });

  it("stops polling once an answer is in", async () => {
    const poll = vi.fn(async () => receipt("success"));
    await awaitReceipt(client({ getTransactionReceipt: poll }), HASH, { pollMs: 1 });
    const after = poll.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(poll.mock.calls.length, "the poll kept running after resolving").toBe(after);
  });

  /** A watcher that rejects must not decide the outcome — the poll may still answer. */
  it("lets the poll win after the watcher rejects", async () => {
    let calls = 0;
    const out = await awaitReceipt(
      client({
        waitForTransactionReceipt: () => Promise.reject(new Error("filter not found")),
        getTransactionReceipt: async () => {
          calls += 1;
          if (calls < 2) throw new Error("not mined");
          return receipt("success");
        },
      }),
      HASH,
      { pollMs: 1 },
    );
    expect(out.status).toBe("success");
  });
});
