/**
 * The square a creator keeps from their image, in SOURCE pixels.
 *
 * The cropper shows the whole image with this square on top: drag inside it to
 * move, pull a corner to resize, pinch or scroll to scale. The overlay is drawn
 * from this box and the exported file is cut from this box, so what is framed
 * is what is saved — there is no second calculation to drift from the first.
 *
 * (It replaced a fixed frame with the picture moving underneath, driven by zoom
 * and position sliders. That model hid everything outside the frame, and its
 * preview disagreed with its export past zoom 1.)
 */
export interface CropBox {
  x: number;
  y: number;
  side: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";

/** Smallest square a creator may keep: below this the 512px export is mostly upscaling. */
export const MIN_SIDE = 128;

export function minSide(width: number, height: number): number {
  return Math.min(MIN_SIDE, width, height);
}

/** The largest centred square: a crop that changes nothing a square image did not already have. */
export function initialBox(width: number, height: number): CropBox {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/** Keep the side within [minSide, the image's short edge] and the box inside the image. */
export function clampBox(box: CropBox, width: number, height: number): CropBox {
  const side = clamp(box.side, minSide(width, height), Math.min(width, height));
  return { side, x: clamp(box.x, 0, width - side), y: clamp(box.y, 0, height - side) };
}

export function moveBox(box: CropBox, dx: number, dy: number, width: number, height: number): CropBox {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy }, width, height);
}

/**
 * Resize by dragging `corner` to (px, py), with the OPPOSITE corner pinned.
 * The box stays square: the side follows whichever axis the pointer moved
 * further along, capped by the room between the pinned corner and the edges.
 */
export function resizeFromCorner(
  box: CropBox,
  corner: Corner,
  px: number,
  py: number,
  width: number,
  height: number,
): CropBox {
  const east = corner === "ne" || corner === "se";
  const south = corner === "sw" || corner === "se";
  const ax = east ? box.x : box.x + box.side;
  const ay = south ? box.y : box.y + box.side;
  const roomX = east ? width - ax : ax;
  const roomY = south ? height - ay : ay;
  const wanted = Math.max(east ? px - ax : ax - px, south ? py - ay : ay - py);
  const side = clamp(wanted, minSide(width, height), Math.min(roomX, roomY));
  return { side, x: east ? ax : ax - side, y: south ? ay : ay - side };
}

/** Scale about the box's centre (wheel, pinch, + / −), then keep it in bounds. */
export function scaleBox(box: CropBox, factor: number, width: number, height: number): CropBox {
  const cx = box.x + box.side / 2;
  const cy = box.y + box.side / 2;
  const side = clamp(box.side * factor, minSide(width, height), Math.min(width, height));
  return clampBox({ side, x: cx - side / 2, y: cy - side / 2 }, width, height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
