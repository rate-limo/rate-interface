import { describe, expect, it } from "vitest";
import { arrivalsOf, mergeArrivals, ARRIVAL_CAP, MAX_LIVE_ROWS } from "./arrivals";

describe("arrivalsOf", () => {
  it("animates nothing on a list that has never rendered", () => {
    // Every id is new on first paint. Animating them is an entrance for the
    // page, not for a launch, and the page did not just happen.
    expect(arrivalsOf(null, ["a", "b", "c"]).size).toBe(0);
  });

  it("finds the coin a refetch brought back that was not there before", () => {
    expect([...arrivalsOf(new Set(["a", "b"]), ["c", "a", "b"]).keys()]).toEqual(["c"]);
  });

  it("orders a batch for the stagger, in the order the list renders them", () => {
    expect([...arrivalsOf(new Set(["z"]), ["a", "b", "z"]).entries()]).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("caps the batch — forty at once is a fault, not a sequence", () => {
    const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
    // With an anchor at the end, all forty landed in front of something the
    // reader was already looking at, so they are arrivals — and capped.
    expect(arrivalsOf(new Set(["anchor"]), [...many, "anchor"]).size).toBe(ARRIVAL_CAP);
  });

  it("animates nothing when the list had nothing to anchor against", () => {
    // An empty `seen` is the first page of DATA landing under an empty state,
    // not forty deployments. Same call as the first paint above.
    const many = Array.from({ length: 40 }, (_, i) => `t${i}`);
    expect(arrivalsOf(new Set(), many).size).toBe(0);
  });

  it("answers nothing when a refetch changed no membership", () => {
    // The common case by far: the query re-runs on focus and returns the same
    // coins. Re-animating them would make focusing the tab a light show.
    expect(arrivalsOf(new Set(["a", "b"]), ["b", "a"]).size).toBe(0);
  });

  it("does not re-announce a coin that only moved position", () => {
    // Ranked views reorder constantly; a rank change is not an arrival.
    expect(arrivalsOf(new Set(["a", "b", "c"]), ["c", "b", "a"]).size).toBe(0);
  });
});

describe("pagination is not arrival", () => {
  it("ignores a page appended to the end of the list", () => {
    // `fetchNextPage` adds ids behind everything already rendered. Animating
    // them means twenty coins announce themselves because the reader scrolled.
    const seen = new Set(["a", "b", "c"]);
    expect(arrivalsOf(seen, ["a", "b", "c", "p1", "p2", "p3"]).size).toBe(0);
  });

  it("still catches a coin inserted at the head while paging", () => {
    const seen = new Set(["a", "b"]);
    expect([...arrivalsOf(seen, ["new", "a", "b", "p1"]).keys()]).toEqual(["new"]);
  });

  it("counts a coin landing mid-list, which a ranked view can do", () => {
    const seen = new Set(["a", "b"]);
    expect([...arrivalsOf(seen, ["a", "mid", "b"]).keys()]).toEqual(["mid"]);
  });
});

describe("the tab switch", () => {
  it("is navigation, not an arrival", () => {
    // `useArrivals` forgets on a reset key change, which lands here as a null
    // `seen`. Without it, every card on the tab you moved to would claim to
    // have just been deployed.
    expect(arrivalsOf(null, ["fresh-tab-1", "fresh-tab-2"]).size).toBe(0);
  });
});

describe("mergeArrivals — the bound that stops a busy chain eating the tab", () => {
  const row = (id: string) => ({ id });

  it("caps the list however many are pushed", () => {
    // The shape of the failure this exists for: nothing on the wire limits how
    // many coins are minted, and every row holds a mesh canvas.
    let list: readonly { id: string }[] = [];
    for (let i = 0; i < 10_000; i += 1) list = mergeArrivals(list, [row(`coin-${i}`)]);
    expect(list.length).toBe(MAX_LIVE_ROWS);
  });

  it("keeps the newest and drops the oldest", () => {
    let list: readonly { id: string }[] = [];
    for (let i = 0; i < MAX_LIVE_ROWS + 50; i += 1) list = mergeArrivals(list, [row(`c${i}`)]);
    expect(list[0]!.id).toBe(`c${MAX_LIVE_ROWS + 49}`);
    expect(list.some((r) => r.id === "c0")).toBe(false);
  });

  it("returns the SAME array when the frame carried nothing new", () => {
    // A duplicate delivery or a reconnect replay must not mint a new reference:
    // that re-renders every card and restarts every mesh canvas.
    const list = [row("a"), row("b")];
    expect(mergeArrivals(list, [])).toBe(list);
    expect(mergeArrivals(list, [row("a")])).toBe(list);
    expect(mergeArrivals(list, [row("a"), row("b")])).toBe(list);
  });

  it("dedupes within one batch as well as against the list", () => {
    const merged = mergeArrivals([row("a")], [row("x"), row("x"), row("a")]);
    expect(merged.map((r) => r.id)).toEqual(["x", "a"]);
  });

  it("puts a burst in front, newest batch first", () => {
    expect(mergeArrivals([row("old")], [row("n1"), row("n2")]).map((r) => r.id))
      .toEqual(["n1", "n2", "old"]);
  });
});

describe("arrivalsOf stays bounded under a flood", () => {
  it("never marks more than the cap, whatever lands", () => {
    const seen = new Set(["anchor"]);
    const flood = Array.from({ length: 5_000 }, (_, i) => `f${i}`);
    expect(arrivalsOf(seen, [...flood, "anchor"]).size).toBe(ARRIVAL_CAP);
  });
});
