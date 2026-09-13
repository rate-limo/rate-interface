/**
 * Binary space-partition layout tree for the trading workspace.
 *
 * The layout is a tree, not a set of coordinates: a `panel` leaf names one
 * component, a `split` branch divides its box into two children along one
 * axis at a ratio. Rendering walks the tree to produce a flat
 * `Map<id, Box>`; interactions (resize, drag) manipulate the tree and let
 * the coordinates fall out of the next walk. See the plan artifact for why
 * the flat, identity-preserving render is load-bearing.
 *
 * Everything here is pure and framework-free so it can be unit tested and
 * reasoned about without React. Trees are treated as immutable: mutating
 * operations return a new tree.
 */

export type PanelId = string;
export type Axis = "row" | "col"; // row = side-by-side, col = stacked
export type Edge = "left" | "right" | "top" | "bottom";

export type PanelNode = { kind: "panel"; id: PanelId };
export type SplitNode = {
  kind: "split";
  axis: Axis;
  ratio: number; // 0..1 — fraction of the box given to child `a`
  a: LayoutNode;
  b: LayoutNode;
};
export type LayoutNode = PanelNode | SplitNode;

/** A rectangle in whatever unit the caller passes as the root box (px or %). */
export type Box = { left: number; top: number; width: number; height: number };

/**
 * A divider between a split node's two children, addressed by its path.
 * `handle` is the thin grabbable rect; `container` is the full box being
 * divided, which a resize needs to turn a pointer position into a ratio.
 */
export type Splitter = { path: Path; axis: Axis; handle: Box; container: Box };

/** Address of a node: the sequence of child choices from the root. */
export type Path = ReadonlyArray<"a" | "b">;

export type Layout = {
  panels: Map<PanelId, Box>;
  splitters: Splitter[];
};

export const MIN_RATIO = 0.12;
export const MAX_RATIO = 0.88;
const SERIALIZE_VERSION = 1;

export const panel = (id: PanelId): PanelNode => ({ kind: "panel", id });
export const split = (
  axis: Axis,
  ratio: number,
  a: LayoutNode,
  b: LayoutNode,
): SplitNode => ({ kind: "split", axis, ratio, a, b });

/** All panel ids in the tree, left-to-right / top-to-bottom order. */
export function panelIds(node: LayoutNode): PanelId[] {
  if (node.kind === "panel") return [node.id];
  return [...panelIds(node.a), ...panelIds(node.b)];
}

export function hasPanel(node: LayoutNode, id: PanelId): boolean {
  return panelIds(node).includes(id);
}

/**
 * Walk the tree, turning it into absolute boxes for every panel plus the
 * divider rects for every split. `gap` (in the same unit as `root`) is
 * subtracted around each split so panels don't touch; it doubles as the
 * grabbable thickness of a divider.
 */
export function layout(node: LayoutNode, root: Box, gap = 0): Layout {
  const panels = new Map<PanelId, Box>();
  const splitters: Splitter[] = [];

  const walk = (n: LayoutNode, box: Box, path: Path): void => {
    if (n.kind === "panel") {
      panels.set(n.id, box);
      return;
    }
    const half = gap / 2;
    if (n.axis === "row") {
      const wA = (box.width - gap) * n.ratio;
      const wB = (box.width - gap) * (1 - n.ratio);
      const aBox: Box = { left: box.left, top: box.top, width: wA, height: box.height };
      const bBox: Box = { left: box.left + wA + gap, top: box.top, width: wB, height: box.height };
      splitters.push({
        path,
        axis: "row",
        handle: { left: box.left + wA - half, top: box.top, width: gap, height: box.height },
        container: box,
      });
      walk(n.a, aBox, [...path, "a"]);
      walk(n.b, bBox, [...path, "b"]);
    } else {
      const hA = (box.height - gap) * n.ratio;
      const hB = (box.height - gap) * (1 - n.ratio);
      const aBox: Box = { left: box.left, top: box.top, width: box.width, height: hA };
      const bBox: Box = { left: box.left, top: box.top + hA + gap, width: box.width, height: hB };
      splitters.push({
        path,
        axis: "col",
        handle: { left: box.left, top: box.top + hA - half, width: box.width, height: gap },
        container: box,
      });
      walk(n.a, aBox, [...path, "a"]);
      walk(n.b, bBox, [...path, "b"]);
    }
  };

  walk(node, root, []);
  return { panels, splitters };
}

const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

/** Return a new tree with the split at `path` set to `ratio` (clamped). */
export function setRatio(node: LayoutNode, path: Path, ratio: number): LayoutNode {
  if (path.length === 0) {
    if (node.kind !== "split") return node;
    return { ...node, ratio: clampRatio(ratio) };
  }
  if (node.kind !== "split") return node;
  const [head, ...rest] = path;
  return head === "a"
    ? { ...node, a: setRatio(node.a, rest, ratio) }
    : { ...node, b: setRatio(node.b, rest, ratio) };
}

/**
 * Remove a panel. Its parent split collapses into the surviving sibling, so
 * the tree never keeps a split with a missing child. Returns null if the
 * removed panel was the whole tree.
 */
export function removePanel(node: LayoutNode, id: PanelId): LayoutNode | null {
  if (node.kind === "panel") return node.id === id ? null : node;
  const a = removePanel(node.a, id);
  const b = removePanel(node.b, id);
  if (a === null) return b; // `a` held the panel — promote `b`
  if (b === null) return a;
  return { ...node, a, b };
}

const axisFor = (edge: Edge): Axis =>
  edge === "left" || edge === "right" ? "row" : "col";

/**
 * Insert `id` next to `targetId` along `edge`. left/top place the new panel
 * as child `a`, right/bottom as child `b`. No-ops if the target is absent.
 */
export function insertPanel(
  node: LayoutNode,
  id: PanelId,
  targetId: PanelId,
  edge: Edge,
  ratio = 0.5,
): LayoutNode {
  if (node.kind === "panel") {
    if (node.id !== targetId) return node;
    const fresh = panel(id);
    const before = edge === "left" || edge === "top";
    return before
      ? split(axisFor(edge), ratio, fresh, node)
      : split(axisFor(edge), ratio, node, fresh);
  }
  return {
    ...node,
    a: insertPanel(node.a, id, targetId, edge, ratio),
    b: insertPanel(node.b, id, targetId, edge, ratio),
  };
}

/** Pick a panel up and drop it beside another. A no-op if id === targetId. */
export function movePanel(
  node: LayoutNode,
  id: PanelId,
  targetId: PanelId,
  edge: Edge,
): LayoutNode {
  if (id === targetId) return node;
  const without = removePanel(node, id);
  if (without === null) return node; // can't remove the only panel
  return insertPanel(without, id, targetId, edge);
}

export type SerializedLayout = { version: number; tree: LayoutNode };

export function serialize(tree: LayoutNode): string {
  return JSON.stringify({ version: SERIALIZE_VERSION, tree } satisfies SerializedLayout);
}

function isLayoutNode(x: unknown): x is LayoutNode {
  if (!x || typeof x !== "object") return false;
  const n = x as Record<string, unknown>;
  if (n.kind === "panel") return typeof n.id === "string";
  if (n.kind === "split") {
    return (
      (n.axis === "row" || n.axis === "col") &&
      typeof n.ratio === "number" &&
      isLayoutNode(n.a) &&
      isLayoutNode(n.b)
    );
  }
  return false;
}

/**
 * Parse a persisted layout. Returns null on any mismatch — wrong version,
 * malformed shape, or a panel set that no longer matches the code — so the
 * caller can fall back to the default rather than render a broken tree.
 */
export function deserialize(raw: string, expected: readonly PanelId[]): LayoutNode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { version, tree } = parsed as Partial<SerializedLayout>;
  if (version !== SERIALIZE_VERSION || !isLayoutNode(tree)) return null;

  // The stored tree must cover exactly the panels the app knows about; if
  // panels were added or removed since it was saved, discard it.
  const ids = panelIds(tree).slice().sort();
  const want = expected.slice().sort();
  if (ids.length !== want.length || ids.some((v, i) => v !== want[i])) return null;
  return tree;
}
