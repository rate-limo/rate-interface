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

/**
 * The gateway's "placing" view, as iter-monorepo-09 documented it and as the
 * route serves it on Tempo: no steps, null prices, nothing sold. Every reader
 * has to branch on the state BEFORE touching those fields, which is what these
 * pin.
 */
const PLACING = {
  state: "placing" as const,
  stepsSold: 0,
  stepsTotal: 5,
  steps: [],
  marketCapQuote: null,
  marketCapUsd: null,
  graduationMarketCap: { quote: 0, usd: null },
  toGraduateQuote: null,
  toGraduateUsd: null,
  progress: 0,
  readyAt: null,
  poolValueQuote: null,
  poolValueUsd: null,
  quote: { address: "0xq", symbol: "PathUSD", decimals: 6 },
};

describe("a placing ladder, through the display", () => {
  it("never claims a step is on offer", async () => {
    const { ladderDisplay } = await import("./ladderView");
    const d = ladderDisplay(PLACING as never, 0);
    expect(d.tone).toBe("placing");
    expect(d.pill).toBe("placing ladder");
    expect(d.headline).toBe("Not for sale yet");
    // The selling branch would have read steps[] and the null caps and produced
    // "— to graduate · last step" for a coin that has never offered one.
    expect(d.headline).not.toMatch(/to graduate/);
    expect(d.detail).not.toMatch(/last step|next step/);
    expect(d.progress).toBe(0);
    expect(d.notches).toEqual([]);
  });
});

describe("a placing ladder, through the status badges", () => {
  it("says placing rather than launching", async () => {
    const { statusBadges } = await import("./statusBadges");
    const badges = statusBadges({ launchedOnIter: true, ladderState: "placing" });
    expect(badges.map((b) => b.label)).toContain("placing ladder");
    // "launching" would invite a buyer to a book with no asks on it.
    expect(badges.map((b) => b.label)).not.toContain("launching");
  });

  it("leaves every other state alone", async () => {
    const { statusBadges } = await import("./statusBadges");
    expect(statusBadges({ launchedOnIter: true, ladderState: "selling" }).map((b) => b.label)).toEqual(["launching"]);
    expect(statusBadges({ launchedOnIter: true, ladderState: "armed" }).map((b) => b.label)).toEqual(["graduating"]);
    expect(statusBadges({ launchedOnIter: true, ladderState: "graduated" }).map((b) => b.label)).toEqual(["graduated"]);
  });
});
