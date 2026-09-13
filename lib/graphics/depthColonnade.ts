import { DITHER_LEVELS, BAYER_8, MATRIX_SIZE, clamp01, type Rgb } from "./dither";

/**
 * "Depth, as a colonnade" — the venue's cumulative order-book depth drawn as a
 * row of classical columns and resolved with an ordered dither.
 *
 * ## Why this shape and not an ornament
 *
 * The column HEIGHTS are a cumulative depth profile: bids accumulating leftward
 * from the mid, asks rightward. So the graphic is a real chart before it is
 * decoration, and it is the one motif of the set that could not be dropped onto
 * another product's page. That distinction is the whole reason this direction
 * was chosen over an arcade or a dome, both of which are only atmosphere.
 *
 * It also means the honesty rule this file cares about: `columns` is REQUIRED
 * and has no default. A caller with no book must pass `ornamentProfile()` and
 * is thereby saying, in the call itself, that the shape is illustrative. A
 * default would let a synthetic silhouette be rendered beside real numbers with
 * nothing at the call site to show it was invented — the same failure the
 * portfolio's `Est` markers exist to prevent.
 *
 * ## One pattern, two palettes
 *
 * `shade` inside the rasteriser is DARKNESS under a light at 135 degrees, and
 * what reaches the dither is always its complement — BRIGHTNESS. So the lit
 * face of every drum is the DENSE part of the pattern in both themes, and the
 * only thing that changes between light and dark is which two colours the
 * cells are painted in.
 *
 * This deliberately reverses an earlier design that flipped coverage with the
 * ground, on the theory that ink on paper and lit stone at night are opposites.
 * They are, photographically — but the flip empties the lit face of every
 * column on the pale ground, and a column rendered at five percent coverage
 * reads as an outline of a column rather than a column. Density carries the
 * form here; the palette only carries the mood. Keeping the pattern fixed is
 * also what makes the two themes recognisably the same graphic.
 *
 * ## Resolution
 *
 * Everything geometric is expressed as a fraction of width or height, never in
 * cells, so the same scene resolves correctly at any cell size. That is what
 * makes a fine dither possible: at one cell per device pixel a detail sized in
 * whole cells — a step riser, a capital — collapses to a hairline or vanishes.
 */

export interface ColonnadeSpec {
  /** Buffer width, in dither cells. */
  width: number;
  /** Buffer height, in dither cells. */
  height: number;
  /**
   * Normalised column heights in 0..1, left to right. Length is the column
   * count. Required — see the note above about illustrative shapes.
   */
  columns: readonly number[];
  /** Page ground. Pixels that are not stone take this colour exactly. */
  ground: Rgb;
  /** Mass colour left of the mid (bids). */
  bid: Rgb;
  /** Mass colour right of the mid (asks). */
  ask: Rgb;
  /**
   * Overall coverage multiplier, 0..1. Below 1 the colonnade becomes a haze —
   * which is what makes it usable behind body copy.
   */
  gain?: number;
  /**
   * The band of coverage the tone scale is mapped into, as [floor, ceiling].
   *
   * Defaults to the full 0..1, which is right on a DARK ground: an unpainted
   * cell there is near-black, so the sparse end reads as shadow. On a PALE
   * ground the same cell is near-white and reads as absence, so a column's
   * shaded side comes out looking hollow rather than turned away from the
   * light. Measured on the light palette before this existed, a shaft ran 1.00
   * coverage across its lit third — flat colour, no dither left — and 0.02 on
   * its shaded third, which is bare paper.
   *
   * So the pale ground gets a floor AND a ceiling: a floor so nothing is empty,
   * a ceiling so nothing goes solid and loses the grain the whole direction is
   * built on. This is the one place the two themes genuinely differ, and it is
   * a property of the substrate rather than of the palette.
   */
  coverageRange?: readonly [number, number];
  /**
   * `radial` quiets the centre, where a centred hero puts its headline and
   * card. This is the scrim, computed rather than laid on top: the contrast
   * behind the copy becomes a number that can be tuned instead of a gradient
   * fighting a photograph.
   */
  falloff?: "none" | "radial";
}

/** Ground line: everything above this fraction of the height is open sky. */
const STYLOBATE_TOP = 0.9;
/**
 * Ceiling for the tallest column's SHAFT. Deliberately low enough that the
 * capital above it still fits inside the frame — a cropped capital is the
 * detail that made the first version read as a bar chart with texture.
 */
const COLUMN_CEILING = 0.13;

/*
 * The order below is the classical one, read downward: abacus, echinus and
 * necking make the capital; torus and plinth make the base. Heights are
 * fractions of the FRAME, not of the column, because a capital is a fixed size
 * in a building — a short column and a tall one carry the same one, and
 * scaling it with height is what makes a colonnade look like a chart.
 */
const ABACUS_H = 0.015;
const ECHINUS_H = 0.021;
const NECK_H = 0.008;
const CAPITAL_H = ABACUS_H + ECHINUS_H + NECK_H;
const TORUS_H = 0.017;
const PLINTH_H = 0.015;
const BASE_H = TORUS_H + PLINTH_H;

/** Shaft radius as a fraction of one column's slot. */
const SHAFT_R = 0.38;
/*
 * Radii as multiples of the shaft's top radius. The abacus at 1.26 puts
 * neighbouring capitals nearly in contact, which is what a dense colonnade
 * actually looks like — and it is the widest anything may go, because
 * 1.26 * 0.38 = 0.479 of a slot, just inside the half-slot that would collide.
 */
const R_ABACUS = 1.26;
const R_ECHINUS = 1.22;
const R_NECK = 0.98;
const R_SHAFT_FOOT = 1.06;
const R_TORUS = 1.16;
const R_PLINTH = 1.24;

/** Flutes visible across the face. Roman shafts carry ~20 around the drum. */
const FLUTES = 9;
const FLUTE_DEPTH = 0.28;
/** Light direction, 135 degrees — from the upper left, as every plate here is. */
const LIGHT_X = -0.66;
const LIGHT_Z = 0.75;

/**
 * Cumulative depth, normalised, as column heights.
 *
 * `bids` must be ordered best-first (descending price) and `asks` best-first
 * (ascending); both are walked outward from the mid, which is where the
 * shallowest columns belong. Sizes are summed, so the profile is monotonic
 * outward by construction and the silhouette can only rise toward the wings.
 *
 * An empty side yields zeros — a gap in the colonnade — rather than being
 * mirrored from the other side. A one-sided book is a real market state and
 * inventing the missing half would draw liquidity that is not there.
 */
export function colonnadeProfile(
  bids: readonly { size: number }[],
  asks: readonly { size: number }[],
  columns: number,
): number[] {
  if (columns <= 0) return [];
  const perSide = Math.floor(columns / 2);
  const cumulate = (levels: readonly { size: number }[]): number[] => {
    const out: number[] = [];
    let acc = 0;
    for (let i = 0; i < perSide; i++) {
      acc += Math.max(0, levels[i]?.size ?? 0);
      out.push(acc);
    }
    return out;
  };
  const bidCum = cumulate(bids);
  const askCum = cumulate(asks);
  const peak = Math.max(bidCum[perSide - 1] ?? 0, askCum[perSide - 1] ?? 0);
  if (peak <= 0) return new Array<number>(columns).fill(0);

  const out: number[] = [];
  for (let i = 0; i < columns; i++) {
    // Distance from the mid, in slots, on each side.
    const mid = (columns - 1) / 2;
    const side = i < mid ? bidCum : askCum;
    const step = Math.min(perSide - 1, Math.floor(Math.abs(i - mid)));
    out.push(step < 0 ? 0 : (side[step] ?? 0) / peak);
  }
  return out;
}

/**
 * How many columns a frame of this size should carry.
 *
 * Derived from the frame's HEIGHT, not its width, and that is the whole point.
 * A classical column's diameter is a ratio of its own height — roughly 1:7 for
 * Doric, 1:10 for Corinthian — so a taller colonnade has thicker columns, and
 * the ratio is what the eye reads as scale.
 *
 * Sizing off width instead makes thickness an accident of how wide the viewport
 * happens to be: a 600px plate and a 1400px hero at one column per 52px produce
 * the same slot in CSS pixels, so the hero simply gets twice as many of them and
 * reads as a picket fence while the plate reads as architecture. Height-derived,
 * a wide frame gets MORE columns of the SAME proportion, which is what a long
 * colonnade actually is.
 *
 * The clamp keeps a letterbox banner from producing threads and a very tall
 * frame from producing pillars too wide to read as a row.
 */
export function columnCountFor(cssWidth: number, cssHeight: number): number {
  const slot = Math.max(56, Math.min(180, cssHeight * 0.17));
  return Math.max(4, Math.round(cssWidth / slot));
}

/**
 * A deterministic stand-in profile, for surfaces with no book to read.
 *
 * Named `ornament` rather than `default` on purpose: a caller reaching for it is
 * stating that the silhouette carries no information. Seeded, so the landing
 * page draws the same colonnade on every render and between the two themes —
 * a backdrop that reshuffles on reload reads as a bug.
 */
export function ornamentProfile(columns: number, seed = 20260908): number[] {
  if (columns <= 0) return [];
  let state = seed >>> 0;
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const perSide = Math.max(1, Math.floor(columns / 2));
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < perSide; i++) {
    acc += 0.3 + rnd() * 1.4;
    cum.push(acc);
  }
  const out: number[] = [];
  const mid = (columns - 1) / 2;
  for (let i = 0; i < columns; i++) {
    const step = Math.min(perSide - 1, Math.floor(Math.abs(i - mid)));
    out.push(cum[step] / acc);
  }
  return out;
}

/**
 * Lambert term for a point across a drum, `u` in -1..1 from its axis.
 *
 * Flutes are spaced evenly in ANGLE around the drum, not evenly across the
 * projection, so they bunch toward the silhouette edges — that crowding is most
 * of what makes a fluted shaft read as round rather than as vertical stripes.
 * Taking `asin(u)` first is what buys it; perturbing `u` directly (the first
 * version of this) spaces them evenly in projection and looks like corrugation.
 */
function drumLambert(u: number, fluteDepth: number): number {
  const phi = Math.asin(Math.max(-1, Math.min(1, u)));
  const perturbed = phi + fluteDepth * Math.cos(2 * FLUTES * phi);
  const dot = Math.sin(perturbed) * LIGHT_X + Math.cos(perturbed) * LIGHT_Z;
  // HALF-lambert, not a clamp at zero. A hard clamp makes the shaded half of
  // the drum uniformly dark, and a uniform region carries no flutes — which is
  // exactly why the first version's shafts read as flat striped bars. Wrapping
  // the term keeps the modulation alive right around to the silhouette edge,
  // which is where flutes crowd and where the eye reads the curve.
  return clamp01((dot + 1) / 2);
}

/**
 * Contact shading at a drum's silhouette, so a lit edge still has an outline.
 * Smoothstepped rather than a threshold — a hard cut at some |u| draws a
 * one-cell line that the dither turns into a dotted seam.
 */
function edgeDarken(u: number): number {
  const t = clamp01((Math.abs(u) - 0.84) / 0.16);
  return 0.2 * t * t * (3 - 2 * t);
}

/** The classical members, top to bottom, with the radius each carries. */
type Member = "abacus" | "echinus" | "neck" | "shaft" | "torus" | "plinth" | "stub";

/**
 * Which member sits at `fromTop` on a column of `height`, and how wide it is.
 *
 * A column too short to carry a capital and a base becomes a `stub` — a broken
 * shaft. That is not a fallback so much as the honest drawing: the far wings of
 * a thin book are genuinely almost nothing, and a ruin is what a colonnade of
 * unequal heights is.
 */
function memberAt(fromTop: number, height: number): { member: Member; r: number; local: number } {
  if (height < CAPITAL_H + BASE_H + 0.015) {
    return { member: "stub", r: R_PLINTH, local: height > 0 ? fromTop / height : 0 };
  }
  if (fromTop < ABACUS_H) {
    return { member: "abacus", r: R_ABACUS, local: fromTop / ABACUS_H };
  }
  if (fromTop < ABACUS_H + ECHINUS_H) {
    const local = (fromTop - ABACUS_H) / ECHINUS_H;
    // Flares outward as it rises, so the capital spreads to meet the abacus.
    return { member: "echinus", r: R_NECK + (R_ECHINUS - R_NECK) * (1 - local), local };
  }
  if (fromTop < CAPITAL_H) {
    return { member: "neck", r: R_NECK, local: (fromTop - ABACUS_H - ECHINUS_H) / NECK_H };
  }
  const fromBottom = height - fromTop;
  if (fromBottom < PLINTH_H) {
    return { member: "plinth", r: R_PLINTH, local: 1 - fromBottom / PLINTH_H };
  }
  if (fromBottom < BASE_H) {
    const local = (fromBottom - PLINTH_H) / TORUS_H;
    return { member: "torus", r: R_NECK + (R_TORUS - R_NECK) * Math.sin(local * Math.PI), local };
  }
  // Entasis: the shaft swells toward its foot rather than tapering linearly.
  const t = (fromTop - CAPITAL_H) / Math.max(1e-6, height - CAPITAL_H - BASE_H);
  return { member: "shaft", r: 1 + (R_SHAFT_FOOT - 1) * t, local: t };
}

/** Darkness in 0..1 for a point on one of the members. */
function memberShade(member: Member, u: number, local: number): number {
  switch (member) {
    case "abacus":
      // A slab seen edge-on: a lit top arris over a flat dark face. The hard
      // horizontal that a capital needs in order to read at all.
      return local < 0.24 ? 0.2 : 0.72;
    case "echinus":
      // Smooth moulding, no flutes, plus the reveal in the abacus's shadow.
      return clamp01(0.78 - 0.5 * drumLambert(u, 0) + 0.24 * (1 - local));
    case "neck":
      return clamp01(0.92 - 0.2 * drumLambert(u, 0));
    case "shaft":
      // The one fluted member, and the widest tonal range on the plate. The
      // exponent pushes the terminator off-centre so the lit side stays open
      // and the shaded side keeps its detail instead of crushing to solid.
      //
      // `edgeDarken` is what gives the LIT silhouette an edge. Without it the
      // left of every shaft fades to the ground and the column loses its
      // outline on the side the light comes from.
      return clamp01(0.95 - 0.86 * drumLambert(u, FLUTE_DEPTH) ** 1.35 + edgeDarken(u));
    case "torus":
      return clamp01(0.72 - 0.46 * drumLambert(u, 0) + 0.18 * local);
    case "plinth":
      return local < 0.22 ? 0.24 : clamp01(0.6 + 0.26 * u * u);
    case "stub":
      return clamp01(0.68 + 0.22 * u * u);
  }
}

/**
 * Render the scene into an RGBA buffer, one entry per dither cell.
 *
 * Returns the raw array rather than touching a canvas so the geometry is
 * testable in a plain unit test — jsdom has no 2D context, and a rasteriser
 * that can only be exercised in a browser is a rasteriser with no coverage.
 */
export function rasterizeColonnade(spec: ColonnadeSpec): Uint8ClampedArray {
  const { width: w, height: h, columns, ground, bid, ask } = spec;
  const [covLo, covHi] = spec.coverageRange ?? [0, 1];
  const gain = spec.gain ?? 1;
  const falloff = spec.falloff ?? "none";
  const out = new Uint8ClampedArray(Math.max(0, w * h * 4));
  if (w <= 0 || h <= 0) return out;

  const cols = columns.length;
  const slot = cols > 0 ? 1 / cols : 1;
  const shaftR = slot * SHAFT_R;

  for (let py = 0; py < h; py++) {
    const ny = (py + 0.5) / h;
    for (let px = 0; px < w; px++) {
      const nx = (px + 0.5) / w;
      let shade = -1;
      let mass = ground;

      if (cols > 0) {
        const index = Math.min(cols - 1, Math.floor(nx / slot));
        const axis = (index + 0.5) * slot;
        const top = STYLOBATE_TOP - columns[index] * (STYLOBATE_TOP - COLUMN_CEILING);
        mass = index < cols / 2 ? bid : ask;

        if (ny >= STYLOBATE_TOP) {
          // Two steps, each with a riser line sized as a fraction of the tread
          // so it survives at one cell per device pixel.
          const stepH = (1 - STYLOBATE_TOP) / 2;
          const step = Math.min(1, Math.floor((ny - STYLOBATE_TOP) / stepH));
          const within = ny - STYLOBATE_TOP - step * stepH;
          shade = within < stepH * 0.18 ? 0.7 : 0.22 + step * 0.12;
        } else if (ny >= top && columns[index] > 0) {
          const { member, r, local } = memberAt(ny - top, STYLOBATE_TOP - top);
          const radius = shaftR * r;
          const d = Math.abs(nx - axis);
          if (d <= radius) {
            shade = memberShade(member, (d / radius) * (nx < axis ? -1 : 1), local);
          }
        }
      }

      const i = (py * w + px) * 4;
      let colour = ground;
      if (shade >= 0) {
        let g = gain;
        if (falloff === "radial") {
          // Distance from the centre, normalised so a corner is 1. Quiet in the
          // middle, full strength at the margins.
          const dx = (nx - 0.5) * 2;
          const dy = (ny - 0.5) * 2;
          const r = clamp01(Math.hypot(dx, dy) / Math.SQRT2);
          g *= 0.22 + 0.78 * clamp01((r - 0.28) / 0.5);
        }
        // Brightness in both themes — the lit face is the dense one — mapped
        // into the substrate's usable band. See `coverageRange`.
        const coverage = (covLo + (covHi - covLo) * (1 - shade)) * g;
        if (coverage * (DITHER_LEVELS - 1) > BAYER_8[py % MATRIX_SIZE][px % MATRIX_SIZE]) {
          colour = mass;
        }
      }
      out[i] = colour[0];
      out[i + 1] = colour[1];
      out[i + 2] = colour[2];
      out[i + 3] = 255;
    }
  }
  return out;
}
