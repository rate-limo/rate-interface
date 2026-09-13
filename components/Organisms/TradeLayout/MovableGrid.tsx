"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  layout,
  movePanel,
  setRatio,
  type Box,
  type Edge,
  type LayoutNode,
  type PanelId,
  type Path,
} from "@/lib/layout/tree";
import { edgeAt, previewBox } from "./dropzone";
import { Panel } from "./Panel";
import { cn } from "@/lib/utils";

export type PanelSpec = { title: string; node: React.ReactNode };

const GAP = 10; // px gutter between panels; also the grabbable divider width
const DRAG_THRESHOLD = 6; // px the pointer must travel before a drag begins

type Resizing = { path: Path; axis: "row" | "col"; container: Box };
type Dragging = { id: PanelId; startX: number; startY: number; active: boolean };
type DropTarget = { id: PanelId; edge: Edge };

/**
 * Headless binary-tree layout surface. Given a `tree` and a registry of
 * panels by id, it renders each panel as a flat, absolutely-positioned
 * sibling — never nested in the tree's JSX — so restructuring the tree
 * moves a panel's box without ever remounting it. Resize drags a divider;
 * dragging a panel's title bar rearranges the tree. Every structural change
 * is reported through `onTreeChange`; this component holds no layout state
 * of its own.
 */
export function MovableGrid({
  tree,
  panels,
  onTreeChange,
  className,
}: {
  tree: LayoutNode;
  panels: Record<PanelId, PanelSpec>;
  onTreeChange: (next: LayoutNode) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [resizing, setResizing] = useState<Resizing | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Track the container's pixel size; all boxes are computed against it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const root: Box = { left: 0, top: 0, width: size.width, height: size.height };
  const { panels: boxes, splitters } =
    size.width > 0 ? layout(tree, root, GAP) : { panels: new Map<PanelId, Box>(), splitters: [] };

  const localPoint = (e: PointerEvent | React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // --- resize -------------------------------------------------------------
  const startResize = (e: React.PointerEvent, s: Resizing) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setResizing(s);
  };

  // --- drag ---------------------------------------------------------------
  const startDrag = (e: React.PointerEvent, id: PanelId) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging({ id, startX: e.clientX, startY: e.clientY, active: false });
  };

  const panelUnder = useCallback(
    (x: number, y: number, exclude: PanelId): PanelId | null => {
      for (const [id, b] of boxes) {
        if (id === exclude) continue;
        if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height)
          return id;
      }
      return null;
    },
    [boxes],
  );

  // A single move/up handler pair covers both interactions while active.
  useEffect(() => {
    if (!resizing && !dragging) return;

    const onMove = (e: PointerEvent) => {
      const { x, y } = localPoint(e);
      if (resizing) {
        const c = resizing.container;
        const ratio =
          resizing.axis === "row" ? (x - c.left) / c.width : (y - c.top) / c.height;
        onTreeChange(setRatio(tree, resizing.path, ratio));
        return;
      }
      if (dragging) {
        const moved =
          Math.abs(e.clientX - dragging.startX) + Math.abs(e.clientY - dragging.startY);
        if (!dragging.active && moved < DRAG_THRESHOLD) return;
        if (!dragging.active) setDragging({ ...dragging, active: true });
        const overId = panelUnder(x, y, dragging.id);
        const overBox = overId ? boxes.get(overId) : null;
        const edge = overId && overBox ? edgeAt(overBox, x, y) : null;
        setDropTarget(overId && edge ? { id: overId, edge } : null);
      }
    };

    const onUp = () => {
      if (dragging?.active && dropTarget) {
        onTreeChange(movePanel(tree, dragging.id, dropTarget.id, dropTarget.edge));
      }
      setResizing(null);
      setDragging(null);
      setDropTarget(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizing, dragging, dropTarget, tree, boxes, onTreeChange, panelUnder]);

  const interacting = Boolean(resizing || dragging?.active);
  const preview =
    dropTarget && boxes.get(dropTarget.id)
      ? previewBox(boxes.get(dropTarget.id)!, dropTarget.edge)
      : null;

  return (
    <div ref={ref} className={cn("relative h-full w-full", className)}>
      {/* Panels — flat siblings, positioned by computed box, keyed by id.
          Order in the DOM never changes, so React never remounts them. */}
      {Object.entries(panels).map(([id, spec]) => {
        const b = boxes.get(id);
        if (!b) return null;
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
              transition: interacting
                ? "none"
                : "left .32s cubic-bezier(.2,.7,.2,1), top .32s cubic-bezier(.2,.7,.2,1), width .32s cubic-bezier(.2,.7,.2,1), height .32s cubic-bezier(.2,.7,.2,1)",
            }}
          >
            <Panel
              title={spec.title}
              dragging={dragging?.active && dragging.id === id}
              onDragHandleDown={(e) => startDrag(e, id)}
            >
              {spec.node}
            </Panel>
          </div>
        );
      })}

      {/* Divider handles — one per split node. */}
      {splitters.map((s, i) => (
        <div
          key={i}
          onPointerDown={(e) =>
            startResize(e, { path: s.path, axis: s.axis, container: s.container })
          }
          className={cn(
            "absolute z-10 rounded-full transition-colors hover:bg-purple-400/40",
            s.axis === "row" ? "cursor-col-resize" : "cursor-row-resize",
          )}
          style={{ left: s.handle.left, top: s.handle.top, width: s.handle.width, height: s.handle.height }}
        />
      ))}

      {/* Drop-zone preview while dragging. */}
      {preview && (
        <div
          className="pointer-events-none absolute z-20 rounded-[14px] border-2 border-purple-400 bg-purple-400/15"
          style={{ left: preview.left, top: preview.top, width: preview.width, height: preview.height }}
        />
      )}
    </div>
  );
}
