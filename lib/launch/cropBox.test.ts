import { describe, expect, it } from "vitest";
import { clampBox, initialBox, MIN_SIDE, moveBox, resizeFromCorner, scaleBox } from "./cropBox";

const W = 3840;
const H = 1648;

describe("initialBox", () => {
  it("is the largest centred square", () => {
    expect(initialBox(W, H)).toEqual({ x: 1096, y: 0, side: 1648 });
    expect(initialBox(1024, 1024)).toEqual({ x: 0, y: 0, side: 1024 });
  });
});

describe("moveBox", () => {
  it("moves by the dragged amount and stops at the edges", () => {
    const box = { x: 1000, y: 200, side: 800 };
    expect(moveBox(box, 100, -50, W, H)).toEqual({ x: 1100, y: 150, side: 800 });
    expect(moveBox(box, -5000, 5000, W, H)).toEqual({ x: 0, y: H - 800, side: 800 });
  });
});

describe("resizeFromCorner", () => {
  const box = { x: 1000, y: 400, side: 800 }; // spans 1000..1800 × 400..1200

  it("pins the opposite corner and stays square", () => {
    // Drag the south-east corner out by 200 across: the north-west stays put.
    expect(resizeFromCorner(box, "se", 2000, 1250, W, H)).toEqual({ x: 1000, y: 400, side: 1000 });
    // North-west corner pulled in: the south-east (1800, 1200) stays put, and the
    // side follows the axis the pointer is farther along (550 down, not 500 across).
    expect(resizeFromCorner(box, "nw", 1300, 650, W, H)).toEqual({ x: 1250, y: 650, side: 550 });
  });

  it("cannot grow past the image or shrink below the minimum", () => {
    // Room below the pinned top edge is 1648 - 400 = 1248.
    expect(resizeFromCorner(box, "se", 9000, 9000, W, H).side).toBe(1248);
    expect(resizeFromCorner(box, "se", 1001, 401, W, H).side).toBe(MIN_SIDE);
  });
});

describe("scaleBox", () => {
  it("scales about the centre", () => {
    const next = scaleBox({ x: 1000, y: 400, side: 800 }, 0.5, W, H);
    expect(next).toEqual({ x: 1200, y: 600, side: 400 });
  });

  it("never exceeds the short edge, and slides back inside when it would spill", () => {
    const next = scaleBox({ x: 0, y: 0, side: 800 }, 3, W, H);
    expect(next.side).toBe(H);
    expect(next.x).toBeGreaterThanOrEqual(0);
    expect(next.y).toBe(0);
  });
});

describe("clampBox", () => {
  it("lets a tiny image keep all of itself", () => {
    expect(clampBox({ x: 0, y: 0, side: 10 }, 64, 64)).toEqual({ x: 0, y: 0, side: 64 });
  });
});
