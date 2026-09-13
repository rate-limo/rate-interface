import Decimal from "decimal.js";
import numeral from "numeral";

export function adjustDecimalLength(value: number, limit: number) {
  // remove e notation into full decimal string
  const formattedValue = Number.isNaN(value)
    ? "0"
    : value.toString().includes("e")
    ? new Intl.NumberFormat("en-US", {
        style: "decimal",
        maximumFractionDigits: 18,
        useGrouping: false,
      }).format(value)
    : value.toString();
  
  const [integer, fraction] = formattedValue.split(".");
  const integerWithComma = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  limit = limit < integerWithComma.length ? integerWithComma.length + 3 : limit;

  const decimal = limit - integerWithComma.length;
  const [_ , decimalString] = value.toFixed(decimal).split(".");
  // remove trailing zeros
  const removedTrailingZeros = decimalString === undefined || decimalString === "0" ? undefined : decimalString.replace(/0+$/, "");
  // check if the last digit value is 0, if so, remove it
  return integerWithComma + (removedTrailingZeros ? "." + removedTrailingZeros : "");
}

export function addCommasInDecimalString(value: string) {
  const [integer, fraction] = value.split(".");
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}

export function formatUnixTimestampToTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toISOString().substring(11, 19); // HH:MM:SS from ISO
}

export function roundToThirdDecimal(value: string) {
  return Math.round(Number(value) * 1000) / 1000;
}

export function roundToDecimal(value: number, decimals: number = 4) {
  return Number(new Decimal(value).toFixed(decimals));
}

export function parseEther(value: string) {
  return parseUnits(value, 18);
}

/**
 * On-chain price is always encoded with a fixed 8 decimals regardless of the
 * pair's base/quote token decimals (protocol-wide convention — the broker
 * decodes with the same fixed `decimals=8`, see apps/broker/src/utils/numbers.ts
 * and apps/broker/traffic-gen.ts). That fixed precision means a valid,
 * nonzero price a user typed can silently encode to raw value 0 for a
 * low-nominal-price pair. Callers should block submission and warn instead
 * of letting a zero-price order go out quietly.
 */
export function priceEncodesToZero(price: number, decimals: number = 8): boolean {
  return price > 0 && parseUnits(price.toString(), decimals) === BigInt(0);
}

/**
 * Multiplies a string representation of a number by a given exponent of base 10 (10exponent).
 *
 * - Docs: https://viem.sh/docs/utilities/parseUnits
 *
 * @example
 * import { parseUnits } from 'viem'
 *
 * parseUnits('420', 9)
 * // 420000000000n
 */
export function parseUnits(value: string, decimals: number) {
  const parsedValue = Number.parseFloat(value);
  const formattedValue = Number.isNaN(parsedValue)
    ? "0"
    : value.includes("e")
    ? new Intl.NumberFormat("en-US", {
        style: "decimal",
        maximumFractionDigits: 18,
        useGrouping: false,
      }).format(parsedValue)
    : value;

  let [integer, fraction = "0"] = formattedValue.split(".");

  const negative = integer.startsWith("-");
  if (negative) integer = integer.slice(1);

  // trim trailing zeros.
  fraction = fraction.replace(/(0+)$/, "");

  // round off if the fraction is larger than the number of decimals.
  if (decimals === 0) {
    if (Math.round(Number(`.${fraction}`)) === 1)
      integer = `${BigInt(integer) + BigInt(1)}`;
    fraction = "";
  } else if (fraction.length > decimals) {
    const [left, unit, right] = [
      fraction.slice(0, decimals - 1),
      fraction.slice(decimals - 1, decimals),
      fraction.slice(decimals),
    ];

    const rounded = Math.round(Number(`${unit}.${right}`));
    if (rounded > 9)
      fraction = `${BigInt(left) + BigInt(1)}0`.padStart(left.length + 1, "0");
    else fraction = `${left}${rounded}`;

    if (fraction.length > decimals) {
      fraction = fraction.slice(1);
      integer = `${BigInt(integer) + BigInt(1)}`;
    }

    fraction = fraction.slice(0, decimals);
  } else {
    fraction = fraction.padEnd(decimals, "0");
  }

  return BigInt(`${negative ? "-" : ""}${integer}${fraction}`);
}

/**
 * Compact USD for market caps and other headline totals — `$4.1M`, matching the
 * format the token tables have always printed.
 *
 * Takes `number | null | undefined` because the value it renders,
 * `spotTokens.marketCap`, is a generated column derived from `priceUSD`: it is
 * NULL for an unpriced token, and absent entirely from an indexer that has not
 * run migration 0021 yet. Both render as a dash — `$0` would read as a measured
 * zero, the same rule the status-bar price chips follow. Nothing recomputes
 * price × supply client-side to paper over an absent field; that would put a
 * second, drift-prone source of truth back where the generated column removed it.
 */
export function formatMarketCap(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  // `numeral`'s `a` suffix is lowercase; the venue's notation is uppercase. Uppercasing
  // the whole string is safe because the rest is digits, a `$` and a decimal point.
  return numeral(usd).format("$0.0a").toUpperCase();
}

/**
 * A USD figure, in this venue's notation, end to end.
 *
 * ## One rule, both ends of the range
 *
 * Two conventions existed in the app and neither covered the whole range:
 * `formatSubscriptDecimal` handled what happens BELOW a dollar, `formatMarketCap` handled
 * what happens above a thousand, and the money formatters in between did neither — so a
 * leaderboard row rounded a real sub-cent PnL to `$0` at one end and printed
 * `$1,234,567` at the other. This is the single answer:
 *
 *   | magnitude      | rendering    |
 *   |----------------|--------------|
 *   | exactly 0      | `$0`         |
 *   | < 1            | `$0.0₅123`   — subscript-zero, the count is the zeros after the point
 *   | 1 … 999.99     | `$12.34`     |
 *   | ≥ 1e3          | `$1.2K`      |
 *   | ≥ 1e6          | `$4.1M`      |
 *   | ≥ 1e9          | `$2.5B`      |
 *
 * UPPERCASE suffixes. `formatMarketCap` is uppercased to match rather than the other way
 * round: one casing across the app is the requirement, and `K`/`M`/`B` is the convention
 * every venue a trader reads alongside this one uses. Two casings for one unit reads as
 * two different units.
 *
 * ## Why `$0` is reserved for an exact zero
 *
 * A launch token trades in the 1e-5 range, so an entire realised PnL can sit below a
 * cent. Rounding that to `$0` is the same information loss this codebase refuses
 * everywhere else — a zero must mean zero, never "too small to bother printing".
 */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0";

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs < 1) {
    // `formatSubscriptDecimal` returns null in the 0.01–0.99 band, where notation costs a
    // reader more than the two zeros do; those render plainly.
    const subscript = formatSubscriptDecimal(abs);
    return `${sign}$${subscript ?? trimZeros(abs.toFixed(2))}`;
  }
  if (abs < 1_000) return `${sign}$${trimZeros(abs.toFixed(2))}`;
  if (abs < 1_000_000) return `${sign}$${trimZeros((abs / 1_000).toFixed(1))}K`;
  if (abs < 1_000_000_000) return `${sign}$${trimZeros((abs / 1_000_000).toFixed(1))}M`;
  return `${sign}$${trimZeros((abs / 1_000_000_000).toFixed(1))}B`;
}

/** `1.0` -> `1`, `1.20` -> `1.2`. A trailing zero after a compaction is noise. */
function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(count: number): string {
  return String(count)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)])
    .join("");
}

/**
 * A sub-1 price in SUBSCRIPT-ZERO notation: `0.00000123` -> `"0.0₅123"`.
 *
 * The subscript counts the zeros between the decimal point and the first
 * significant digit; the `0` it follows is part of the notation, not one of the
 * counted zeros. Same convention pump.fun and DexScreener use, which is the
 * point — a trader reading three venues must not have to re-count zeros.
 *
 * ## It fixes an information loss, not just a look
 *
 * `PairProfile`'s `fmtRate` capped sub-1 rates at 6 decimals, which loses the
 * number two different ways: `0.00000123` rendered as `0.000001` — a 23% error,
 * with every price in that decade collapsing onto the same label — and anything
 * below `1e-7` rendered as a flat **`0`**, indistinguishable from an unpriced
 * market on a page whose entire job is quoting that market. Launch tokens live
 * in exactly this range. Notation is what buys the digits back: `0.0₅123` costs
 * the same axis width as `0.000001` and loses nothing.
 *
 * ## Returns null rather than formatting the normal range
 *
 * Anything at or above `1`, an exact zero, a non-finite value, or a number with
 * fewer than `minZeros` leading zeros comes back null, and the caller keeps its
 * own formatting. That is deliberate: the call sites disagree about the normal
 * range for good reasons — the pair page appends a quote symbol and varies
 * decimals by magnitude, the token page wants USD with a `$`, the TradingView
 * axis has to honour the symbol's `pricescale`. A formatter that also owned the
 * normal range would have to reproduce all three, and would quietly flatten the
 * differences the next time someone touched it. This answers one question.
 *
 * `minZeros` is 2 because that is where the reference design switches over, and
 * because `0.05` reads fine as itself — notation below that threshold costs a
 * reader more than the zeros do.
 */
export function formatSubscriptDecimal(
  value: number | null | undefined,
  { digits = 4, minZeros = 2 }: { digits?: number; minZeros?: number } = {},
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude >= 1) return null;

  // Round to `digits` significant figures FIRST. Rounding can cross a power of
  // ten — 0.00099999 at 4 digits becomes 0.001 — and the zero run has to be
  // counted on the number actually shown, not on the one passed in. Getting
  // this backwards prints one zero too many for exactly the values where the
  // notation is doing the most work.
  const rounded = Number(magnitude.toPrecision(digits));
  if (rounded >= 1) return null;

  // The exponent comes from `toExponential`, never `Math.log10`: log10(0.001)
  // can land a hair below -3 and floor to -4, which miscounts the zeros and is
  // invisible in review because it only misfires on exact powers of ten.
  const [mantissa, exponent] = rounded.toExponential().split("e");
  const zeros = -Number(exponent) - 1;
  if (zeros < minZeros) return null;

  // Trailing zeros are dropped: `0.008` is `0.0₂8`, not `0.0₂8000`. Padding
  // would buy uniform column width at the cost of implying precision the
  // number does not carry.
  const significant = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  return `${value < 0 ? "-" : ""}0.0${toSubscript(zeros)}${significant}`;
}

/**
 * How many decimals a PRICE AXIS label should carry at a given magnitude.
 *
 * ## Why not just use the symbol's `pricescale`
 *
 * That was the first version, and ETH on RISE is what broke it. The gateway
 * declares `pricescale: 1e7` for every price symbol — `minmov: 1` over 1e7 is a
 * tick of 1e-7, chosen because most tokens on this venue trade below a dollar.
 * Applied to a $2,000 asset it asks for seven decimals, and the axis renders
 * `2,000.0000004 / 2,000.0000000 / 1,999.9999998`: float noise dressed as price
 * movement, on a token that has never had a trade.
 *
 * The gateway already knows this is wrong for large numbers — its market-cap
 * symbol overrides the same constant to 100, with a comment about "nonsensical
 * precision on an axis that will only ever show whole dollars". It just applied
 * the rule to market caps and not to a PRICE that happens to be large.
 *
 * ## Significant digits, floored at cents, capped by the tick
 *
 * Six significant digits separates adjacent labels at every magnitude this venue
 * quotes. The floor of 2 keeps cents on anything above a dollar — without it a
 * five-figure price loses them to the significant-digit budget. `pricescale`
 * survives as the UPPER bound only: a symbol whose tick is coarser than the
 * magnitude suggests should never be quoted finer than it can actually move.
 *
 * Sub-1 prices are not this function's problem — `formatSubscriptDecimal` takes
 * them first, and only the 0.01–0.99 band reaches here, where 5 decimals is
 * right.
 */
export function priceAxisDecimals(price: number, pricescaleDecimals: number): number {
  const magnitude = Math.abs(price) >= 1 ? Math.floor(Math.log10(Math.abs(price))) + 1 : 1;
  return Math.min(pricescaleDecimals, Math.max(2, 6 - magnitude));
}
