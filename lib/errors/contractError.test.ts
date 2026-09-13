import { describe, it, expect } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { NFTTokenMatchingEngineABI } from "@iter/abis";
import { contractErrorCopy } from "./contractError";

/** The ABI is `as const`, so its error names are a literal union — derived here rather
 * than typed `string`, which makes a renamed or removed error a compile error in this
 * file instead of a runtime surprise in a toast. */
type NftErrorName = Extract<(typeof NFTTokenMatchingEngineABI)[number], { type: "error" }>["name"];

/**
 * These build the revert the way the chain does — encode against the SHIPPED ABI, then let
 * viem decode it — rather than hand-writing `{ data: { errorName } }`. A hand-written shape
 * tests the copy table and nothing else: in particular it still passes if the ABI stops
 * carrying the error, which is the failure that actually reaches users (viem matches a
 * 4-byte selector; an absent fragment decodes to nothing at all).
 */
function revertedWith(errorName: NftErrorName, args: readonly unknown[]) {
  const data = encodeErrorResult({
    abi: NFTTokenMatchingEngineABI,
    errorName,
    // biome-ignore lint/suspicious/noExplicitAny: args differ per error and are checked by encodeErrorResult
    args: args as any,
  });
  const cause = new ContractFunctionRevertedError({
    abi: NFTTokenMatchingEngineABI,
    data,
    functionName: "buy",
    message: undefined,
  });
  expect(cause.data?.errorName).toBe(errorName);
  return new BaseError("The contract function reverted.", { cause });
}

describe("contractErrorCopy", () => {
  it("uses the shared table's copy for a decoded custom error", () => {
    const copy = contractErrorCopy(revertedWith("ZeroQuoteAmount", []));
    expect(copy.title).toBe("Set a price above zero");
    expect(copy.description).toContain("give the item away");
  });

  it("reads the same table the order path reads, so exchange errors keep their copy", () => {
    // OrderSizeTooSmall predates this module and belongs to the engine, not the NFT
    // contracts — proving the presenter delegates rather than keeping its own list.
    const copy = contractErrorCopy({ data: { errorName: "OrderSizeTooSmall" } });
    expect(copy.title).toBe("Order is too small");
  });

  it("names an unmapped revert with its arguments rather than calling it a failure", () => {
    const copy = contractErrorCopy({ data: { errorName: "SomeBrandNewError", args: [BigInt(7), "0xabc"] } });
    expect(copy.title).toBe("SomeBrandNewError(7, 0xabc)");
  });

  it("reports a rejected signature as a decision, not an error", () => {
    const rejected = contractErrorCopy({ cause: { name: "UserRejectedRequestError" } });
    expect(rejected.title).toBe("Request rejected");
    // Injected wallets report EIP-1193 4001 instead of viem's class.
    expect(contractErrorCopy({ cause: { code: 4001 } }).title).toBe("Request rejected");
  });

  it("falls back to shortMessage, then message, then the caller's fallback", () => {
    expect(contractErrorCopy(Object.assign(new Error("long"), { shortMessage: "short" })).title).toBe("short");
    expect(contractErrorCopy(new Error("just a message")).title).toBe("just a message");
    expect(contractErrorCopy("not an error", "Could not place order").title).toBe("Could not place order");
  });
});

/**
 * The two things `contractErrorCopy` gained when the toasts got buttons: it recognises a
 * failure that is not a revert at all, and it carries the next step for the ones that are.
 */
describe("contractErrorCopy — actionable failures", () => {
  it("turns a node's gas rejection into copy that names the chain's asset", () => {
    const error = Object.assign(new Error("…exceeds the balance of the account."), {
      name: "TransactionExecutionError",
      cause: Object.assign(new Error("…"), { name: "InsufficientFundsError" }),
    });
    const copy = contractErrorCopy(error, "Error submitting limit order", { chainId: 5042002 });
    expect(copy.title).toContain("USDC");
    expect(copy.action).toEqual({
      kind: "faucet",
      label: "Get test USDC",
      href: "https://faucet.circle.com",
    });
    // The fallback is what this used to fall through to — an 18-line viem dump.
    expect(copy.title).not.toContain("Error submitting");
    expect(copy.description).not.toContain("viem@");
  });

  it("carries a decoded error's fix intent through to the caller", () => {
    const copy = contractErrorCopy(revertedWith("ZeroQuoteAmount", []));
    expect(copy.title).toBe("Set a price above zero");
    // A revert has no href action — the fix is something the surface does to its own state.
    expect(copy.action).toBeUndefined();
  });

  it("prefers a decoded revert over the gas branch", () => {
    // Order matters at exactly one edge: a contract that reverts with its own
    // "insufficient funds" wording must be reported as the revert it is, not as a gas
    // shortfall that sends the user to a faucet.
    const copy = contractErrorCopy(revertedWith("ZeroQuoteAmount", []), "fallback", {
      chainId: 5042002,
    });
    expect(copy.title).toBe("Set a price above zero");
    expect(copy.action).toBeUndefined();
  });
});
