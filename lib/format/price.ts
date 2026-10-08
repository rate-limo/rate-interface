/**
 * Prices for the order book, the order tables and the trade tape.
 *
 * They went through `adjustDecimalLength(value, 6)`, whose second argument is a
 * CHARACTER budget for the whole string, not a count of decimals — so 0.000005
 * (8 characters) came out as "0.00001" and 0.000003 as "0". On a launch coin
 * priced in millionths that made two different asks read as one price and a
 * resting bid read as priced at zero, on every surface that shows a price.
 *
 * Two shapes, for two jobs:
 * - `formatTickPrice`: a column of levels on ONE market — fixed decimals from
 *   the market's tick (`step`), so the column lines up and two levels never
 *   print the same.
 * - `formatPrice`: a price on its own (a table row across markets, the header,
 *   a toast) — significant figures, so 0.0000049 stays 0.0000049.
 */

const MAX_DECIMALS = 18;

/** Decimals implied by a tick: 0.000001 → 6, 0.5 → 1, 10 → 0. */
export function stepDecimals(step: number | string | null | undefined): number {
  const s = Number(step);
  if (!Number.isFinite(s) || s <= 0) return 0;
  // From the decimal string, not log10: 0.0001 is not exactly representable and
  // log10 of it lands a hair off an integer.
  const text = s.toString().includes("e")
    ? s.toFixed(MAX_DECIMALS).replace(/0+$/, "")
    : s.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(MAX_DECIMALS, text.length - dot - 1);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A book level's price at the market's tick: 0.000005 @ 0.000001 → "0.000005". */
export function formatTickPrice(price: number | string, step: number | string | null | undefined): string {
  const p = Number(price);
  if (!Number.isFinite(p)) return "—";
  const fixed = p.toFixed(stepDecimals(step));
  const [i, f] = fixed.split(".");
  return f === undefined ? group(i) : `${group(i)}.${f}`;
}

/**
 * A standalone price to `sig` significant figures, never rounded to zero:
 * 2000 → "2,000", 1.23456 → "1.235", 0.0000049 → "0.0000049", 0.000003 → "0.000003".
 */
export function formatPrice(price: number | string, sig = 4): string {
  const p = Number(price);
  if (!Number.isFinite(p)) return "—";
  if (p === 0) return "0";
  const abs = Math.abs(p);
  if (abs >= 1000) return (p < 0 ? "-" : "") + group(Math.round(abs).toString());
  // Enough decimals to show `sig` significant digits, then drop trailing zeros.
  const decimals = Math.min(MAX_DECIMALS, Math.max(0, sig - 1 - Math.floor(Math.log10(abs))));
  const fixed = abs.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  const [i, f] = fixed.split(".");
  return (p < 0 ? "-" : "") + (f === undefined ? group(i) : `${group(i)}.${f}`);
}
