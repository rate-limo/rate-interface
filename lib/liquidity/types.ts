/** Liquidity / pool-launch domain types. See apps/web/CLAUDE.md ("Liquidity & pool-launch page"). */

import type { MarketFeeClass } from "@/lib/fees/strategy";

export type FeeTier = "0.01" | "0.05" | "0.10" | "0.30" | "1.00";
export type LiqMode = "provide" | "launch";

export interface LiqToken {
  symbol: string;
  name: string;
  priceUsd: number;
  color: string;
}

export interface FeeTierInfo {
  key: Exclude<MarketFeeClass, "launch">;
  value: FeeTier;
  label: string;
  description?: string;
  /** tick spacing the tier fixes (illustrative) */
  tickSpacing: number;
}

export type ChartPeriod = "1D" | "7D" | "1M";
