import { describe, expect, it } from "vitest";
import { bandDepositAbi } from "./bandDeposit";
import { toFunctionSelector } from "viem";

/** viem's `toSignature` prefixes an error fragment, so build the signature here. */
const signatureOf = (f: unknown) => {
  const frag = f as { name: string; inputs?: readonly { type: string }[] };
  return `${frag.name}(${(frag.inputs ?? []).map((i) => i.type).join(",")})`;
};

const errorNames = new Set(
  bandDepositAbi.filter((f) => (f as { type?: string }).type === "error").map((f) => (f as { name: string }).name),
);

describe("bandDepositAbi", () => {
  /*
   * The revert an LP actually hit on Arc. It comes from BandPool, two contracts
   * below the wallet's call, so the manager's own ABI cannot name it and viem
   * printed the bare selector instead.
   */
  it("can name the errors thrown below the position manager", () => {
    for (const name of ["ZeroLiquidity", "NoLiquidity", "BandClosed", "BadBand", "NothingFilled"]) {
      expect(errorNames, name).toContain(name);
    }
  });

  it("still carries the manager's own errors", () => {
    for (const name of ["SharesBelowMinimum", "DeadlinePassed", "NotOwnerOrApproved"]) {
      expect(errorNames, name).toContain(name);
    }
  });

  it("can still encode the calls a deposit makes", () => {
    const names = bandDepositAbi
      .filter((f) => (f as { type?: string }).type === "function")
      .map((f) => (f as { name: string }).name);
    expect(names).toContain("mintSingleSided");
    expect(names).toContain("increaseLiquidity");
    expect(names).toContain("mint");
  });

  /*
   * viem matches a revert by SELECTOR. Two fragments sharing one would make the
   * decode order-dependent, which is exactly the kind of drift a merged ABI invites.
   */
  it("holds no duplicate error selectors", () => {
    const selectors = bandDepositAbi
      .filter((f) => (f as { type?: string }).type === "error")
      .map((f) => toFunctionSelector(signatureOf(f)));
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  /** The selector measured on chain, so a regenerated ABI cannot quietly drop it. */
  it("decodes 0x10074548 as ZeroLiquidity", () => {
    const zero = bandDepositAbi.find(
      (f) => (f as { type?: string }).type === "error" && (f as { name?: string }).name === "ZeroLiquidity",
    );
    expect(toFunctionSelector(signatureOf(zero))).toBe("0x10074548");
  });
});
