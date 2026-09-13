import { describe, expect, it } from "vitest";
import { BAYER_8, DITHER_LEVELS, contrastRatio, luminance, parseHex } from "./dither";
import {
  colonnadeProfile,
  columnCountFor,
  ornamentProfile,
  rasterizeColonnade,
} from "./depthColonnade";

const GROUND = [0xf2, 0xf0, 0xf0] as const; // --m-background, light
const BID = [0x5e, 0x87, 0x64] as const; // --m-chart-buy, light
const ASK = [0x2e, 0x6d, 0xa4] as const; // --m-primary, light

function render(over: Partial<Parameters<typeof rasterizeColonnade>[0]> = {}) {
  const width = over.width ?? 96;
  const height = over.height ?? 64;
  const columns = over.columns ?? ornamentProfile(12);
  const data = rasterizeColonnade({
    width,
    height,
    columns,
    ground: GROUND,
    bid: BID,
    ask: ASK,
    ...over,
  });
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const isGround = (x: number, y: number) =>
    at(x, y)[0] === GROUND[0] && at(x, y)[1] === GROUND[1] && at(x, y)[2] === GROUND[2];
  /** Share of cells in a row band that took a mass colour. */
  const massShare = (y0: number, y1: number) => {
    let mass = 0;
    let total = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < width; x++) {
        total++;
        if (!isGround(x, y)) mass++;
      }
    return mass / total;
  };
  return { data, width, height, at, isGround, massShare };
}

describe("BAYER_8", () => {
  it("is a real ordered matrix: 64 distinct thresholds, 0..63", () => {
    // The property a hand-typed table silently fails. A transposed pair still
    // renders — it just bands — so nothing else would catch it.
    const flat = BAYER_8.flatMap((row) => [...row]);
    expect(flat).toHaveLength(DITHER_LEVELS);
    expect(new Set(flat).size).toBe(DITHER_LEVELS);
    expect(Math.min(...flat)).toBe(0);
    expect(Math.max(...flat)).toBe(DITHER_LEVELS - 1);
  });
});

describe("parseHex", () => {
  it("reads the hex forms the --m-* tokens actually use", () => {
    expect(parseHex("#F2F0F0")).toEqual([0xf2, 0xf0, 0xf0]);
    expect(parseHex("  #0d0f12 ")).toEqual([0x0d, 0x0f, 0x12]);
    expect(parseHex("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it("returns null rather than a guess for anything else", () => {
    // A token that becomes oklch() or a color-mix() must make the scene render
    // nothing, not render black — black is a plausible colour here and would
    // ship unnoticed.
    expect(parseHex("oklch(0.7 0.1 240)")).toBeNull();
    expect(parseHex("rgb(1,2,3)")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("colonnadeProfile", () => {
  it("accumulates outward from the mid, so the silhouette rises to the wings", () => {
    const side = [{ size: 5 }, { size: 4 }, { size: 3 }, { size: 2 }];
    const p = colonnadeProfile(side, side, 8);
    const mid = (8 - 1) / 2;
    for (let i = 1; i < 4; i++) {
      // Strictly further from the mid must be at least as tall.
      expect(p[3 - i]).toBeGreaterThanOrEqual(p[4 - i]);
      expect(p[4 + i]).toBeGreaterThanOrEqual(p[3 + i]);
    }
    expect(mid).toBe(3.5);
    expect(Math.max(...p)).toBe(1);
  });

  it("leaves a gap for a one-sided book instead of mirroring the other side", () => {
    // A book with no bids is a real market state. Mirroring the asks would draw
    // liquidity that is not there, on a graphic whose whole claim is that it is
    // a chart.
    const p = colonnadeProfile([], [{ size: 5 }, { size: 5 }, { size: 5 }], 6);
    expect(p.slice(0, 3).every((v) => v === 0)).toBe(true);
    expect(p.slice(3).some((v) => v > 0)).toBe(true);
  });

  it("returns a flat profile for an empty book rather than dividing by zero", () => {
    expect(colonnadeProfile([], [], 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(colonnadeProfile([{ size: 0 }], [{ size: 0 }], 4)).toEqual([0, 0, 0, 0]);
  });

  it("ignores a negative size rather than shortening the column below it", () => {
    // Sizes come off the wire as decimal strings; a malformed one must not be
    // able to make a cumulative curve go backwards.
    const p = colonnadeProfile([{ size: 4 }, { size: -9 }], [{ size: 4 }, { size: 1 }], 4);
    expect(p.every((v) => v >= 0)).toBe(true);
    expect(p[0]).toBeGreaterThanOrEqual(p[1]);
  });
});

describe("ornamentProfile", () => {
  it("is deterministic, so a backdrop does not reshuffle between renders or themes", () => {
    expect(ornamentProfile(14)).toEqual(ornamentProfile(14));
  });

  it("is symmetric about the mid and peaks at the wings", () => {
    const p = ornamentProfile(12);
    expect(p[0]).toBeCloseTo(p[p.length - 1], 12);
    expect(p[0]).toBeGreaterThan(p[Math.floor(p.length / 2)]);
    expect(Math.max(...p)).toBeCloseTo(1, 12);
  });
});

describe("rasterizeColonnade", () => {
  it("fills every cell opaquely, so no host ground shows through", () => {
    const { data } = render();
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it("leaves the sky as untouched ground", () => {
    // The top of the frame is above every column, so it must be exactly the
    // page colour — a backdrop that tints the whole section is not a backdrop.
    const { massShare } = render();
    expect(massShare(0, 3)).toBe(0);
  });

  it("puts bid colour left of the mid and ask colour right of it", () => {
    const { data, width, height } = render({ columns: new Array(8).fill(1) });
    const seen = { bid: 0, ask: 0 };
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] === BID[0] && data[i + 1] === BID[1]) seen.bid += x < width / 2 ? 1 : -1000;
        if (data[i] === ASK[0] && data[i + 1] === ASK[1]) seen.ask += x >= width / 2 ? 1 : -1000;
      }
    expect(seen.bid).toBeGreaterThan(0);
    expect(seen.ask).toBeGreaterThan(0);
  });

  it("draws a taller column where the book is deeper", () => {
    // Two columns, one full and one empty: the full one reaches high into the
    // frame and the empty one leaves its slot as sky.
    const { isGround, height, width } = render({ columns: [1, 0], width: 64, height: 64 });
    const quarter = Math.floor(height * 0.25);
    let tallSide = 0;
    let shortSide = 0;
    for (let x = 0; x < width; x++)
      for (let y = quarter; y < height * 0.8; y++)
        if (!isGround(x, y)) (x < width / 2 ? tallSide++ : shortSide++);
    expect(tallSide).toBeGreaterThan(0);
    expect(shortSide).toBe(0);
  });

  /** Coverage of the shaft's core, per cell-column, ignoring its outer edge. */
  function shaftProfile(coverageRange?: readonly [number, number]) {
    const W = 100;
    const H = 160;
    const data = rasterizeColonnade({
      width: W, height: H, columns: [1],
      ground: GROUND, bid: BID, ask: ASK, coverageRange,
    });
    const cov: number[] = [];
    for (let x = 0; x < W; x++) {
      let painted = 0;
      for (let y = 70; y < 120; y++) if (data[(y * W + x) * 4] !== GROUND[0]) painted++;
      cov.push(painted / 50);
    }
    // Trim the silhouette's outer cells: there the shaft only partly covers the
    // sampled rows, so the ratio measures geometry rather than tone.
    const inside = cov.map((v, i) => [v, i] as const).filter(([v]) => v > 0).map(([, i]) => i);
    return cov.slice(inside[0] + 3, inside[inside.length - 1] - 2);
  }

  it("leaves no part of a column empty once a coverage floor is set", () => {
    // The complaint this exists for: on a PALE ground an unpainted cell reads as
    // absence, not as shadow, so a shaft's shaded side came out hollow. Measured
    // without a floor it bottomed out at zero — bare paper inside a column.
    expect(Math.min(...shaftProfile())).toBeLessThan(0.15);
    expect(Math.min(...shaftProfile([0.55, 0.95]))).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps the full range available for a dark ground", () => {
    // Not a floor everywhere: on #0D0F12 an unpainted cell IS the shadow, and
    // lifting it would grey out the night. The default stays 0..1.
    expect(Math.min(...shaftProfile())).toBeLessThan(Math.min(...shaftProfile([0.55, 0.95])));
  });

  it("makes the LIT face the dense one, so a column is not hollow", () => {
    // Light comes from the upper left, so the left of each shaft must carry
    // more ink than the right. Inverted, this is exactly backwards and the
    // colonnade looks like it is made of empty outlines.
    const r = render({ columns: [1], width: 80, height: 90 });
    let left = 0;
    let right = 0;
    for (let y = 40; y < 80; y++)
      for (let x = 0; x < 80; x++) {
        if (r.isGround(x, y)) continue;
        if (x < 40) left++;
        else right++;
      }
    expect(left).toBeGreaterThan(right);
  });

  it("radial falloff quiets the centre, which is where the hero puts its copy", () => {
    const columns = new Array(10).fill(1);
    const flat = render({ columns, falloff: "none", width: 120, height: 80 });
    const radial = render({ columns, falloff: "radial", width: 120, height: 80 });
    const centreBand = (r: ReturnType<typeof render>) => {
      let mass = 0;
      let total = 0;
      for (let y = 30; y < 50; y++)
        for (let x = 40; x < 80; x++) {
          total++;
          if (!r.isGround(x, y)) mass++;
        }
      return mass / total;
    };
    expect(centreBand(radial)).toBeLessThan(centreBand(flat));
  });

  it("gain scales coverage down without changing the silhouette", () => {
    const columns = new Array(8).fill(1);
    const full = render({ columns }).massShare(20, 60);
    const haze = render({ columns, gain: 0.4 }).massShare(20, 60);
    expect(haze).toBeLessThan(full);
    expect(haze).toBeGreaterThan(0);
  });

  it("renders identically at any cell size, because geometry is normalised", () => {
    // The property that makes a fine dither possible: doubling the resolution
    // must resolve the SAME scene, not a differently-proportioned one. Compared
    // as coverage of the lower half, which is stable under resampling.
    const columns = ornamentProfile(10);
    const coarse = render({ columns, width: 100, height: 100 }).massShare(50, 100);
    const fine = render({ columns, width: 400, height: 400 }).massShare(200, 400);
    expect(Math.abs(coarse - fine)).toBeLessThan(0.06);
  });

  it("survives a degenerate frame without throwing", () => {
    expect(rasterizeColonnade({
      width: 0, height: 0, columns: [], ground: GROUND, bid: BID, ask: ASK,
    })).toHaveLength(0);
  });
});

describe("luminance", () => {
  it("separates the two Monet grounds, which is the only thing it decides", () => {
    expect(luminance([0xf2, 0xf0, 0xf0])).toBeGreaterThan(0.5);
    expect(luminance([0x0d, 0x0f, 0x12])).toBeLessThan(0.1);
  });
});

describe("columnCountFor", () => {
  it("keeps column proportion constant as a frame gets wider", () => {
    // The bug this exists to prevent: a fixed CSS-pixel slot gave a 1400px hero
    // the same slot as a 600px plate, so the hero read as a picket fence while
    // the plate read as architecture. A wider frame must get MORE columns of
    // the SAME thickness, never the same count stretched or thinner ones.
    const slotOf = (w: number, h: number) => w / columnCountFor(w, h);
    const plate = slotOf(600, 320);
    const hero = slotOf(1400, 320);
    expect(Math.abs(plate - hero)).toBeLessThan(6);
  });

  it("makes a taller frame carry thicker columns", () => {
    // A column's diameter is a ratio of its height; scale has to read.
    const short = 1400 / columnCountFor(1400, 300);
    const tall = 1400 / columnCountFor(1400, 700);
    expect(tall).toBeGreaterThan(short * 1.4);
  });

  it("clamps so a letterbox banner has no threads and a tall frame no slabs", () => {
    expect(1400 / columnCountFor(1400, 90)).toBeGreaterThanOrEqual(40);
    expect(1400 / columnCountFor(1400, 4000)).toBeLessThanOrEqual(180);
  });

  it("never returns fewer than a colonnade's worth", () => {
    expect(columnCountFor(80, 900)).toBeGreaterThanOrEqual(4);
    expect(columnCountFor(0, 0)).toBeGreaterThanOrEqual(4);
  });
});

describe("mass colour contrast", () => {
  /**
   * The --m-graphic-* values, duplicated from globals.css deliberately: this
   * test's job is to fail when someone retunes them, and reading the live value
   * would make it pass by definition.
   */
  const LIGHT_GROUND = parseHex("#F2F0F0")!; //  --m-background
  const DARK_GROUND = parseHex("#0D0F12")!; //   --m-background
  const LIGHT_BID = parseHex("#29A05C")!; //     --m-graphic-bid, dollar green
  const LIGHT_ASK = parseHex("#2D7DE6")!; //     --m-graphic-ask, cobalt
  const DARK_BID = parseHex("#3FA76A")!; //      --m-graphic-bid, lifted
  const DARK_ASK = parseHex("#4C8DFF")!; //      --m-graphic-ask, lifted

  /** Max - min across the channels: a plain stand-in for how vivid a hue is. */
  const chroma = ([r, g, b]: readonly number[]) =>
    (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

  it("stays separable from its ground", () => {
    // Deliberately NOT the 4.5:1 text floor. These paint a large dithered mass,
    // judged on chroma and on how much of it there is; the light pair sits near
    // 3:1 and reads bolder than the 6-8:1 pair it replaced. This floor only
    // catches a colour that would vanish into the page.
    for (const [mass, ground] of [
      [LIGHT_BID, LIGHT_GROUND], [LIGHT_ASK, LIGHT_GROUND],
      [DARK_BID, DARK_GROUND], [DARK_ASK, DARK_GROUND],
    ] as const) {
      expect(contrastRatio(mass, ground)).toBeGreaterThan(2.5);
    }
  });

  it("keeps bid and ask BALANCED within a theme", () => {
    // The regression this exists for: --m-success-fg (5.37:1) beside
    // --m-primary-fg (8.15:1) is a 1.52x spread, and the weaker half of the
    // colonnade looked like a rendering fault next to the stronger one.
    // Compared as a RATIO, not a difference — the same absolute gap matters
    // far more down at 3:1 than it does up at 9:1.
    const spread = (a: typeof LIGHT_BID, b: typeof LIGHT_ASK, g: typeof LIGHT_GROUND) => {
      const [x, y] = [contrastRatio(a, g), contrastRatio(b, g)].sort((p, q) => q - p);
      return x / y;
    };
    expect(spread(LIGHT_BID, LIGHT_ASK, LIGHT_GROUND)).toBeLessThan(1.35);
    expect(spread(DARK_BID, DARK_ASK, DARK_GROUND)).toBeLessThan(1.35);
  });

  it("is vivid, which is the whole reason these leave the Monet ramps", () => {
    // The tokens that DO fit the palette measure .114 (--m-success-700) and
    // .322 (--m-primary-fg). Painted at partial coverage by a dither they read
    // as olive and navy — dim rather than restrained. Anything that replaces
    // these must clear the ramp steps they were chosen over.
    for (const c of [LIGHT_BID, LIGHT_ASK, DARK_BID, DARK_ASK]) {
      expect(chroma(c)).toBeGreaterThan(0.33);
    }
  });
});
