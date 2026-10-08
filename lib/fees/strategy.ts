/** Canonical Rate market-fee policy. Percent values are human-readable rates. */
export type MarketFeeClass = "stable" | "correlated" | "major" | "volatile" | "launch";

export interface MarketFeePolicy {
  key: MarketFeeClass;
  label: string;
  feePct: "0.01" | "0.05" | "0.10" | "0.30" | "1.00";
  description: string;
  examples: string;
}

export const MARKET_FEE_POLICIES: readonly MarketFeePolicy[] = [
  { key: "stable", label: "Very stable", feePct: "0.01", description: "Lowest-volatility stable pairs.", examples: "USDC / USDT" },
  { key: "correlated", label: "Stable", feePct: "0.05", description: "Stable and strongly correlated pairs.", examples: "ETH / wstETH" },
  { key: "major", label: "Standard", feePct: "0.30", description: "Commonly used for most pairs.", examples: "ETH / USDC" },
  { key: "volatile", label: "Exotic", feePct: "1.00", description: "Thin or highly volatile pairs.", examples: "New long-tail assets" },
  { key: "launch", label: "Launch", feePct: "1.00", description: "Temporary rate while a new market proves depth and flow.", examples: "New token / USDC" },
] as const;

export function feePolicy(key: MarketFeeClass): MarketFeePolicy {
  return MARKET_FEE_POLICIES.find((policy) => policy.key === key)!;
}

/** Post-graduation creator choices. A creator can discount, never exceed 30 bps. */
export const GRADUATED_FEE_PRESETS = [10_000, 30_000, 100_000, 300_000] as const;
export const MAX_GRADUATED_FEE_NUM = 300_000;

export const FEE_ALLOCATION = {
  liquidityPct: 75,
  protocolPct: 20,
  creatorPct: 5,
} as const;

export const LAUNCH_FEE_PATH = [
  { label: "Launch", feePct: "1.00%", requirement: "Market opens" },
  { label: "Growing", feePct: "0.50%", requirement: "$25k depth · 7 active days" },
  { label: "Established", feePct: "0.30%", requirement: "$100k depth · $250k volume" },
  { label: "Mature", feePct: "0.10%", requirement: "$500k depth · 30 active days" },
] as const;
