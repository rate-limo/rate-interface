import type { FeeTierInfo, LiqToken, ChartPeriod } from "./types";
import { genCandles, type Candle } from "./chart";

/**
 * MOCK liquidity data — pair rates, fee tiers, candles. Illustrative until wired
 * to the real pool/indexer. Rates are quote-per-base (never USD).
 */

const TOKENS: Record<string, LiqToken> = {
  ETH: { symbol: "ETH", name: "Ether", priceUsd: 1635, color: "var(--m-primary)" },
  WBTC: { symbol: "WBTC", name: "Wrapped Bitcoin", priceUsd: 82306, color: "#c98500" },
  USDC: { symbol: "USDC", name: "USD Coin", priceUsd: 1, color: "var(--m-logo)" },
  USDT: { symbol: "USDT", name: "Tether USD", priceUsd: 1, color: "var(--m-logo)" },
  MON: { symbol: "MON", name: "Monad", priceUsd: 2.05, color: "var(--m-primary)" },
};

export const LIQ_UNIVERSE = ["ETH", "WBTC", "USDC", "USDT", "MON"];

export function liqToken(symbol: string): LiqToken {
  return TOKENS[symbol] ?? { symbol, name: symbol, priceUsd: 1, color: "var(--m-primary)" };
}

/** Pair exchange rate — quote per base (e.g. ETH/USDC = 1635, WBTC/ETH = 50.34). */
export function pairRate(base: string, quote: string): number {
  return liqToken(base).priceUsd / liqToken(quote).priceUsd;
}

export const FEE_TIERS: FeeTierInfo[] = [
  { key: "stable", value: "0.01", label: "Very stable", description: "Commonly used for very stable pairs", tickSpacing: 1 },
  { key: "correlated", value: "0.05", label: "Stable", description: "Commonly used for stable pairs", tickSpacing: 10 },
  { key: "major", value: "0.30", label: "Standard", description: "Commonly used for most pairs", tickSpacing: 60 },
  { key: "volatile", value: "1.00", label: "Exotic", description: "Commonly used for exotic pairs", tickSpacing: 200 },
];

const VOL: Record<ChartPeriod, number> = { "1D": 0.02, "7D": 0.05, "1M": 0.09 };
const N: Record<ChartPeriod, number> = { "1D": 24, "7D": 30, "1M": 30 };

/** Candles around the current rate for a period (deterministic; memoise by anchor+period upstream if needed). */
export function candlesForPeriod(anchor: number, period: ChartPeriod): Candle[] {
  return genCandles(N[period], anchor, VOL[period]);
}
