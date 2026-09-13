import { describe, it, expect } from "vitest";
import { edgeAt, previewBox } from "./dropzone";

const BOX = { left: 0, top: 0, width: 400, height: 200 };

describe("edgeAt()", () => {
  it("returns the wedge the pointer sits in", () => {
    expect(edgeAt(BOX, 20, 100)).toBe("left"); // far left, vertically centred
    expect(edgeAt(BOX, 380, 100)).toBe("right");
    expect(edgeAt(BOX, 200, 10)).toBe("top");
    expect(edgeAt(BOX, 200, 190)).toBe("bottom");
  });

  it("has a dead zone at the centre", () => {
    expect(edgeAt(BOX, 200, 100)).toBeNull();
  });

  it("respects the box offset", () => {
    const offset = { left: 100, top: 100, width: 200, height: 200 };
    expect(edgeAt(offset, 110, 200)).toBe("left");
    expect(edgeAt(offset, 200, 110)).toBe("top");
  });
});

describe("previewBox()", () => {
  it("halves the box toward the chosen edge", () => {
    expect(previewBox(BOX, "left")).toEqual({ left: 0, top: 0, width: 200, height: 200 });
    expect(previewBox(BOX, "right")).toEqual({ left: 200, top: 0, width: 200, height: 200 });
    expect(previewBox(BOX, "top")).toEqual({ left: 0, top: 0, width: 400, height: 100 });
    expect(previewBox(BOX, "bottom")).toEqual({ left: 0, top: 100, width: 400, height: 100 });
  });
});
