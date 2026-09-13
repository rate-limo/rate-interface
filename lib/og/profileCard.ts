/**
 * The shaping behind the profile share card — pure, so the parts that can be
 * wrong are testable without rendering an image.
 *
 * `app/api/og/profile` renders it. Everything here answers one question: given
 * what the gateway actually returns for a wallet, what can the card claim?
 */

export interface CardPoint {
  /** Unix seconds or an ISO day — only the ORDER matters here. */
  t?: unknown;
  usd: number;
}

export interface CardPosition {
  symbol?: string | null;
  logoURI?: string | null;
  realizedPnlUSD?: number | null;
  costUSD?: number | null;
}

export interface Mover {
  symbol: string;
  logoURI: string | null;
  pnlUsd: number;
  /** Null when there is no cost basis to divide by — never 0. */
  pctChange: number | null;
}

/**
 * The positions worth putting on a card, biggest absolute move first.
 *
 * Absolute, not signed: a card showing a wallet's two largest LOSSES is as
 * informative as one showing its two largest wins, and ranking by signed value
 * would bury a disaster under a rounding-error gain.
 *
 * A zero-PnL position is dropped rather than ranked last. Most rows on this
 * venue are zero — a position that was bought and never sold has no realised
 * PnL at all — and a card listing two of them says nothing about the wallet.
 */
export function pickTopMovers(positions: CardPosition[], limit = 2): Mover[] {
  return positions
    .map((p) => ({
      symbol: (p.symbol ?? "").trim() || "—",
      logoURI: p.logoURI?.trim() ? p.logoURI : null,
      pnlUsd: Number.isFinite(p.realizedPnlUSD) ? (p.realizedPnlUSD as number) : 0,
      cost: Number.isFinite(p.costUSD) ? (p.costUSD as number) : 0,
    }))
    .filter((p) => p.pnlUsd !== 0)
    .sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd))
    .slice(0, limit)
    .map(({ symbol, logoURI, pnlUsd, cost }) => ({
      symbol,
      logoURI,
      pnlUsd,
      // Null, not 0: a position with no recorded cost has no percentage, and 0%
      // would read as "it did not move" next to a four-figure dollar swing.
      pctChange: cost > 0 ? (pnlUsd / cost) * 100 : null,
    }));
}

/**
 * An SVG path for the balance series, fitted to `width` x `height`.
 *
 * Returns null for fewer than two points, because one reading is not a line and
 * drawing it as a flat rule invents a history the wallet does not have. The
 * card omits the chart entirely in that case rather than showing an empty axis.
 *
 * A FLAT series is still drawn — every value equal is a real shape, and the
 * midline is where it belongs. Only the degenerate case is refused.
 */
export function sparklinePath(
  points: CardPoint[],
  width: number,
  height: number,
): { line: string; area: string } | null {
  const values = points.map((p) => p.usd).filter((v) => Number.isFinite(v));
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = width / (values.length - 1);

  const xy = values.map((v, i) => {
    const x = i * step;
    // A flat series has span 0; pin it to the middle rather than dividing by it.
    const y = span === 0 ? height / 2 : height - ((v - min) / span) * height;
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width.toFixed(1)},${height.toFixed(1)} L0,${height.toFixed(1)} Z`;
  return { line, area };
}

/** `$8,666.44`, or an em-dash for anything unmeasured. Never `$0.00` for null. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** `-$1,046.39` / `+$204.10`. The sign is the point, so it is always shown. */
export function signedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value < 0 ? "-" : "+"}${money(Math.abs(value))}`;
}

/** `19.60%`, unsigned — the caller draws the arrow. */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.abs(value).toFixed(2)}%`;
}

/** Up, down, or neither. Neither is a real answer and must not paint green. */
export function tone(value: number | null | undefined): "up" | "down" | "flat" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/**
 * A deterministic stand-in avatar for a wallet that has never set one.
 *
 * Most wallets on this venue have `avatarUrl: null`, and the card used to draw a
 * flat grey disc for them — which reads as a failed image rather than as an
 * unset one, and made every card of every unnamed wallet look identical.
 *
 * Seeded on the LOWERCASED address so the same wallet gets the same mark on
 * every card, on every chain, forever — the property that makes a generated
 * avatar work as identity at all. Dicebear is already this venue's generator:
 * `AssetGenerator` seeds launched-coin logos from it, so this adds no new
 * dependency, only a second caller.
 *
 * PNG, not SVG: Satori rasterises what it is given and has no SVG loader for a
 * remote `img` source.
 */
export function fallbackAvatarUrl(address: string): string {
  const seed = encodeURIComponent(address.toLowerCase());
  return `https://api.dicebear.com/9.x/shapes/png?seed=${seed}&size=256`;
}

/**
 * The banner behind the header when the wallet has not uploaded one.
 *
 * Two stops derived from the address so it is stable per wallet and distinct
 * between wallets — the same job the generated avatar does, one band up. Not a
 * flat colour: a solid strip reads as a rendering error, a gradient reads as a
 * choice.
 *
 * Hue only. Saturation and lightness are pinned so no wallet can land on a band
 * that fights the gold footer or washes out the white name sitting on it.
 *
 * **The stops are emitted as HEX, and that is not cosmetic.** Satori parses
 * gradient strings with its own parser and does not accept `hsl()` inside one —
 * a gradient written that way throws while the ImageResponse is streaming, which
 * is unrecoverable (see `inlineImage`'s note in the route) and takes the entire
 * card down. So the hue arithmetic happens here and only `#rrggbb` leaves.
 */
export function fallbackBannerGradient(address: string): string {
  // Mixed at full 32-bit width and reduced ONCE at the end. Taking `% 360` on
  // every character throws away most of the address before the last few
  // characters are read, and two wallets then land on visibly similar hues —
  // which defeats the only job this has, telling one card from another.
  let hash = 0;
  const key = address.toLowerCase();
  for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const from = hslHex(hue, 0.42, 0.26);
  const to = hslHex((hue + 42) % 360, 0.38, 0.15);
  return `linear-gradient(120deg, ${from} 0%, ${to} 100%)`;
}

/** HSL to `#rrggbb`. `h` in degrees, `s`/`l` in 0..1. */
function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * `#4` — the standing, or null when there is none to state.
 *
 * Null in, null out: the gateway returns `rank: null` for a wallet the fill
 * ledger has never seen, and "unranked" must not render as `#0` or as the last
 * place it is not. The caller drops the whole block instead.
 */
export function rankLabel(rank: number | null | undefined): string | null {
  if (rank === null || rank === undefined || !Number.isFinite(rank) || rank < 1) return null;
  return `#${Math.floor(rank).toLocaleString("en-US")}`;
}
