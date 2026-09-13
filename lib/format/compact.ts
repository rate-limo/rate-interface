/**
 * Deterministic compact number formatting.
 *
 * ## Why not `Intl.NumberFormat({ notation: "compact" })`
 *
 * Node's ICU and the browser's disagree about trailing digits, so the same
 * value renders differently on the server and on the client:
 *
 *   value   Node (ICU 78)   Chrome
 *   0       "$0.0"          "$0"
 *   100000  "$100.0K"       "$100K"
 *
 * Every page that prints one of these is server-rendered and hydrated, so the
 * difference lands as a React hydration error — the console reports a mismatch
 * and React throws away the server HTML for that subtree and re-renders it.
 * That was live on the token profile's graduation gauge, whose `aria-label`
 * disagreed the same way, which is how it was noticed.
 *
 * `components/Iter/ProtocolFlywheel.tsx` had already diagnosed this and
 * hand-rolled a fix; that implementation is lifted here so the other callers
 * stop re-deriving it — and so the next person reaching for `notation: "compact"`
 * finds the reason it is avoided.
 *
 * Fixed digit counts are the whole point: no locale data is consulted, so server
 * and client cannot differ.
 */
const COMPACT_UNITS: ReadonlyArray<[number, string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/**
 * `$1.2K` / `$3.40` — currency-prefixed, one decimal above 1000 and below 100
 * units, none above. Negatives keep their sign ahead of the symbol.
 */
export function compactUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (const [scale, suffix] of COMPACT_UNITS) {
    if (abs >= scale) {
      const scaled = abs / scale;
      return `${sign}$${scaled.toFixed(scaled < 100 ? 1 : 0)}${suffix}`;
    }
  }
  // Trailing ".00" is stripped so a whole-dollar value reads "$0" / "$42" rather
  // than "$0.00" — which is also what the browser's compact formatter produced
  // before this replaced it, so nothing on screen changes except the mismatch.
  // A real fractional amount keeps its cents ("$3.40").
  return `${sign}$${abs.toFixed(abs < 100 ? 2 : 0).replace(/\.00$/, "")}`;
}

/** The same scaling without a currency symbol — token amounts, supply, counts. */
export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (const [scale, suffix] of COMPACT_UNITS) {
    if (abs >= scale) {
      const scaled = abs / scale;
      return `${sign}${scaled.toFixed(scaled < 100 ? 1 : 0)}${suffix}`;
    }
  }
  return `${sign}${abs.toFixed(abs < 100 ? 2 : 0).replace(/\.00$/, "")}`;
}
