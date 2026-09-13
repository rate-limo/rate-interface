import type { PassTier, OgPassConfig, OwnedPass } from "./types";

/** MOCK OG Pass config — tiers, supply, and the sale countdown. Illustrative. */
export function ogPassConfig(): OgPassConfig {
  return {
    season: 1,
    saleStartsInSec: 4 * 86400 + 12 * 3600 + 5 * 60, // 4d 12h 5m
    tiers: [
      { id: "insider", name: "Insider", priceEth: "0.05 ETH", priceUsd: "$82", pointsBoostPct: 10, gasBudgetUsd: 50, feeDiscountPct: 10, supply: 2000, sold: 1240 },
      { id: "founder", name: "Founder", priceEth: "0.15 ETH", priceUsd: "$245", pointsBoostPct: 25, gasBudgetUsd: 200, feeDiscountPct: 25, supply: 500, sold: 312, popular: true },
      { id: "og", name: "OG", priceEth: "0.5 ETH", priceUsd: "$818", pointsBoostPct: 50, gasBudgetUsd: 1000, feeDiscountPct: 40, supply: 100, sold: 53 },
    ],
  };
}

/** Build the owned-pass view from a purchased tier (mock; real = read the pass NFT + paymaster). */
export function mintPass(tier: PassTier): OwnedPass {
  return {
    tier: tier.id,
    tierName: tier.name,
    number: `0000 · ${String(tier.sold + 1).padStart(4, "0")}`,
    gasBudgetUsd: tier.gasBudgetUsd,
    gasUsedUsd: Math.round(tier.gasBudgetUsd * 0.23),
    feeDiscountPct: tier.feeDiscountPct,
    pointsBoostPct: tier.pointsBoostPct,
    passkeyEnabled: true,
  };
}
