/** Verifying that a transaction moved value. No database, no network.
 *
 * packages/types/node_modules/.bin/tsx --test src/transfer.test.ts
 *
 * These rules are shared by apps/web (which reports a transfer) and
 * identity-service (which decides whether to record it), so they live here for
 * the same reason the support status machine does: two writers that must not
 * disagree.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRANSFER_TOPIC,
  depositCredits,
  verifyDeposit,
  verifyWithdrawal,
  type ReceiptLike,
} from "./transfer";

const ME = "0xAbC0000000000000000000000000000000000001";
const THEM = "0x9990000000000000000000000000000000000002";
const TOKEN = "0x3600000000000000000000000000000000000000";
const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2)}`.toLowerCase();
const ok: ReceiptLike = { status: "success", logs: [] };
const transferLog = (from: string, to: string, amount: bigint, token = TOKEN) => ({
  address: token,
  topics: [TRANSFER_TOPIC, pad(from), pad(to)],
  data: `0x${amount.toString(16)}`,
});

describe("verifyDeposit", () => {
  it("accepts a native transfer to this account", () => {
    assert.deepEqual(verifyDeposit({ to: ME, value: BigInt(5) }, ok, ME), {
      ok: true,
      kind: "native",
      amount: BigInt(5),
    });
  });

  it("matches the recipient case-insensitively", () => {
    // Explorers, wallets and our own UI disagree on checksum casing constantly.
    const upper = ME.toUpperCase().replace("0X", "0x");
    assert.equal(verifyDeposit({ to: ME.toLowerCase(), value: BigInt(1) }, ok, upper).ok, true);
  });

  it("accepts an ERC-20 transfer to this account", () => {
    const receipt: ReceiptLike = {
      status: "success",
      logs: [transferLog(THEM, ME, BigInt(1_000_000))],
    };
    assert.deepEqual(verifyDeposit({ to: TOKEN, value: BigInt(0) }, receipt, ME), {
      ok: true,
      kind: "erc20",
      token: TOKEN,
      amount: BigInt(1_000_000),
    });
  });

  it("reads the ERC-20 case BEFORE the native recipient", () => {
    // A token transfer's own `to` is the CONTRACT, never the account. Checking
    // the native recipient first answers "not yours" for every token deposit.
    const receipt: ReceiptLike = { status: "success", logs: [transferLog(THEM, ME, BigInt(7))] };
    const result = verifyDeposit({ to: TOKEN, value: BigInt(0) }, receipt, ME);
    assert.equal(result.ok && result.kind, "erc20");
  });

  it("refuses a transfer to somebody else", () => {
    assert.deepEqual(verifyDeposit({ to: THEM, value: BigInt(9) }, ok, ME), {
      ok: false,
      reason: "not-yours",
    });
    const receipt: ReceiptLike = { status: "success", logs: [transferLog(ME, THEM, BigInt(9))] };
    assert.deepEqual(verifyDeposit({ to: TOKEN, value: BigInt(0) }, receipt, ME), {
      ok: false,
      reason: "not-yours",
    });
  });

  it("refuses a reverted transaction before anything else", () => {
    // It has a hash and appears on an explorer, and it moved nothing.
    const receipt: ReceiptLike = {
      status: "reverted",
      logs: [transferLog(THEM, ME, BigInt(100))],
    };
    assert.deepEqual(verifyDeposit({ to: ME, value: BigInt(100) }, receipt, ME), {
      ok: false,
      reason: "reverted",
    });
  });

  it("refuses a zero-value call to this account", () => {
    assert.deepEqual(verifyDeposit({ to: ME, value: BigInt(0) }, ok, ME), {
      ok: false,
      reason: "no-value",
    });
  });

  it("ignores a zero-amount or unparsable Transfer log", () => {
    const zero: ReceiptLike = { status: "success", logs: [transferLog(THEM, ME, BigInt(0))] };
    assert.equal(verifyDeposit({ to: TOKEN, value: BigInt(0) }, zero, ME).ok, false);
    const junk: ReceiptLike = {
      status: "success",
      logs: [{ address: TOKEN, topics: [TRANSFER_TOPIC, pad(THEM), pad(ME)], data: "0xnothex" }],
    };
    assert.equal(verifyDeposit({ to: TOKEN, value: BigInt(0) }, junk, ME).ok, false);
  });

  it("ignores logs that are not Transfer, and malformed topics", () => {
    const other: ReceiptLike = {
      status: "success",
      logs: [
        { address: TOKEN, topics: ["0xdeadbeef", pad(THEM), pad(ME)], data: "0x5" },
        { address: TOKEN, topics: [TRANSFER_TOPIC, pad(THEM)], data: "0x5" },
      ],
    };
    assert.equal(verifyDeposit({ to: TOKEN, value: BigInt(0) }, other, ME).ok, false);
  });

  it("handles a contract creation, whose `to` is null", () => {
    assert.deepEqual(verifyDeposit({ to: null, value: BigInt(5) }, ok, ME), {
      ok: false,
      reason: "not-yours",
    });
  });
});

describe("verifyWithdrawal", () => {
  it("accepts a native send this account signed", () => {
    assert.deepEqual(verifyWithdrawal({ to: THEM, from: ME, value: BigInt(5) }, ok, ME), {
      ok: true,
      kind: "native",
      amount: BigInt(5),
    });
  });

  it("accepts an ERC-20 transfer this account signed", () => {
    const receipt: ReceiptLike = {
      status: "success",
      logs: [transferLog(ME, THEM, BigInt(100))],
    };
    assert.deepEqual(verifyWithdrawal({ to: TOKEN, from: ME, value: BigInt(0) }, receipt, ME), {
      ok: true,
      kind: "erc20",
      token: TOKEN,
      amount: BigInt(100),
    });
  });

  it("refuses a transaction this account did NOT sign", () => {
    // The whole test. Anyone can name a transaction; only its signer is `from`,
    // so this is what stops a client writing "money left that wallet" about
    // someone else, onto a record other devices read.
    assert.deepEqual(verifyWithdrawal({ to: THEM, from: THEM, value: BigInt(5) }, ok, ME), {
      ok: false,
      reason: "not-yours",
    });
    assert.deepEqual(verifyWithdrawal({ to: THEM, value: BigInt(5) }, ok, ME), {
      ok: false,
      reason: "not-yours",
    });
  });

  it("refuses a self-send, which costs a fee and moves nothing", () => {
    assert.deepEqual(verifyWithdrawal({ to: ME, from: ME, value: BigInt(5) }, ok, ME), {
      ok: false,
      reason: "no-value",
    });
  });

  it("refuses a reverted transaction first of all", () => {
    const receipt: ReceiptLike = { status: "reverted", logs: [] };
    assert.deepEqual(verifyWithdrawal({ to: THEM, from: ME, value: BigInt(5) }, receipt, ME), {
      ok: false,
      reason: "reverted",
    });
  });

  it("does not count an INCOMING transfer as a withdrawal", () => {
    // The receipt credits ME and ME signed it. Reading the recipient side here
    // would report money leaving a wallet that in fact received some.
    const receipt: ReceiptLike = { status: "success", logs: [transferLog(THEM, ME, BigInt(100))] };
    assert.equal(verifyWithdrawal({ to: TOKEN, from: ME, value: BigInt(0) }, receipt, ME).ok, false);
  });
});

/*
 * One movement, several logs.
 *
 * Measured on Arc, transaction 0x66b081…: a 0.05 USDC deposit emitted a
 * `Transfer` from the canonical USDC at 0x3600…0000 (6 decimals) AND one from
 * the system predeploy at 0xff…fe, the 18-decimal gas view of the same funds.
 * Only one of those contracts answers `symbol()`, and taking the receipt's
 * first log took the other — which is how a deposit came to render as
 * "Received 0.05 —".
 */
describe("depositCredits", () => {
  const account = "0xefd77a44a8dd7543b8c3bad1d63f396cfd239a23";
  const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2)}`;
  const transferLog = (address: string, value: bigint) => ({
    address,
    topics: [TRANSFER_TOPIC, pad("0xf8fb4672170607c95663f4cc674ddb1386b7cfe0"), pad(account)],
    data: `0x${value.toString(16).padStart(64, "0")}`,
  });

  const receipt = {
    status: "success" as const,
    logs: [
      // The predeploy mirror comes FIRST in the real receipt.
      transferLog("0xfffffffffffffffffffffffffffffffffffffffe", 50_000_000_000_000_000n),
      transferLog("0x3600000000000000000000000000000000000000", 50_000n),
    ],
  };
  const tx = { to: "0x3600000000000000000000000000000000000000", from: "0xf8fb", value: 0n };

  it("returns BOTH views, in receipt order, so a caller can pick the real token", () => {
    const credits = depositCredits(tx, receipt, account);
    assert.equal(credits.length, 2);
    assert.deepEqual(credits[0], {
      kind: "erc20",
      token: "0xfffffffffffffffffffffffffffffffffffffffe",
      amount: 50_000_000_000_000_000n,
    });
    assert.deepEqual(credits[1], {
      kind: "erc20",
      token: "0x3600000000000000000000000000000000000000",
      amount: 50_000n,
    });
  });

  it("still puts the native credit last, behind any token log", () => {
    const credits = depositCredits(
      { to: account, from: "0xf8fb", value: 7n },
      receipt,
      account,
    );
    assert.equal(credits.length, 3);
    assert.deepEqual(credits[2], { kind: "native", amount: 7n });
  });

  it("is empty for a reverted transaction, whatever it logged", () => {
    assert.deepEqual(depositCredits(tx, { ...receipt, status: "reverted" }, account), []);
  });

  it("ignores logs crediting somebody else", () => {
    const other = "0x1111111111111111111111111111111111111111";
    assert.deepEqual(depositCredits(tx, receipt, other), []);
  });

  it("leaves verifyDeposit's answer unchanged — it is still the first credit", () => {
    const result = verifyDeposit(tx, receipt, account);
    assert.equal(result.ok, true);
    if (result.ok && result.kind === "erc20") {
      assert.equal(result.token, "0xfffffffffffffffffffffffffffffffffffffffe");
    }
  });
});
