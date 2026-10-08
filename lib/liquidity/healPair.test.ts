import { describe, expect, it } from "vitest";
import { healPair } from "./defaultPair";

const RISE = new Set(["ETH", "TITER", "TWALL", "TWPROOF", "USDC"]);
const FALLBACK = { base: "ETH", quote: "USDC" };

describe("healPair", () => {
  it("keeps a pair the chain lists, and reports nothing", () => {
    const r = healPair(RISE, { base: "TITER", quote: "USDC" }, FALLBACK);
    expect(r).toEqual({ base: "TITER", quote: "USDC", healed: [] });
  });

  /**
   * The first paint of any visit that did not deep-link a pair. Both fields are
   * filled from the fallback, and NEITHER is reported: telling someone "we
   * changed TITER to ETH" about a field they never set is worse than silence,
   * and this notice would then fire on essentially every visit.
   */
  it("fills empty fields silently — that is initialisation, not a swap", () => {
    const r = healPair(RISE, { base: "", quote: "" }, FALLBACK);
    expect(r).toEqual({ base: "ETH", quote: "USDC", healed: [] });
  });

  /**
   * The RISE incident, as a test. `?base=TITER&quote=TUSD` became ETH/USDC with
   * no indication, because an unlisted quote priced at 0 and the gateway builds
   * the token list from PRICED pairs only — so TUSD was absent from `known`.
   * The substitution is correct; performing it without saying so is the bug.
   */
  it("reports the symbol it replaced, so the UI can say the pair changed", () => {
    const r = healPair(RISE, { base: "TITER", quote: "TUSD" }, FALLBACK);
    expect(r.base).toBe("TITER");
    expect(r.quote).toBe("USDC");
    expect(r.healed).toEqual([{ asked: "TUSD", got: "USDC" }]);
  });

  it("reports both sides when a chain switch strands the whole pair", () => {
    const r = healPair(RISE, { base: "DONUT", quote: "SKHY" }, FALLBACK);
    expect(r).toEqual({
      base: "ETH",
      quote: "USDC",
      healed: [
        { asked: "DONUT", got: "ETH" },
        { asked: "SKHY", got: "USDC" },
      ],
    });
  });

  /** Symbols are compared exactly; the list is this chain's own spelling. */
  it("does not treat a case variant as listed", () => {
    expect(healPair(RISE, { base: "titer", quote: "USDC" }, FALLBACK).healed).toEqual([
      { asked: "titer", got: "ETH" },
    ]);
  });
});
