import { describe, it, expect } from "vitest";
import { describeGasShortfall, gasFaucetFor, insufficientGasCopy, isInsufficientFunds } from "./insufficientGas";

/**
 * The shapes here are the ones measured against the live chains on 2026-09-04, not
 * invented: a fresh zero-balance account sending through the same local-account-over-http
 * path `meraConnector` builds gets exactly this nesting back, on both Arc and RISE.
 */
function nodeRejection(want: string) {
  const rpc = Object.assign(new Error("RPC Request failed."), {
    name: "RpcRequestError",
    code: -32003,
    details: `insufficient funds for gas * price + value: have 0 want ${want}`,
  });
  const rejected = Object.assign(new Error("Transaction creation failed."), {
    name: "TransactionRejectedRpcError",
    code: -32003,
    cause: rpc,
  });
  const funds = Object.assign(
    new Error(
      "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.",
    ),
    { name: "InsufficientFundsError", cause: rejected },
  );
  return Object.assign(new Error(funds.message), {
    name: "TransactionExecutionError",
    cause: funds,
  });
}

describe("isInsufficientFunds", () => {
  it("recognises the real cause chain from a node rejection", () => {
    expect(isInsufficientFunds(nodeRejection("630000000000000"))).toBe(true);
  });

  it("recognises it from the RPC code alone", () => {
    // A node that phrases the message differently still answers -32003.
    expect(isInsufficientFunds({ code: -32003, message: "not enough balance" })).toBe(true);
  });

  it("recognises it from the node's own wording when viem did not classify it", () => {
    expect(
      isInsufficientFunds(new Error("insufficient funds for gas * price + value: have 0 want 1")),
    ).toBe(true);
  });

  it("does NOT fire on a contract complaining about a TOKEN balance", () => {
    // The whole reason the phrase is matched in full rather than as "insufficient funds":
    // sending someone to a gas faucet over an ERC-20 shortfall wastes their time.
    expect(isInsufficientFunds(new Error("ERC20: transfer amount exceeds balance"))).toBe(false);
    expect(isInsufficientFunds(new Error("insufficient funds in the pool"))).toBe(false);
  });

  it("recognises Tempo's empty-fee-token estimate, and only at a ZERO allowance", () => {
    expect(isInsufficientFunds(new Error("gas required exceeds allowance (0)"))).toBe(true);
    // A non-zero allowance is the node's gas cap talking, not an empty balance.
    expect(isInsufficientFunds(new Error("gas required exceeds allowance (30000000)"))).toBe(false);
  });

  it("is false for an ordinary revert", () => {
    expect(isInsufficientFunds(new Error("execution reverted"))).toBe(false);
    expect(isInsufficientFunds(null)).toBe(false);
  });

  it("does not loop forever on a self-referential cause", () => {
    const looped: { name: string; cause?: unknown } = { name: "Whatever" };
    looped.cause = looped;
    expect(isInsufficientFunds(looped)).toBe(false);
  });
});

describe("insufficientGasCopy", () => {
  it("names PathUSD on Tempo, which has no gas coin", () => {
    const copy = insufficientGasCopy(42431);
    expect(copy.title).toContain("PathUSD");
    expect(gasFaucetFor(42431)?.href).toContain("tempo.xyz");
  });

  it("names Arc's gas asset as USDC, not ETH", () => {
    // Arc charges its fee in USDC. Telling a user there to add ETH asks for something
    // that does not exist on that chain.
    const copy = insufficientGasCopy(5042002);
    expect(copy.title).toContain("USDC");
    expect(copy.description).toContain("Arc Testnet");
    expect(copy.description).not.toContain("ETH");
  });

  it("names RISE's as ETH", () => {
    const copy = insufficientGasCopy(11155931);
    expect(copy.title).toContain("ETH");
    expect(copy.description).toContain("RISE Testnet");
  });

  it("offers a testnet's own faucet", () => {
    expect(insufficientGasCopy(5042002).action).toEqual({
      kind: "faucet",
      label: "Get test USDC",
      href: "https://faucet.circle.com",
    });
    const rise = insufficientGasCopy(11155931).action;
    expect(rise.kind === "faucet" && rise.href).toBe("https://faucet.testnet.riselabs.xyz");
  });

  it("NEVER offers a faucet for a production chain", () => {
    // Goes through `describeGasShortfall` on purpose: `wagmiChains` carries testnets
    // only, so `insufficientGasCopy(<a mainnet id>)` would take the NO-CHAIN branch and
    // pass while proving nothing about the branch that ships to production.
    const copy = describeGasShortfall({
      chainId: 1,
      symbol: "ETH",
      chainName: "Ethereum",
      testnet: false,
    });
    expect(copy.action).toEqual({ kind: "receive", label: "Deposit" });
    expect(copy.title).toBe("Add ETH to cover the network fee");
    expect(copy.description).toContain("Send ETH to this address on Ethereum");
  });

  it("refuses a faucet on a production chain even if its id is in the map", () => {
    // The gate is `testnet`, not the map. Arc's id with `testnet: false` is the shape a
    // mainnet launch would produce if someone reused the entry.
    const copy = describeGasShortfall({
      chainId: 5042002,
      symbol: "USDC",
      chainName: "Arc",
      testnet: false,
    });
    expect(copy.action.kind).toBe("receive");
  });

  it("falls back to handing over the address, which works on any chain", () => {
    const copy = insufficientGasCopy();
    expect(copy.title).toBe("Not enough funds for the network fee");
    expect(copy.action).toEqual({ kind: "receive", label: "Deposit" });
  });

  it("always carries an action, so no gas toast is ever a dead end", () => {
    for (const chainId of [5042002, 11155931, 1, undefined]) {
      expect(insufficientGasCopy(chainId).action).toBeDefined();
    }
    expect(
      describeGasShortfall({ chainId: 1, symbol: "ETH", chainName: "Ethereum", testnet: false })
        .action,
    ).toBeDefined();
  });

  it("does not promise a fee it cannot see on a production chain", () => {
    // "costs a fraction of a cent" is true of a testnet and an assumption anywhere else.
    const copy = describeGasShortfall({
      chainId: 1,
      symbol: "ETH",
      chainName: "Ethereum",
      testnet: false,
    });
    expect(copy.description).not.toContain("cent");
    expect(copy.description).not.toContain("free");
  });
});

describe("gasFaucetFor", () => {
  it("names the asset from the chain registry — Arc pays fees in USDC, not ETH", () => {
    // The reason the label is built here rather than at each call site: a caller
    // writing "Get test ETH" would be wrong on the chain most likely to need one.
    const arc = gasFaucetFor(5042002);
    expect(arc?.label).toBe("Get test USDC");
    expect(arc?.href).toContain("faucet.circle.com");
  });

  it("resolves RISE to its own faucet and asset", () => {
    const rise = gasFaucetFor(11155931);
    expect(rise?.label).toBe("Get test ETH");
    expect(rise?.href).toContain("riselabs");
  });

  it("returns null for a chain this build does not carry", () => {
    // Not a throw and not a guess: a sheet with no faucet button is correct for a
    // chain we know nothing about.
    expect(gasFaucetFor(999999)).toBeNull();
  });

  it("returns null when no chain is known", () => {
    expect(gasFaucetFor(undefined)).toBeNull();
  });

  it("returns null for mainnet — a faucet is a testnet concept", () => {
    // Nothing hands anybody the gas asset on a production chain, so a button
    // there would link to a page that cannot help.
    expect(gasFaucetFor(1)).toBeNull();
  });
});
