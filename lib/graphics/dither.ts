/**
 * Ordered dithering, and the colour plumbing the graphics built on it need.
 *
 * Split out from the scene rasterisers because the matrix is the part that must
 * be RIGHT rather than merely plausible: a hand-typed 8x8 Bayer table looks
 * correct at a glance and produces visible banding where two entries are
 * transposed. Building it by recursive expansion from the 2x2 base makes the
 * property testable — 64 distinct thresholds, 0..63, and no value repeated.
 */

/** An 8-bit RGB triple. */
export type Rgb = readonly [number, number, number];

export const MATRIX_SIZE = 8;
/** Threshold levels in the matrix; also the number of representable tones. */
export const DITHER_LEVELS = MATRIX_SIZE * MATRIX_SIZE;

/**
 * The 8x8 ordered (Bayer) threshold matrix.
 *
 * Each step doubles the previous matrix, scaling its values by 4 and offsetting
 * the three copies by 2/3/1 — the standard recurrence. Frozen because it is
 * shared by every rasteriser in this directory and a mutation would be a
 * whole-page rendering bug with no error attached to it.
 */
export const BAYER_8: readonly (readonly number[])[] = (() => {
  let m: number[][] = [
    [0, 2],
    [3, 1],
  ];
  for (let size = 2; size < MATRIX_SIZE; size *= 2) {
    const next: number[][] = Array.from({ length: size * 2 }, () =>
      new Array<number>(size * 2).fill(0),
    );
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + size] = v + 2;
        next[y + size][x] = v + 3;
        next[y + size][x + size] = v + 1;
      }
    }
    m = next;
  }
  return m.map((row) => Object.freeze(row.slice()));
})();

/**
 * Does this cell take the mass colour?
 *
 * `coverage` is the fraction of the mass colour a region should receive, NOT a
 * darkness — see `Palette.invert` for why the two part company between themes.
 */
export function isMass(coverage: number, x: number, y: number): boolean {
  return coverage * (DITHER_LEVELS - 1) > BAYER_8[y % MATRIX_SIZE][x % MATRIX_SIZE];
}

/**
 * Parse a CSS colour that came out of a `--m-*` token.
 *
 * Deliberately narrow: these values are read straight from `globals.css`, where
 * every one of them is a hex literal. Returns null rather than a guess for
 * anything else, so a caller that starts receiving `oklch()` or a colour-mix
 * result finds out by rendering nothing instead of by rendering black.
 */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    return parseHex(`${r}${r}${g}${g}${b}${b}`);
  }
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ] as const;
}

/**
 * Relative luminance, WCAG formula. Used for exactly one decision — whether the
 * ground is dark — so that a scene can invert its coverage without being told
 * which theme it is in. Asking the colour is what keeps these graphics working
 * if a third theme ever lands.
 */
export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * WCAG contrast ratio between two colours.
 *
 * Here it governs the MASS colour against its own ground, not text. A dither
 * renders colour at partial coverage, so the mass needs a stronger ratio than
 * body text would — a mid-tone that reads fine as a solid fill dissolves into a
 * grey haze once only half its cells are painted. `depthColonnade.test.ts`
 * pins the floor for the tokens the colonnade actually uses.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
