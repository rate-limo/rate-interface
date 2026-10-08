/**
 * The launch's price and dev-buy arithmetic, mirrored from the contract to the
 * unit.
 *
 * `AssetLaunchLib.listingPrice` sets the starting price so the WHOLE supply is
 * worth the quote option's `startingMarketCap`, and `_devBuy` turns the
 * creator's quote into coins with the pair's own `Orderbook.convert`. Both are
 * integer division on chain; doing them in floats here would quote a creator a
 * coin count the transaction then disagrees with by a rounding step, and a
 * dev buy sized to exactly the 10% cap would revert `DevBuyTooLarge`.
 *
 * Coins are always 18 decimals (`Coin` takes none), so the only decimals in
 * play are the quote's — 6 for USDC on both Arc and RISE.
 */

import { COIN_DECIMALS, LAUNCH_SUPPLY_TEXT } from "./types";

/** `AssetLaunchLib.MIN_LISTING_PRICE`: below this the 1e8 price grid is too coarse. */
export const MIN_LISTING_PRICE = BigInt(100);
/** `AssetLaunchLib.MAX_DEV_BUY_BPS`: the creator may buy at most 10% of supply. */
export const MAX_DEV_BUY_BPS = BigInt(1_000);
const BPS = BigInt(10_000);
const PRICE_SCALE = BigInt(100_000_000);
const TEN = BigInt(10);

const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;

/**
 * `AssetLaunchLib.listingPrice` — the engine price (1e8 scale) at which `supply` is
 * worth `marketCap`, ROUNDED UP as the contract rounds it.
 */
export function listingPriceRaw(marketCap: bigint, supply: bigint, quoteDecimals: number): bigint {
  if (supply <= BigInt(0)) return BigInt(0);
  if (quoteDecimals <= COIN_DECIMALS) {
    return ceilDiv(marketCap * TEN ** BigInt(COIN_DECIMALS - quoteDecimals) * PRICE_SCALE, supply);
  }
  return ceilDiv(marketCap * PRICE_SCALE, supply * TEN ** BigInt(quoteDecimals - COIN_DECIMALS));
}

/** OpenZeppelin `Math.sqrt`: floor of the square root. */
export function isqrt(n: bigint): bigint {
  if (n < BigInt(2)) return n;
  let x = n;
  let y = (x + BigInt(1)) / BigInt(2);
  while (y < x) {
    x = y;
    y = (x + n / x) / BigInt(2);
  }
  return x;
}

/** The five ladder market caps, `AssetLaunchLib.ladderPrices`' integer geometric means. */
export function ladderMarketCaps(start: bigint, end: bigint): bigint[] {
  const mid = isqrt(start * end);
  return [start, isqrt(start * mid), mid, isqrt(mid * end), end];
}

/** `AssetLaunchLib.LADDER_BPS` and `STEPS`: 80% of supply as five equal asks. */
export const LADDER_BPS = BigInt(8_000);
export const LADDER_STEPS = 5;

/**
 * The ladder as the contract places it: each step's market cap, engine price, and
 * the coins resting there (16% each, the last taking the rounding remainder).
 */
export function ladderSteps(start: bigint, end: bigint, supply: bigint, quoteDecimals: number) {
  const ladder = (supply * LADDER_BPS) / BPS;
  const step = ladder / BigInt(LADDER_STEPS);
  return ladderMarketCaps(start, end).map((cap, i) => ({
    marketCap: cap,
    price: listingPriceRaw(cap, supply, quoteDecimals),
    coins: i + 1 === LADDER_STEPS ? ladder - step * BigInt(LADDER_STEPS - 1) : step,
  }));
}

/** `Orderbook.convert(price, quoteIn, false)` for an 18-decimal coin: quote in, coins out. */
export function devBuyCoinsRaw(quoteIn: bigint, price: bigint, quoteDecimals: number): bigint {
  if (price <= BigInt(0)) return BigInt(0);
  const scaled = (quoteIn * PRICE_SCALE) / price;
  return quoteDecimals <= COIN_DECIMALS
    ? scaled * TEN ** BigInt(COIN_DECIMALS - quoteDecimals)
    : scaled / TEN ** BigInt(quoteDecimals - COIN_DECIMALS);
}

/** The most coins a dev buy may take: 10% of supply, rounded down as the contract does. */
export function devBuyCapRaw(supply: bigint): bigint {
  return (supply * MAX_DEV_BUY_BPS) / BPS;
}

/**
 * The largest quote amount whose dev buy stays within the cap.
 *
 * The base->quote direction of `convert` rounded down, then walked down while the
 * contract's own quote->base direction would still overshoot — so the figure the
 * form offers as "max" is one the transaction accepts, never one a step past it.
 */
export function maxDevBuyQuoteRaw(supply: bigint, price: bigint, quoteDecimals: number): bigint {
  if (price <= BigInt(0)) return BigInt(0);
  const cap = devBuyCapRaw(supply);
  let quote =
    quoteDecimals <= COIN_DECIMALS
      ? (cap * price) / PRICE_SCALE / TEN ** BigInt(COIN_DECIMALS - quoteDecimals)
      : ((cap * price) / PRICE_SCALE) * TEN ** BigInt(quoteDecimals - COIN_DECIMALS);
  while (quote > BigInt(0) && devBuyCoinsRaw(quote, price, quoteDecimals) > cap) quote -= BigInt(1);
  return quote;
}

export type DevBuyCheck =
  | { ok: true; coins: bigint; shareBps: number }
  | { ok: false; reason: "priceTooLow" | "belowMinimum" | "aboveCap"; coins: bigint; shareBps: number };

/**
 * The same three refusals the contract makes, in its order, before a wallet
 * prompt is spent on them: `ListingPriceTooLow`, `DevBuyTooSmall`,
 * `DevBuyTooLarge`.
 */
export function checkDevBuy(args: {
  supply: bigint;
  marketCap: bigint;
  minDevBuy: bigint;
  quoteIn: bigint;
  quoteDecimals: number;
}): DevBuyCheck {
  const price = listingPriceRaw(args.marketCap, args.supply, args.quoteDecimals);
  const coins = devBuyCoinsRaw(args.quoteIn, price, args.quoteDecimals);
  const shareBps = args.supply > BigInt(0) ? Number((coins * BPS) / args.supply) : 0;
  if (price < MIN_LISTING_PRICE) return { ok: false, reason: "priceTooLow", coins, shareBps };
  if (args.quoteIn < args.minDevBuy) return { ok: false, reason: "belowMinimum", coins, shareBps };
  if (coins > devBuyCapRaw(args.supply)) return { ok: false, reason: "aboveCap", coins, shareBps };
  return { ok: true, coins, shareBps };
}

/**
 * Everything the form and the review render about one dev buy, from raw text.
 *
 * One function for both screens so the Market step and the Confirm step can
 * never quote the creator two different coin counts for the same input.
 */
export interface DevBuyView {
  /** Quote per coin at the start, for display. 0 when the supply is unusable. */
  price: number;
  /** The admin-set starting market cap, quote units. */
  startingMarketCap: number;
  min: number;
  max: number;
  /** Raw input parsed, quote units. */
  amount: number;
  coins: number;
  /** Share of supply the dev buy takes, percent. */
  sharePct: number;
  /** Raw amounts for the transaction. */
  raw: { quoteIn: bigint; coins: bigint };
  check: DevBuyCheck;
  /** The five sell steps the launch places: market cap (quote units) and % of supply. */
  ladder: { marketCap: number; supplyPct: number }[];
}

const toNumber = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;

/** Typed text to raw units, exactly — no float round trip, so a large supply cannot become `1e+21`. */
export function parseRawAmount(text: string, decimals: number): bigint {
  const clean = text.replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return BigInt(0);
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * TEN ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function devBuyView(
  option: { decimals: number; startingMarketCap: bigint; minDevBuy: bigint; graduationMarketCap: bigint },
  supplyText: string,
  devBuyText: string,
): DevBuyView {
  const supply = parseRawAmount(supplyText, COIN_DECIMALS);
  const quoteIn = parseRawAmount(devBuyText, option.decimals);
  const price = listingPriceRaw(option.startingMarketCap, supply, option.decimals);
  const check = checkDevBuy({
    supply,
    marketCap: option.startingMarketCap,
    minDevBuy: option.minDevBuy,
    quoteIn,
    quoteDecimals: option.decimals,
  });
  const supplyNum = toNumber(supply, COIN_DECIMALS);
  const startingMarketCap = toNumber(option.startingMarketCap, option.decimals);
  return {
    price: supplyNum > 0 ? startingMarketCap / supplyNum : 0,
    startingMarketCap,
    min: toNumber(option.minDevBuy, option.decimals),
    max: toNumber(maxDevBuyQuoteRaw(supply, price, option.decimals), option.decimals),
    amount: toNumber(quoteIn, option.decimals),
    coins: toNumber(check.coins, COIN_DECIMALS),
    sharePct: check.shareBps / 100,
    raw: { quoteIn, coins: check.coins },
    check,
    ladder: ladderSteps(option.startingMarketCap, option.graduationMarketCap, supply, option.decimals).map((st) => ({
      marketCap: toNumber(st.marketCap, option.decimals),
      supplyPct: supply > BigInt(0) ? Number((st.coins * BigInt(1_000_000)) / supply) / 10_000 : 0,
    })),
  };
}

/** The sentence for each refusal `checkDevBuy` mirrors from the contract. */
export function devBuyRefusal(reason: "priceTooLow" | "belowMinimum" | "aboveCap"): string {
  switch (reason) {
    case "priceTooLow":
      return "This quote token is worth too much for a 1B-supply launch: the starting price would round to zero. Pick another quote token.";
    case "belowMinimum":
      return "The dev buy is below the minimum. Raise it and try again.";
    case "aboveCap":
      return "The dev buy is over 10% of the supply. Lower it and try again.";
  }
}

/**
 * Whether a quote option can price a fixed-supply launch at all: the contract
 * refuses (`ListingPriceTooLow`) when startingMarketCap / supply lands under
 * MIN_LISTING_PRICE units. With supply fixed at 1B this is a property of the
 * quote option alone, so /create filters its picker with it.
 */
export function clearsListingFloor(
  option: { decimals: number; startingMarketCap: bigint },
  supplyText: string = LAUNCH_SUPPLY_TEXT,
): boolean {
  const supply = parseRawAmount(supplyText, COIN_DECIMALS);
  if (supply <= BigInt(0) || option.startingMarketCap <= BigInt(0)) return false;
  return listingPriceRaw(option.startingMarketCap, supply, option.decimals) >= MIN_LISTING_PRICE;
}
