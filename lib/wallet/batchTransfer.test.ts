/**
 * The native/ERC-20 asymmetry, which is the thing that goes wrong silently.
 *
 * A native leg puts the recipient in `to` and the amount in `value`. An ERC-20
 * leg puts the TOKEN in `to`, zero in `value`, and the recipient inside the
 * calldata. Swap them and native value goes to a token contract — which most
 * tokens accept and none refund, with no revert to notice.
 */
import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, type Address } from "viem";
import {
  BatchTransferError,
  batchNativeValue,
  buildTransferBatch,
} from "./batchTransfer";

const BOB = "0x2222222222222222222222222222222222222222" as Address;
const CAROL = "0x3333333333333333333333333333333333333333" as Address;
const FEE = "0x1111111111111111111111111111111111111111" as Address;
const TOKEN = "0x4444444444444444444444444444444444444444" as Address;

describe("buildTransferBatch — native", () => {
  it("puts the recipient in `to` and the amount in `value`", () => {
    expect(buildTransferBatch([{ to: BOB, amount: BigInt(5) }])).toEqual([
      { to: BOB, value: BigInt(5), data: "0x" },
    ]);
  });

  it("pays several recipients different amounts, in order", () => {
    const calls = buildTransferBatch([
      { to: BOB, amount: BigInt(1) },
      { to: CAROL, amount: BigInt(2) },
      { to: FEE, amount: BigInt(3) },
    ]);
    expect(calls.map((c) => [c.to, c.value])).toEqual([
      [BOB, BigInt(1)],
      [CAROL, BigInt(2)],
      [FEE, BigInt(3)],
    ]);
  });
});

describe("buildTransferBatch — ERC-20", () => {
  it("calls the TOKEN, with the recipient inside the calldata", () => {
    // The asymmetry this file exists for.
    const [call] = buildTransferBatch([{ to: BOB, amount: BigInt(500) }], TOKEN);
    expect(call.to).toBe(TOKEN);
    expect(call.value).toBe(BigInt(0));

    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
    expect(decoded.functionName).toBe("transfer");
    expect(decoded.args).toEqual([BOB, BigInt(500)]);
  });

  it("never carries native value on a token leg", () => {
    // A non-zero value here would send the chain's native asset to the token
    // contract alongside the transfer.
    const calls = buildTransferBatch([{ to: BOB, amount: BigInt(1) }, { to: CAROL, amount: BigInt(2) }], TOKEN);
    expect(calls.every((c) => c.value === BigInt(0))).toBe(true);
    expect(batchNativeValue(calls)).toBe(BigInt(0));
  });
});

describe("buildTransferBatch — refusals", () => {
  it("refuses an empty batch here rather than on chain", () => {
    // `BatchExecutor` reverts with EmptyBatch; failing locally costs no gas and
    // yields a sentence instead of a decoded revert.
    expect(() => buildTransferBatch([])).toThrow(BatchTransferError);
  });

  it("refuses a zero or negative payment", () => {
    // A zero leg costs gas to move nothing, and usually means a waived fee was
    // passed through without checking.
    for (const amount of [BigInt(0), -BigInt(1)]) {
      expect(() => buildTransferBatch([{ to: BOB, amount }])).toThrow(BatchTransferError);
    }
  });
});


describe("batchNativeValue", () => {
  it("is what a caller must reserve gas ON TOP OF", () => {
    // A native max-withdrawal that spends the whole balance leaves nothing to
    // pay with, and one 7702 transaction pays for every leg.
    const calls = buildTransferBatch([
      { to: BOB, amount: BigInt(10) ** BigInt(18) },
      { to: FEE, amount: BigInt(10) ** BigInt(14) },
    ]);
    expect(batchNativeValue(calls)).toBe(BigInt(10) ** BigInt(18) + BigInt(10) ** BigInt(14));
  });
});
