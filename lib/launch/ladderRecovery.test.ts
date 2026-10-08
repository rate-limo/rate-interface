import { describe, expect, it } from "vitest";
import { ladderIsUnplaced, LadderNotPlacedError } from "./ladderRecovery";

const CREATOR = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("ladderIsUnplaced", () => {
  it("is true for a launched coin whose first ask id is still zero", () => {
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)] })).toBe(true);
  });

  it("is false once the ladder is placed: order ids start at 1", () => {
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)] })).toBe(false);
    // The lowest id a real ladder can carry.
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [BigInt(1)] })).toBe(false);
  });

  it("is false for a coin this generator never launched", () => {
    // Offering to place a ladder for a stranger's token would send a transaction
    // that reverts, so a zero creator must never read as pending.
    expect(ladderIsUnplaced({ creator: ZERO, askIds: [BigInt(0)] })).toBe(false);
    expect(ladderIsUnplaced({ creator: undefined, askIds: [BigInt(0)] })).toBe(false);
  });

  it("is false when the ladder could not be read at all", () => {
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: undefined })).toBe(false);
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [] })).toBe(false);
  });

  it("accepts numbers as well as bigints, since the decoder may give either", () => {
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [0] })).toBe(true);
    expect(ladderIsUnplaced({ creator: CREATOR, askIds: [7] })).toBe(false);
  });
});

describe("LadderNotPlacedError", () => {
  it("carries what the recovery needs, not just a sentence", () => {
    const launch = { coinAddress: "0xabc", txHash: "0xdef" };
    const err = new LadderNotPlacedError("0xcoin", "0xpair", "Tempo Testnet", launch);
    expect(err).toBeInstanceOf(Error);
    expect(err.coin).toBe("0xcoin");
    expect(err.pair).toBe("0xpair");
    expect(err.networkName).toBe("Tempo Testnet");
    // The launch succeeded; its receipt is what the success screen renders after
    // the ladder lands, and it is not recoverable later without re-reading logs.
    expect(err.launch).toBe(launch);
  });

  it("does not claim nothing was deployed", () => {
    const err = new LadderNotPlacedError("0xcoin", "0xpair", 1, null);
    expect(err.message).toContain("launched");
    expect(err.message).not.toMatch(/nothing was deployed/i);
  });
});
