import { AssetGeneratorABI, LadderBuyerABI } from "@iter/abis";
import { describe, expect, it } from "vitest";
import { decodeOrderSubmitError } from "./orderErrors";
import { exchangeAbi } from "@/components/abis/exchange";

/** Mocks the shape viem actually produces: a ContractFunctionExecutionError
 * whose `.cause` chain contains a ContractFunctionRevertedError with a
 * `.data.errorName`/`.data.args` decoded from the ABI. */
function mockRevertError(errorName: string, args: unknown[] = []) {
  return {
    name: "ContractFunctionExecutionError",
    message: `The contract function reverted with the following reason:\n${errorName}`,
    cause: {
      name: "ContractFunctionRevertedError",
      data: { errorName, args },
      cause: undefined,
    },
  };
}

describe("decodeOrderSubmitError", () => {
  it("recognizes OrderSizeTooSmall and returns an actionable message, not the raw revert text", () => {
    const error = mockRevertError("OrderSizeTooSmall", [BigInt(500000000), BigInt(500000000)]);
    const decoded = decodeOrderSubmitError(error);
    expect(decoded).not.toBeNull();
    expect(decoded?.title).toBe("Order is too small");
    expect(decoded?.description).not.toMatch(/OrderSizeTooSmall/);
  });

  it("recognizes AmountIsZero, PairNotListedYet, and InvalidPair", () => {
    expect(decodeOrderSubmitError(mockRevertError("AmountIsZero"))?.title).toBe(
      "Order amount cannot be zero"
    );
    expect(decodeOrderSubmitError(mockRevertError("PairNotListedYet"))?.title).toBe(
      "Pair not yet listed"
    );
    expect(decodeOrderSubmitError(mockRevertError("InvalidPair"))?.title).toBe(
      "Invalid trading pair"
    );
  });

  it("finds the decoded error at any depth in the cause chain", () => {
    const deeplyNested = {
      name: "TransactionExecutionError",
      cause: {
        name: "ContractFunctionExecutionError",
        cause: mockRevertError("OrderSizeTooSmall").cause,
      },
    };
    expect(decodeOrderSubmitError(deeplyNested)?.title).toBe("Order is too small");
  });

  /**
   * The state a user meets on a coin nobody has made a market in: a market order
   * reverts `InsufficientLiquidity` from OrderPlacementLib. It is declared on
   * MatchingEngine too and carried in ExchangeErrors.json, because viem matches a
   * 4-byte selector against the ABI the call was made with and will not guess -- a
   * message here without that fragment decodes nothing.
   */
  it("recognizes InsufficientLiquidity and points at a limit order rather than a smaller size", () => {
    const decoded = decodeOrderSubmitError(mockRevertError("InsufficientLiquidity"));
    expect(decoded).not.toBeNull();
    expect(decoded?.title).toBe("Nothing to trade against");
    expect(decoded?.description).not.toMatch(/InsufficientLiquidity/);
    // size is not the problem, so the fix must not be "try a smaller amount"
    expect(decoded?.fix).toBe("switch-to-limit");
  });

  it("returns null for an unrecognized custom error (falls back to raw message elsewhere)", () => {
    expect(decodeOrderSubmitError(mockRevertError("SomeOtherError"))).toBeNull();
  });

  it("returns null for a plain error with no decoded contract error (e.g. user rejection)", () => {
    expect(decodeOrderSubmitError(new Error("User rejected the request"))).toBeNull();
  });

  it("returns null for non-error values without throwing", () => {
    expect(decodeOrderSubmitError(null)).toBeNull();
    expect(decodeOrderSubmitError(undefined)).toBeNull();
    expect(decodeOrderSubmitError("a plain string")).toBeNull();
  });

  it("does not infinite-loop on a circular cause chain", () => {
    const circular: { cause?: unknown } = {};
    circular.cause = circular;
    expect(decodeOrderSubmitError(circular)).toBeNull();
  });

  it("names the engine errors the four-entry table used to miss", () => {
    expect(decodeOrderSubmitError(mockRevertError("TooManyMatches"))?.title).toBe(
      "Order crosses too many levels"
    );
    expect(decodeOrderSubmitError(mockRevertError("PairDoesNotExist"))?.title).toBe(
      "Market not found"
    );
  });

  it("names errors thrown BELOW the engine, in Orderbook and ExchangeLinkedList", () => {
    // The reason the ABI merge exists: these selectors are not in
    // MatchingEngine.json, so viem could not name them and the user saw raw hex.
    for (const name of [
      "PriceIsZero",
      "ZeroPrice",
      "NoMatchPrice",
      "PriceOutOfRange",
      "PriceNoneInRange",
      "NoHeadBelow",
      "InvalidAccess",
    ]) {
      expect(decodeOrderSubmitError(mockRevertError(name)), name).not.toBeNull();
    }
  });
});

describe("exchangeAbi", () => {
  const errorNames = new Set(
    (exchangeAbi as { type?: string; name?: string }[])
      .filter((fragment) => fragment.type === "error")
      .map((fragment) => fragment.name)
  );

  it("carries a fragment for every error the decoder claims to know", () => {
    // A message with no fragment is dead copy -- viem matches a 4-byte selector,
    // so a name absent from the ABI the call was made with can never reach the
    // table. This is what catches an entry added to one file and not the other.
    for (const name of [
      "OrderSizeTooSmall",
      "AmountIsZero",
      "PairNotListedYet",
      "InvalidPair",
      "PairDoesNotExist",
      "TooManyMatches",
      "InsufficientGasToMatch",
      "PriceIsZero",
      "ZeroPrice",
      "NoMatchPrice",
      "PriceOutOfRange",
      "PriceNoneInRange",
      "NoHeadBelow",
      "InvalidAccess",
      "OrderCancelFailed",
    ]) {
      expect(errorNames.has(name), `${name} missing from exchangeAbi`).toBe(true);
    }
  });

  it("still carries the engine's functions, so the merge cannot break encoding", () => {
    const functionNames = new Set(
      (exchangeAbi as { type?: string; name?: string }[])
        .filter((fragment) => fragment.type === "function")
        .map((fragment) => fragment.name)
    );
    for (const name of ["limitBuy", "limitSell", "marketBuy", "marketSell", "cancelOrders"]) {
      expect(functionNames.has(name), `${name} missing from exchangeAbi`).toBe(true);
    }
  });
});

describe("failures that carry no decodable error", () => {
  // Empty revert data is what an out-of-gas order returns, so there is no
  // errorName to look up. Before this, `decodeOrderSubmitError` returned null
  // and every caller fell back to `error.message` — which is how raw chain text
  // reached a toast.
  it("names an explicit out-of-gas failure", () => {
    const decoded = decodeOrderSubmitError(new Error("transaction ran out of gas"));
    expect(decoded?.title).toBe("The order ran out of gas");
  });

  it("handles a revert with empty data without claiming a cause it cannot prove", () => {
    const decoded = decodeOrderSubmitError(
      new Error("Execution reverted for an unknown reason."),
    );
    expect(decoded).not.toBeNull();
    expect(decoded?.title).toBe("The exchange rejected the order");
    // An unrecognised custom error looks identical from here, so the copy must
    // not assert out-of-gas as fact.
    expect(decoded?.description).not.toMatch(/ran out of gas/);
  });

  it("reads the wording out of a nested cause, as viem nests it", () => {
    const inner = new Error("out of gas");
    const outer = new Error("Transaction failed") as Error & { cause?: unknown };
    outer.cause = inner;
    expect(decodeOrderSubmitError(outer)?.title).toBe("The order ran out of gas");
  });

  it("still returns null when nothing is recognisable", () => {
    expect(decodeOrderSubmitError(new Error("User rejected the request"))).toBeNull();
  });

  it("prefers a decoded contract error over the text heuristics", () => {
    const err = { data: { errorName: "OrderSizeTooSmall", args: [] }, message: "out of gas" };
    expect(decodeOrderSubmitError(err)?.title).toBe("Order is too small");
  });
});

describe("TransferHelper's short require strings", () => {
  // Not custom errors, so they carry no errorName and the table above cannot see
  // them. They must still never reach a trader as three characters.
  it("names TFF without telling the user to approve when that may not be it", () => {
    const decoded = decodeOrderSubmitError(
      new Error('The contract function "limitBuy" reverted with the following reason:\nTFF'),
    );
    expect(decoded?.title).toBe("The exchange could not take that token");
  });

  it("distinguishes TF, AF and ETF from TFF", () => {
    const of = (r: string) =>
      decodeOrderSubmitError(new Error(`reverted with the following reason:\n${r}`))?.title;
    expect(of("TF")).toBe("The exchange could not send that token");
    expect(of("AF")).toBe("The approval failed");
    expect(of("ETF")).toBe("The refund could not be sent");
  });

  it("still prefers a decoded custom error over a string match", () => {
    const err = { data: { errorName: "OrderSizeTooSmall", args: [] }, message: "TFF" };
    expect(decodeOrderSubmitError(err)?.title).toBe("Order is too small");
  });
});

describe("AssetGenerator reverts", () => {
  const names = [
    "DevBuyTooSmall",
    "DevBuyTooLarge",
    "ListingPriceTooLow",
    "NoBandPool",
    "InsufficientFee",
    "QuoteNotEnabled",
    "PairAlreadyListed",
    "InvalidVolatility",
    "FeeOutsidePairRange",
    "FeeAboveCreatorCap",
    "LadderNotFilled",
    "GraduationNotReady",
    "AlreadyGraduated",
    "NotGraduated",
    "NothingToRelease",
    "NotVesting",
    "NotTheCreator",
    "NotTheLister",
    "BandCallNotAllowed",
    "CreatorFeeControlLocked",
    "EmptyMetadata",
    "SupplyIsZero",
    "CoinNotLaunched",
    "RefundFailed",
    "InvalidRecipient",
  ];
  it("decodes every one to a sentence", () => {
    for (const name of names) expect(decodeOrderSubmitError(mockRevertError(name)), name).not.toBeNull();
  });
  it("has a fragment in the ABI the launch and listPair calls use", () => {
    const declared = new Set(
      (AssetGeneratorABI as readonly { type?: string; name?: string }[])
        .filter((f) => f.type === "error")
        .map((f) => f.name),
    );
    for (const name of names) expect(declared.has(name), `${name} missing from AssetGeneratorABI`).toBe(true);
  });
});

describe("LadderBuyer reverts", () => {
  // Every error LadderBuyer declares, each with its own sentence -- an unknown name
  // decodes to null, which is what makes a caller print the raw revert at the user.
  const names = [
    "DeadlinePassed",
    "InsufficientOutput",
    "ZeroAmount",
    "NativeLegUnsupported",
    "InvalidRecipient",
    "NoMarket",
    "NoWrappedNative",
    "NotCanonicalWrapper",
    "UnexpectedNative",
    "NativeTransferFailed",
  ];
  it("decodes every one to a sentence", () => {
    for (const name of names) expect(decodeOrderSubmitError(mockRevertError(name)), name).not.toBeNull();
  });
  it("covers every error LadderBuyer declares, each with a fragment", () => {
    const declared = (LadderBuyerABI as readonly { type?: string; name?: string }[])
      .filter((f) => f.type === "error")
      .map((f) => f.name);
    // ReentrancyGuard's own error is a contract fault, not something a user can act on.
    expect(declared.filter((n) => n !== "ReentrancyGuardReentrantCall" && !n?.startsWith("SafeERC20")).sort()).toEqual([...names].sort());
  });
});
