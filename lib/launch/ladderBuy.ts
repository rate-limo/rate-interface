/**
 * Buying and selling a launch coin before it graduates.
 *
 * The coin sells as five resting asks, each a geometric step above the last. A
 * MARKET order keeps the pair's 1% slippage cap and so can never climb a step,
 * and one limit order reaches only ONE step past the last fill (the ladder's
 * buy spread is the step gap). So for a pre-graduation coin the interface's
 * ordinary Buy and Sell go through `LadderBuyer.buy`/`sell`, which sends up to
 * five `isMaker: false` orders in one transaction — each climbing one step —
 * and refunds whatever cannot fill. Nothing rests on the book, and the user
 * sees only Buy and Sell — never the words "limit order".
 *
 * The ceiling is the highest step the expected fill reaches, plus the user's
 * normal slippage setting. The expected fill is a walk of the five steps'
 * REMAINING amounts, read from the escrow's orders (hooks/useLadderBook).
 *
 * "Pre-graduation launch coin" is read from the generator's own record
 * (`launches(coin)`): a creator set, `graduated` false, and the market is the
 * coin against its launch quote. Anything else trades as before.
 */

import { zeroAddress } from "viem";
import { COIN_DECIMALS } from "./types";

export interface LaunchRecord {
  creator: string;
  quote: string;
  graduated: boolean;
}

/** True when `coin`/`quote` is a launch coin still selling its ladder. */
export function isLadderMarket(record: LaunchRecord | null | undefined, quote: string | undefined): boolean {
  if (!record || !quote) return false;
  if (record.creator.toLowerCase() === zeroAddress) return false;
  if (record.graduated) return false;
  return record.quote.toLowerCase() === quote.toLowerCase();
}

/** One ladder step as the book holds it now: engine price (1e8) and coins still resting. */
export interface LadderStep {
  price: bigint;
  remaining: bigint;
}

const PRICE_SCALE = BigInt(100_000_000);
const TEN = BigInt(10);

/** `Orderbook.convert(price, coins, true)` for an 18-decimal coin: coins -> quote. */
function coinsToQuote(coins: bigint, price: bigint, quoteDecimals: number): bigint {
  const scaled = (coins * price) / PRICE_SCALE;
  return quoteDecimals <= COIN_DECIMALS
    ? scaled / TEN ** BigInt(COIN_DECIMALS - quoteDecimals)
    : scaled * TEN ** BigInt(quoteDecimals - COIN_DECIMALS);
}

/** `Orderbook.convert(price, quote, false)`: quote -> coins. */
function quoteToCoins(quote: bigint, price: bigint, quoteDecimals: number): bigint {
  if (price <= BigInt(0)) return BigInt(0);
  const scaled = (quote * PRICE_SCALE) / price;
  return quoteDecimals <= COIN_DECIMALS
    ? scaled * TEN ** BigInt(COIN_DECIMALS - quoteDecimals)
    : scaled / TEN ** BigInt(quoteDecimals - COIN_DECIMALS);
}

export interface LadderBuyQuote {
  /** Coins the walk expects to fill, raw, BEFORE the taker fee. */
  coinsOut: bigint;
  /** Coins the buyer receives: `coinsOut` net of the taker fee. */
  netCoinsOut: bigint;
  /** `LadderBuyer.buy`'s `minBaseOut`: `netCoinsOut` lowered by the slippage setting. */
  minBaseOut: bigint;
  /** Quote the walk expects to spend, raw. Anything above it is refunded. */
  quoteUsed: bigint;
  /** Highest step price the fill reaches (1e8). Zero when nothing fills. */
  topPrice: bigint;
  /** `LadderBuyer.buy`'s `maxPrice`: `topPrice` raised by the slippage setting, rounded up. */
  limitPrice: bigint;
}

/** `MatchingEngine.DENOM` — a taker fee of 1% is 1_000_000. */
const FEE_DENOM = BigInt(100_000_000);

/**
 * Walk the ladder for a buy of `quoteIn`. Steps are taken in price order; a step
 * with nothing left is skipped. Rounds the way the book does — coins down — so
 * the expected figure never promises more than the fill.
 */
export function quoteLadderBuy(
  steps: readonly LadderStep[],
  quoteIn: bigint,
  quoteDecimals: number,
  slippagePct: number,
  /** The pair's taker fee on the 1e8 scale; the engine takes it from the coins received. */
  takerFeeNum = 0,
): LadderBuyQuote {
  let left = quoteIn;
  let coinsOut = BigInt(0);
  let topPrice = BigInt(0);
  const sorted = [...steps].filter((s) => s.remaining > BigInt(0)).sort((a, b) => (a.price < b.price ? -1 : 1));
  for (const step of sorted) {
    if (left <= BigInt(0)) break;
    const stepCost = coinsToQuote(step.remaining, step.price, quoteDecimals);
    if (left >= stepCost && stepCost > BigInt(0)) {
      coinsOut += step.remaining;
      left -= stepCost;
    } else {
      coinsOut += quoteToCoins(left, step.price, quoteDecimals);
      left = BigInt(0);
    }
    topPrice = step.price;
  }
  const bps = BigInt(Math.max(0, Math.round(slippagePct * 100)));
  const limitPrice = topPrice > BigInt(0) ? (topPrice * (BigInt(10_000) + bps) + BigInt(9_999)) / BigInt(10_000) : BigInt(0);
  const netCoinsOut = coinsOut - (coinsOut * BigInt(takerFeeNum)) / FEE_DENOM;
  const minBaseOut = (netCoinsOut * (BigInt(10_000) - bps)) / BigInt(10_000);
  return { coinsOut, netCoinsOut, minBaseOut, quoteUsed: quoteIn - left, topPrice, limitPrice };
}

/**
 * A sell's price floor: the last traded price lowered by the slippage setting,
 * rounded down. Ladder asks never buy, so a sell fills only into resting bids;
 * the floor keeps it from filling far below where the market is.
 */
export function ladderSellFloor(lastPrice: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippagePct * 100))));
  const floor = (lastPrice * (BigInt(10_000) - bps)) / BigInt(10_000);
  return floor > BigInt(0) ? floor : BigInt(1);
}

/** The words the quote adds under a ladder fill. */
export const REFUND_NOTE = "Any part that can't fill is returned.";
