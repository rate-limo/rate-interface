import { parseHex, type Rgb } from "@/lib/graphics/dither";

/**
 * The up/down colours for every candle in the app, from one source.
 *
 * ## Why this exists
 *
 * There were two sources and they were both literals. `ThesisChart` (the coin
 * profile, lightweight-charts) and `TradingViewChart` (the Pro terminal) each
 * carried their own `palette(isDark)` with the SAME four hex values typed out
 * twice — `#52C48A`/`#E36A75` dark, `#178A5B`/`#C84452` light — and a comment in
 * the first saying the values match so that "moving between the profile and the
 * terminal does not change what a candle looks like". That is a rule two copies
 * cannot keep; it only held because nobody had edited either one yet.
 *
 * Meanwhile `--m-candle-bull-fill` and its four siblings had been sitting in
 * `globals.css` since the Monet palette landed with **zero consumers** — the
 * tokens described the candles and nothing read them. So the app had the
 * duplication and the indirection at the same time, and neither was doing its
 * job.
 *
 * ## Tokens, with the old literals as the floor
 *
 * The values come from the stylesheet, so a candle follows the theme the same
 * way every other surface does. The fallbacks are the exact literals that were
 * hardcoded before, which makes this safe in the two places a token cannot be
 * read: server rendering, where there is no `document`, and a stale CSS build
 * that has not yet picked up a new token — a failure that has already blanked
 * one graphic in this app, and which must never be able to blank a price chart.
 */

export interface CandleColors {
  /** Rising candle: body, border and wick. */
  up: string;
  /** Falling candle. */
  down: string;
}

/**
 * The values that shipped before the tokens were wired. Kept verbatim as the
 * fallback so a missing token degrades to the previous appearance rather than
 * to a chart with no candles in it.
 */
const FALLBACK: Record<"dark" | "light", CandleColors> = {
  dark: { up: "#52C48A", down: "#E36A75" },
  light: { up: "#178A5B", down: "#C84452" },
};

const hex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Resolve against an arbitrary token lookup. Separated from the DOM so the
 * precedence is testable — a chart's colours are the sort of thing that breaks
 * silently and is noticed a week later.
 */
export function resolveCandleColors(
  read: (token: string) => string | undefined,
  isDark: boolean,
): CandleColors {
  const fallback = FALLBACK[isDark ? "dark" : "light"];
  const pick = (token: string, fromFallback: string): string => {
    const parsed = parseHex(read(token) ?? "");
    return parsed ? hex(parsed) : fromFallback;
  };
  return {
    up: pick("--m-candle-bull-fill", fallback.up),
    down: pick("--m-candle-bear-fill", fallback.down),
  };
}

/**
 * Read the live tokens off the document root.
 *
 * `isDark` is still a parameter rather than being sniffed here: it only selects
 * the FALLBACK. When the tokens resolve, the cascade has already applied the
 * right theme and this cannot disagree with it.
 */
export function candleColors(isDark: boolean): CandleColors {
  if (typeof document === "undefined") {
    return FALLBACK[isDark ? "dark" : "light"];
  }
  const styles = getComputedStyle(document.documentElement);
  return resolveCandleColors((token) => styles.getPropertyValue(token), isDark);
}
