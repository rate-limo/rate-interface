/**
 * The encoder has to produce a file a DECODER accepts, which is not something
 * eyeballing the bytes establishes. Every assertion here is either a structural
 * rule from the PNG spec or a round trip back through `inflateSync`.
 */
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { colonnadeDataUri, encodePng } from "./colonnadePng";
import { ornamentProfile } from "./depthColonnade";

const GROUND = [13, 15, 18] as const;
const BID = [63, 167, 106] as const;
const ASK = [76, 141, 255] as const;

function solid(width: number, height: number, rgb: readonly number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Walk the chunk list the way a decoder does, rather than trusting offsets. */
function chunks(png: Buffer): { type: string; data: Buffer }[] {
  const out: { type: string; data: Buffer }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("ascii");
    out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

describe("encodePng", () => {
  it("writes the PNG signature", () => {
    const png = encodePng(solid(4, 4, GROUND), 4, 4);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("writes IHDR, IDAT and IEND, in that order", () => {
    const found = chunks(encodePng(solid(8, 6, GROUND), 8, 6)).map((c) => c.type);
    expect(found).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("declares the dimensions and colour type it actually wrote", () => {
    const [ihdr] = chunks(encodePng(solid(17, 9, GROUND), 17, 9));
    expect(ihdr.data.readUInt32BE(0)).toBe(17);
    expect(ihdr.data.readUInt32BE(4)).toBe(9);
    expect(ihdr.data[8]).toBe(8); // bit depth
    expect(ihdr.data[9]).toBe(2); // truecolour, no alpha
    expect(ihdr.data[12]).toBe(0); // not interlaced
  });

  it("round-trips the pixels back through inflate", () => {
    // A single row of three known colours, so the Sub filter has a real
    // left-neighbour to undo rather than a field of one value.
    const rgba = new Uint8ClampedArray([
      ...GROUND, 255,
      ...BID, 255,
      ...ASK, 255,
    ]);
    const idat = chunks(encodePng(rgba, 3, 1)).find((c) => c.type === "IDAT")!;
    const raw = inflateSync(idat.data);

    expect(raw[0]).toBe(1); // filter byte: Sub
    // Undo Sub: each byte is stored as a difference from three bytes back.
    const recovered: number[] = [];
    for (let i = 0; i < 9; i++) {
      const left = i < 3 ? 0 : recovered[i - 3];
      recovered.push((raw[1 + i] + left) & 0xff);
    }
    expect(recovered).toEqual([...GROUND, ...BID, ...ASK]);
  });

  it("emits one filter byte per row and three bytes per pixel", () => {
    const idat = chunks(encodePng(solid(5, 4, BID), 5, 4)).find((c) => c.type === "IDAT")!;
    expect(inflateSync(idat.data).length).toBe((5 * 3 + 1) * 4);
  });
});

describe("colonnadeDataUri", () => {
  const spec = {
    width: 1200,
    height: 630,
    columns: ornamentProfile(16),
    ground: GROUND,
    bid: BID,
    ask: ASK,
  };

  it("returns a png data URI", () => {
    expect(colonnadeDataUri(spec)).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  });

  it("divides the buffer by the cell size", () => {
    // Cell 2 on a 1200-wide card is a 600-wide buffer; the IHDR must say so,
    // because Satori scales the decoded image to the box, not the reverse.
    const png = Buffer.from(colonnadeDataUri(spec, 2).split(",")[1], "base64");
    const [ihdr] = chunks(png);
    expect(ihdr.data.readUInt32BE(0)).toBe(600);
    expect(ihdr.data.readUInt32BE(4)).toBe(315);
  });

  it("stays small enough to inline in an OG card", () => {
    // The URI is embedded in the HTML Satori parses, so this is paid for on
    // every render. A ceiling here is what stops a later cell-size change from
    // quietly producing a megabyte of base64.
    expect(colonnadeDataUri(spec, 2).length).toBeLessThan(400_000);
  });

  it("never renders an empty buffer for a degenerate size", () => {
    const png = Buffer.from(colonnadeDataUri({ ...spec, width: 1, height: 1 }, 8).split(",")[1], "base64");
    const [ihdr] = chunks(png);
    expect(ihdr.data.readUInt32BE(0)).toBe(1);
    expect(ihdr.data.readUInt32BE(4)).toBe(1);
  });
});
