/**
 * What counts as "moved".
 *
 * The rule this replaces flashed whichever price an event named, which is a
 * different question — a level can be touched without its size changing, and a
 * batched flush moves several levels while emitting one event. These cases are
 * the difference between the two.
 */
import { describe, expect, it } from "vitest";
import { changedLevels, levelKey } from "./flash";

const level = (price: string | number, baseLiquidity: string | number) => ({
  price,
  baseLiquidity,
});

describe("changedLevels", () => {
  it("flashes nothing on the FIRST snapshot", () => {
    // Every row is new on mount. Lighting the whole book teaches people to
    // ignore the signal.
    expect(changedLevels(undefined, [level(100, "5"), level(101, "3")]).size).toBe(0);
  });

  it("flashes nothing when nothing moved", () => {
    const book = [level(100, "5"), level(101, "3")];
    expect(changedLevels(book, [...book]).size).toBe(0);
  });

  it("flashes a level whose size changed", () => {
    const changed = changedLevels([level(100, "5")], [level(100, "4")]);
    expect([...changed]).toEqual(["100"]);
  });

  it("flashes EVERY level that moved, not just one", () => {
    // The defect in the version this replaces: it tracked a single price, so a
    // flush that moved four levels lit one. `frameBuffer` batches by design, so
    // multi-level updates are the normal case, not an edge one.
    const before = [level(100, "5"), level(101, "3"), level(102, "7"), level(103, "1")];
    const after = [level(100, "9"), level(101, "3"), level(102, "2"), level(103, "6")];
    expect([...changedLevels(before, after)].sort()).toEqual(["100", "102", "103"]);
  });

  it("flashes a level that appeared and one that vanished", () => {
    // New depth and a fill. Both are what someone is watching the book for.
    const changed = changedLevels([level(100, "5")], [level(101, "2")]);
    expect([...changed].sort()).toEqual(["100", "101"]);
  });

  it("treats a numeric and a string price as the same level", () => {
    // Prices arrive as both depending on the source; `"100"` and `100` are one
    // level, and keying on the raw value would flash every row forever.
    expect(changedLevels([level("100", "5")], [level(100, "5")]).size).toBe(0);
    expect(changedLevels([level("1.50", "5")], [level(1.5, "5")]).size).toBe(0);
  });

  it("compares liquidity as a STRING, so tiny changes still register", () => {
    // These two differ past float64's precision — `Number()` collapses them to
    // the same value, which would silently stop flashing the smallest real
    // moves.
    const a = "1.0000000000000000001";
    const b = "1.0000000000000000002";
    expect(Number(a)).toBe(Number(b));
    expect(changedLevels([level(100, a)], [level(100, b)]).size).toBe(1);
  });

  it("does not care about accumulated liquidity", () => {
    // Only the level's OWN size is compared. Accumulated size changes for every
    // level below one that moved, so diffing it would light half the book on a
    // single fill.
    const before = [{ ...level(100, "5"), accumulatedQuoteLiquidity: "500" }];
    const after = [{ ...level(100, "5"), accumulatedQuoteLiquidity: "900" }];
    expect(changedLevels(before, after).size).toBe(0);
  });

  it("handles an empty book in either direction", () => {
    expect(changedLevels([], []).size).toBe(0);
    expect([...changedLevels([], [level(100, "1")])]).toEqual(["100"]);
    expect([...changedLevels([level(100, "1")], [])]).toEqual(["100"]);
  });
});

describe("levelKey", () => {
  it("normalises equivalent spellings of one price", () => {
    expect(levelKey("100")).toBe(levelKey(100));
    expect(levelKey("1.50")).toBe(levelKey(1.5));
    expect(levelKey("0100")).toBe(levelKey(100));
  });

  it("passes a non-numeric price through rather than collapsing it to NaN", () => {
    // Two unparseable prices must not become the same key and flash together.
    expect(levelKey("abc")).toBe("abc");
    expect(levelKey("abc")).not.toBe(levelKey("def"));
  });
});
