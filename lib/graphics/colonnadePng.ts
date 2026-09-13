/**
 * The depth colonnade, encoded as a PNG for surfaces that have no canvas.
 *
 * `DepthColonnade` paints `rasterizeColonnade`'s buffer straight onto a canvas
 * with `putImageData`. An Open Graph card cannot: `ImageResponse` runs Satori,
 * which lays out a subset of CSS and has no 2D context, no `<canvas>` and no
 * DOM to put one in. The only picture Satori will draw is an `<img>`, so the
 * colonnade has to arrive already encoded.
 *
 * Hence this module: the same pure rasteriser, then a minimal PNG writer. The
 * geometry stays in `depthColonnade.ts` and is not duplicated here — this file
 * knows about bytes, not about columns.
 *
 * ## Why a hand-rolled encoder rather than a dependency
 *
 * The whole encoder is the four chunks below plus a CRC table. Adding an image
 * library to render a decorative backdrop on one route is a much larger
 * surface than the ~60 lines it replaces, and every candidate either pulls in
 * native bindings (which the Vercel Node runtime has to carry) or is a wrapper
 * around exactly this.
 *
 * ## Colour type 2, not 6
 *
 * The rasteriser emits RGBA and every pixel it writes is fully opaque — the
 * ground is a colour, not transparency. Dropping the alpha channel is a
 * quarter off the pre-compression size for a byte that is always 255.
 */
import { deflateSync } from "node:zlib";
import { rasterizeColonnade, type ColonnadeSpec } from "./depthColonnade";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Standard CRC-32, built once. PNG requires it per chunk. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/**
 * Encode an RGBA buffer as a PNG.
 *
 * Scanlines use filter 1 (Sub), which predicts each byte from the pixel to its
 * left. An ordered dither is horizontally periodic at the matrix width, so Sub
 * turns long runs of the two mass colours into runs of zero and gives deflate
 * something to work with — filter 0 (None) on the same image is materially
 * larger, and this output is base64'd into a data URI where every byte is paid
 * for three times over.
 */
export function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1; // Sub
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 3;
      // Sub predicts from the pixel three bytes back on the same row; the
      // first pixel of a row has no left neighbour and is stored verbatim.
      const left = x === 0 ? [0, 0, 0] : [rgba[src - 4], rgba[src - 3], rgba[src - 2]];
      raw[dst] = (rgba[src] - left[0]) & 0xff;
      raw[dst + 1] = (rgba[src + 1] - left[1]) & 0xff;
      raw[dst + 2] = (rgba[src + 2] - left[2]) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Rasterise a colonnade and return it as a `data:` URI an `<img>` can take.
 *
 * `cell` is device pixels per dither cell, mirroring `CELL_DEVICE_PX` in the
 * component. It defaults to 2 rather than the component's 1 because the two
 * surfaces are judged at different sizes: a hero is read at full width on a
 * retina display, while a share card is a thumbnail in a feed. At cell 1 a
 * 1200x630 card is a 756k-pixel buffer whose base64 lands in the hundreds of
 * kilobytes for grain nobody can see at the size this is actually viewed.
 */
export function colonnadeDataUri(
  spec: Omit<ColonnadeSpec, "width" | "height"> & { width: number; height: number },
  cell = 2,
): string {
  const width = Math.max(1, Math.round(spec.width / cell));
  const height = Math.max(1, Math.round(spec.height / cell));
  const rgba = rasterizeColonnade({ ...spec, width, height });
  return `data:image/png;base64,${encodePng(rgba, width, height).toString("base64")}`;
}
