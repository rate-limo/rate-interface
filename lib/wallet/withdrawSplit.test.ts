/**
 * The one invariant: `fee + rest === amount`, always, for every input.
 *
 * Everything else here is a consequence of it. The bug this file exists to
 * prevent is the natural way to write the split — computing each side with its
 * own division — which truncates twice and leaves a unit behind on most inputs.
 * That loss is invisible per call and permanent in aggregate.
 */
import { describe, expect, it } from "vitest";
import {
  BPS_DENOMINATOR,
  FEE_BPS,
  FEE_WAIVED_BELOW,
  WithdrawSplitError,
  rejectWithdrawal,
  splitWithdrawal,
} from "./withdrawSplit";

const USDC = (n: number) => BigInt(Math.round(n * 1e6)); // 6 decimals
const ETH = (n: bigint) => n * BigInt(10) ** BigInt(18);

describe("splitWithdrawal", () => {
  it("takes 1 basis point", () => {
    // 0.01% of 100 USDC is 0.01 USDC.
    expect(splitWithdrawal(USDC(100))).toEqual({
      rest: USDC(99.99),
      fee: USDC(0.01),
      feeWaived: false,
    });
  });

  it("conserves the amount exactly, across the whole range", () => {
    // The invariant, asserted rather than reasoned about. Includes primes and
    // values just off a power of ten, which are where a second division loses a
    // unit.
    const amounts = [
      BigInt(1), BigInt(2), BigInt(3), BigInt(7), BigInt(9_999), BigInt(10_000), BigInt(10_001), BigInt(12_345), BigInt(99_999),
      USDC(0.5), USDC(1), USDC(1234.567891), ETH(BigInt(1)), ETH(BigInt(1_000_000)),
      BigInt(2) ** BigInt(96) - BigInt(1), BigInt(10) ** BigInt(30) + BigInt(7),
    ];
    for (const amount of amounts) {
      const { rest, fee } = splitWithdrawal(amount);
      expect(rest + fee, `conservation failed for ${amount}`).toBe(amount);
      expect(rest).toBeGreaterThanOrEqual(BigInt(0));
      expect(fee).toBeGreaterThanOrEqual(BigInt(0));
    }
  });

  it("never computes rest by a second division", () => {
    // The failing implementation, pinned as a counter-example. `amount * 9999 /
    // 10000` is what a reasonable person writes, and for 3 it yields rest=2
    // against fee=0 — one unit destroyed per call.
    const amount = BigInt(3);
    const naiveRest = (amount * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
    expect(naiveRest).toBe(BigInt(2));
    expect(splitWithdrawal(amount).rest).toBe(BigInt(3));
  });

  it("waives the fee below the truncation boundary, and says so", () => {
    // Not a policy choice about small transfers — it is what integer division
    // does. `feeWaived` is what lets a UI explain the zero.
    const justUnder = splitWithdrawal(FEE_WAIVED_BELOW - BigInt(1));
    expect(justUnder).toEqual({ rest: BigInt(9_999), fee: BigInt(0), feeWaived: true });

    const exactly = splitWithdrawal(FEE_WAIVED_BELOW);
    expect(exactly).toEqual({ rest: BigInt(9_999), fee: BigInt(1), feeWaived: false });
  });

  it("does not round a dust transfer up to a 100% fee", () => {
    // The alternative to waiving. A floor of 1 unit would take the entire
    // transfer here, which is why the boundary waives instead.
    const { rest, fee } = splitWithdrawal(BigInt(1));
    expect(fee).toBe(BigInt(0));
    expect(rest).toBe(BigInt(1));
  });

  it("refuses a non-positive amount rather than returning a zero split", () => {
    // `{0, 0}` would let a confirmation screen render for a transfer that moves
    // nothing.
    for (const bad of [BigInt(0), -BigInt(1), -BigInt(10_000)]) {
      expect(() => splitWithdrawal(bad)).toThrow(WithdrawSplitError);
    }
  });

  it("keeps the fee proportional at scale", () => {
    const { fee } = splitWithdrawal(ETH(BigInt(10_000)));
    expect(fee).toBe(ETH(BigInt(1))); // 0.01% of 10,000 is 1
  });
});

describe("rejectWithdrawal", () => {
  const FROM = "0xF8FB4672170607C95663f4Cc674dDb1386b7CfE0";
  const FEE = "0x1111111111111111111111111111111111111111";
  const DEST = "0x2222222222222222222222222222222222222222";

  it("allows an ordinary withdrawal", () => {
    expect(rejectWithdrawal({ from: FROM, to: DEST, feeWallet: FEE })).toBeNull();
  });

  it("refuses when no fee wallet is configured", () => {
    // Refused, never defaulted: a zero-address recipient burns the fee.
    for (const feeWallet of [undefined, "", "   "]) {
      expect(rejectWithdrawal({ from: FROM, to: DEST, feeWallet })).toMatch(/fee wallet/i);
    }
  });

  it("refuses a send to the wallet it is leaving", () => {
    expect(rejectWithdrawal({ from: FROM, to: FROM, feeWallet: FEE })).toMatch(/withdrawing from/i);
  });

  it("refuses a destination that IS the fee wallet", () => {
    // Otherwise the user's whole balance lands in the operator's wallet and the
    // transfer reports success.
    expect(rejectWithdrawal({ from: FROM, to: FEE, feeWallet: FEE })).toMatch(/fee wallet/i);
  });

  it("refuses when the sender is itself the fee wallet", () => {
    // A misconfiguration that costs gas to pay someone their own money.
    expect(rejectWithdrawal({ from: FEE, to: DEST, feeWallet: FEE })).toMatch(/pay itself/i);
  });

  it("compares case- and whitespace-insensitively", () => {
    // Addresses arrive checksummed from one source and lowercased from another;
    // a case-sensitive compare would let every guard above pass by accident.
    expect(
      rejectWithdrawal({ from: FROM, to: ` ${FROM.toLowerCase()} `, feeWallet: FEE }),
    ).toMatch(/withdrawing from/i);
    expect(
      rejectWithdrawal({ from: FROM, to: DEST, feeWallet: ` ${FEE.toUpperCase()} ` }),
    ).toBeNull();
  });
});
