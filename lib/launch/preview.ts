/**
 * The pure half of `components/Launch/LaunchPreviewCard` — everything that
 * turns a half-typed draft into something drawable.
 *
 * It lives here rather than in the component for the reason the rest of
 * `lib/launch/*` does: the component should be about rendering, and these are
 * the parts with answers worth pinning. The card claims two things in its own
 * docstring — that the artwork is derived from the symbol and therefore stable,
 * and that an unfinished draft still renders something readable. Both are
 * assertions about these functions.
 */

import { tokenColor } from "@/lib/swap/tokens";

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * `#rrggbb` → HSL.
 *
 * Total by construction, like `tokenColor` itself: this feeds an atom on a page
 * whose whole job is a preview, and being wrong about a swatch costs nothing
 * while throwing costs the render. An unparseable value falls back to the
 * ramp's blue rather than raising.
 */
export function toHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 212, s: 28, l: 42 };
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export interface MeshStops {
  ground: string;
  a: string;
  b: string;
  c: string;
  d: string;
}

/** Distinct spins within the arc. 12 x 8 base colours is enough separation. */
const SPIN_STEPS = 12;
const SPIN_ARC = 34;

/**
 * A bounded hue offset, independent of `tokenColor`'s own hash so two symbols
 * that collide into one avatar colour do not also collide here. FNV-1a rather
 * than the `h * 31` in `tokenColor`: reusing that mixer would reproduce its
 * collisions exactly, which is the whole failure this exists to avoid.
 */
function spinFor(symbol: string): number {
  let hash = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const step = hash % SPIN_STEPS;
  return Math.round((step / (SPIN_STEPS - 1)) * SPIN_ARC * 2 - SPIN_ARC);
}

/**
 * Five stops for the card's blurred mesh, derived from the symbol.
 *
 * Keyed on the SYMBOL, which is correct only here: `useTokenBrand` keys brand
 * colour on `(chainId, address)` precisely because this venue lets anyone mint
 * a coin called USDC, and a preview has no address yet to key on. Nothing this
 * returns reaches a deployed token's branding.
 *
 * ## Why there is a second hash on top of `tokenColor`
 *
 * `tokenColor` picks from EIGHT avatar colours, which is right for a 20px
 * swatch in a table row and wrong here: this is a 300px hero, and one coin in
 * eight would open on a card that looks like the last one the creator saw. The
 * base hue still comes from `tokenColor`, so the card stays in the same colour
 * family as the token's swatch everywhere else in the app; an independent hash
 * then spins it within a bounded arc, taking the number of distinct looks from
 * 8 to ~8 x SPIN_STEPS. A free 0-359 spin would have decoupled the card from
 * the swatch entirely, which is the thing worth keeping.
 */
export function meshStops(symbol: string): MeshStops {
  const { h: baseHue, s } = toHsl(tokenColor(symbol));
  const h = (((baseHue + spinFor(symbol)) % 360) + 360) % 360;
  // Saturation is pulled toward Monet's muted range on purpose: the avatar
  // ramp is brighter than anything else on this page, and a card that
  // out-saturates the whole app reads as a different product.
  const sat = Math.min(38, Math.max(18, s - 22));
  const at = (dh: number, dl: number) => `hsl(${(((h + dh) % 360) + 360) % 360} ${sat}% ${dl}%)`;
  /*
   * LIGHT stops, in ONE hue family. Both halves of that were wrong and they
   * compounded into the same defect.
   *
   * The stops ran 24%-42% lightness, so the art was a dark slab sitting on a
   * light card — `c` at 24% is a 200px circle low and centre, which read as a
   * black hole someone had airbrushed into the middle of the coin.
   *
   * And `b` was `+302`, which is `-58` — a near-complement. Blurring a hue
   * against its complement at low lightness and low saturation is the textbook
   * way to make MUD: the two cancel toward grey, then the darkness turns that
   * grey brown. Every unbranded coin came out the same olive-and-maroon sludge
   * whatever its symbol hashed to, which also defeated the spin above.
   *
   * Now: an analogous arc (-26 to +64, no complement) at 60%-80% lightness, so
   * the blur stays inside one family and the card reads as artwork on either
   * theme. The saturation band is untouched — it is a deliberate choice with a
   * test, and it was never what made this muddy.
   */
  return {
    ground: at(0, 66),
    a: at(22, 76),
    b: at(44, 70),
    c: at(-26, 60),
    d: at(64, 80),
  };
}

/**
 * The supply field as the card should print it.
 *
 * The input is supply text — `LAUNCH_SUPPLY_TEXT` today; it once was a field
 * the creator typed, with commas — so this reads the digits and reformats. An empty or
 * digit-free draft is an em-dash and never `0`: this repo's rule everywhere a
 * figure can be absent, because a zero supply is a real, refused value
 * (`SupplyIsZero`) and must not be how "nothing entered yet" looks.
 */
export function prettySupply(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "—";
  return Number(digits).toLocaleString("en-US");
}
