import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  RECENT_MS,
  expectedNonce,
  isNonceTooLow,
  nextNonce,
  recordSent,
  resetNonces,
  sendWithNonce,
} from "./nonce";

const CHAIN = 11155931;
const ME = "0xA68Be3A95577af73Fc4647Ef333d1A7b775C62e1";
const noSleep = () => Promise.resolve();

// The exact rejection RISE returned for the order sent after its approval.
const RISE_ERR = Object.assign(new Error("Transaction creation failed."), {
  shortMessage: "Nonce provided for the transaction is lower than the current nonce of the account.",
  cause: { message: "nonce too low: next nonce 1, tx nonce 0" },
});

beforeEach(() => resetNonces());

describe("nextNonce", () => {
  it("never reuses a nonce this tab just sent, even when the RPC lags", () => {
    recordSent(CHAIN, ME, 0, 1_000);
    // The approval used 0; a lagging node still reports 0 pending.
    expect(nextNonce(CHAIN, ME, 0, 2_000)).toBe(1);
  });

  it("follows the RPC when it is ahead", () => {
    recordSent(CHAIN, ME, 0, 1_000);
    expect(nextNonce(CHAIN, ME, 5, 2_000)).toBe(5);
  });

  it("stops trusting the mark once it is old, so a dropped tx cannot stall the account", () => {
    recordSent(CHAIN, ME, 7, 1_000);
    expect(nextNonce(CHAIN, ME, 7, 1_000 + RECENT_MS + 1)).toBe(7);
  });

  it("is per chain and case-insensitive per address", () => {
    recordSent(CHAIN, ME.toLowerCase(), 3, 1_000);
    expect(nextNonce(CHAIN, ME, 0, 1_500)).toBe(4);
    expect(nextNonce(1, ME, 0, 1_500)).toBe(0);
  });
});

describe("reading the rejection", () => {
  it("recognises RISE's nonce-too-low and reads the expected nonce through the cause chain", () => {
    expect(isNonceTooLow(RISE_ERR)).toBe(true);
    expect(expectedNonce(RISE_ERR)).toBe(1);
  });

  it("does not treat other failures as a nonce problem", () => {
    expect(isNonceTooLow(new Error("insufficient funds for gas * price + value"))).toBe(false);
    expect(isNonceTooLow(new Error("execution reverted"))).toBe(false);
  });
});

describe("sendWithNonce", () => {
  it("sends the order after its approval with the next nonce, despite a stale read", async () => {
    const send = vi.fn(async (n: number) => `0x${n}`);
    const stale = async () => 0;
    await sendWithNonce({ chainId: CHAIN, address: ME, pending: stale, send, sleep: noSleep }); // approval
    await sendWithNonce({ chainId: CHAIN, address: ME, pending: stale, send, sleep: noSleep }); // order
    expect(send.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it("retries a nonce-too-low with the nonce the node names", async () => {
    const send = vi.fn(async (n: number) => {
      if (n === 0) throw RISE_ERR;
      return "0xok";
    });
    await expect(sendWithNonce({ chainId: CHAIN, address: ME, pending: async () => 0, send, sleep: noSleep })).resolves.toBe("0xok");
    expect(send.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it("without a named nonce, never retries below the one refused", async () => {
    const send = vi.fn(async (n: number) => {
      if (n < 2) throw new Error("nonce too low");
      return "0xok";
    });
    await sendWithNonce({ chainId: CHAIN, address: ME, pending: async () => 0, send, sleep: noSleep });
    expect(send.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });

  it("gives up after MAX_ATTEMPTS and throws the node's error", async () => {
    const send = vi.fn(async () => {
      throw new Error("nonce too low");
    });
    await expect(sendWithNonce({ chainId: CHAIN, address: ME, pending: async () => 0, send, sleep: noSleep })).rejects.toThrow(
      "nonce too low",
    );
    expect(send).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("never retries anything that is not a nonce rejection", async () => {
    const send = vi.fn(async () => {
      throw new Error("execution reverted: InsufficientGasToMatch()");
    });
    await expect(sendWithNonce({ chainId: CHAIN, address: ME, pending: async () => 0, send, sleep: noSleep })).rejects.toThrow(
      "execution reverted",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("records nothing when the send fails, so the next attempt is not skipped ahead", async () => {
    await sendWithNonce({
      chainId: CHAIN,
      address: ME,
      pending: async () => 4,
      send: async () => {
        throw new Error("user rejected");
      },
      sleep: noSleep,
    }).catch(() => {});
    expect(nextNonce(CHAIN, ME, 4)).toBe(4);
  });
});
