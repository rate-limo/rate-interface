import { describe, it, expect } from "vitest";
import {
  panel,
  split,
  layout,
  panelIds,
  setRatio,
  removePanel,
  insertPanel,
  movePanel,
  serialize,
  deserialize,
  MIN_RATIO,
  MAX_RATIO,
  type LayoutNode,
} from "./tree";

const ROOT = { left: 0, top: 0, width: 1000, height: 600 };

// chart | (orderbook / trade)
const sample: LayoutNode = split(
  "row",
  0.6,
  panel("chart"),
  split("col", 0.5, panel("orderbook"), panel("trade")),
);

describe("layout()", () => {
  it("splits a row by ratio into non-overlapping boxes", () => {
    const { panels } = layout(sample, ROOT);
    expect(panels.get("chart")).toEqual({ left: 0, top: 0, width: 600, height: 600 });
    // right column starts where the chart ends, stacked in half
    expect(panels.get("orderbook")).toEqual({ left: 600, top: 0, width: 400, height: 300 });
    expect(panels.get("trade")).toEqual({ left: 600, top: 300, width: 400, height: 300 });
  });

  it("covers the whole root with no gap", () => {
    const { panels } = layout(sample, ROOT);
    const area = [...panels.values()].reduce((s, b) => s + b.width * b.height, 0);
    expect(area).toBe(ROOT.width * ROOT.height);
  });

  it("emits one splitter per split node, carrying its container box", () => {
    const { splitters } = layout(sample, ROOT);
    expect(splitters).toHaveLength(2);
    expect(splitters.map((s) => s.axis).sort()).toEqual(["col", "row"]);
    const rowSplit = splitters.find((s) => s.axis === "row")!;
    expect(rowSplit.container).toEqual(ROOT); // top split divides the whole root
  });

  it("insets panels by the gap so they don't touch", () => {
    const { panels } = layout(split("row", 0.5, panel("a"), panel("b")), ROOT, 10);
    const a = panels.get("a")!;
    const b = panels.get("b")!;
    expect(b.left - (a.left + a.width)).toBe(10);
  });
});

describe("setRatio()", () => {
  it("updates the addressed split and clamps to bounds", () => {
    const wider = setRatio(sample, [], 0.75) as Extract<LayoutNode, { kind: "split" }>;
    expect(wider.ratio).toBe(0.75);
    expect((setRatio(sample, [], 0.99) as any).ratio).toBe(MAX_RATIO);
    expect((setRatio(sample, [], 0.01) as any).ratio).toBe(MIN_RATIO);
  });

  it("reaches a nested split by path without touching the parent", () => {
    const next = setRatio(sample, ["b"], 0.3) as any;
    expect(next.ratio).toBe(0.6); // parent unchanged
    expect(next.b.ratio).toBe(0.3); // child updated
  });
});

describe("removePanel()", () => {
  it("collapses the parent split into the surviving sibling", () => {
    const next = removePanel(sample, "orderbook")!;
    // chart | trade  — the orderbook/trade split is gone
    expect(panelIds(next)).toEqual(["chart", "trade"]);
    expect(next.kind).toBe("split");
  });

  it("returns null when the last panel is removed", () => {
    expect(removePanel(panel("only"), "only")).toBeNull();
  });

  it("leaves the tree untouched for an unknown id", () => {
    expect(panelIds(removePanel(sample, "ghost")!)).toEqual(["chart", "orderbook", "trade"]);
  });
});

describe("insertPanel()", () => {
  it("places a new panel before the target for a left/top edge", () => {
    const next = insertPanel(panel("chart"), "book", "chart", "left");
    expect(next.kind).toBe("split");
    expect(panelIds(next)).toEqual(["book", "chart"]);
    expect((next as any).axis).toBe("row");
  });

  it("places a new panel after the target for a bottom edge, stacked", () => {
    const next = insertPanel(panel("chart"), "book", "chart", "bottom");
    expect(panelIds(next)).toEqual(["chart", "book"]);
    expect((next as any).axis).toBe("col");
  });
});

describe("movePanel()", () => {
  it("relocates a panel and preserves the full panel set", () => {
    const next = movePanel(sample, "trade", "chart", "left");
    expect(panelIds(next).sort()).toEqual(["chart", "orderbook", "trade"]);
    // trade now sits to the left of the chart
    expect(panelIds(next)[0]).toBe("trade");
  });

  it("is a no-op when dropping a panel on itself", () => {
    expect(movePanel(sample, "chart", "chart", "left")).toBe(sample);
  });

  it("never loses a panel across a round of moves", () => {
    let t: LayoutNode = sample;
    t = movePanel(t, "orderbook", "chart", "top");
    t = movePanel(t, "trade", "orderbook", "right");
    t = movePanel(t, "chart", "trade", "bottom");
    expect(panelIds(t).sort()).toEqual(["chart", "orderbook", "trade"]);
  });
});

describe("serialize / deserialize", () => {
  const ids = ["chart", "orderbook", "trade"];

  it("round-trips a tree", () => {
    expect(deserialize(serialize(sample), ids)).toEqual(sample);
  });

  it("rejects a payload whose panel set drifted from the code", () => {
    expect(deserialize(serialize(sample), ["chart", "orderbook"])).toBeNull();
    expect(deserialize(serialize(sample), [...ids, "newpanel"])).toBeNull();
  });

  it("rejects a bad version, malformed JSON, and wrong shapes", () => {
    expect(deserialize(JSON.stringify({ version: 99, tree: sample }), ids)).toBeNull();
    expect(deserialize("{not json", ids)).toBeNull();
    expect(deserialize(JSON.stringify({ version: 1, tree: { kind: "nope" } }), ids)).toBeNull();
  });
});
