import type { Box, Edge } from "@/lib/layout/tree";

/**
 * Which edge of a panel a pointer is over, for drag-to-rearrange.
 *
 * The panel is divided into four triangular wedges meeting at the centre
 * (the diagonals of the box). The wedge the pointer sits in names the edge
 * the dragged panel will dock against — the same geometric drop-zone
 * detection the Toss article describes. A dead zone in the middle means
 * "drop is not yet committed to a side".
 */
export function edgeAt(box: Box, x: number, y: number, deadZone = 0.18): Edge | null {
  // Normalise the pointer to -1..1 within the box, centre at 0.
  const nx = ((x - box.left) / box.width) * 2 - 1;
  const ny = ((y - box.top) / box.height) * 2 - 1;
  if (Math.abs(nx) < deadZone && Math.abs(ny) < deadZone) return null;
  // Farther from centre horizontally than vertically -> left/right wedge.
  if (Math.abs(nx) > Math.abs(ny)) return nx < 0 ? "left" : "right";
  return ny < 0 ? "top" : "bottom";
}

/** The half-box that previews where a panel will land when dropped on `edge`. */
export function previewBox(box: Box, edge: Edge): Box {
  switch (edge) {
    case "left":
      return { ...box, width: box.width / 2 };
    case "right":
      return { left: box.left + box.width / 2, top: box.top, width: box.width / 2, height: box.height };
    case "top":
      return { ...box, height: box.height / 2 };
    case "bottom":
      return { left: box.left, top: box.top + box.height / 2, width: box.width, height: box.height / 2 };
  }
}
