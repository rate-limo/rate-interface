import type { RewardsData } from "./types";

/**
 * MOCK rewards data — illustrative until wired to the indexer (per-epoch volume
 * & liquidity) + the distributor. Points are ×10 the $OG they redeem for at the
 * season `rate` (10 pts = 1 $OG). Mirrors the approved claim artifact.
 */
export function rewardsData(): RewardsData {
  return {
    season: 1,
    epoch: 9,
    epochsInSeason: 12,
    rate: 10,
    referral: {
      code: "HYUNGSU",
      referred: 8,
      active: 5,
      earnedPts: 960,
      tier: 2,
      boostPct: 15,
    },
    epochs: [
      { label: "Jun 2", volumeUsd: 8200, liquidityUsd: 0, tradingPts: 420, liquidityPts: 0, referralPts: 50, status: "claimed" },
      { label: "Jun 9", volumeUsd: 12400, liquidityUsd: 0, tradingPts: 640, liquidityPts: 0, referralPts: 80, status: "claimed" },
      { label: "Jun 16", volumeUsd: 6100, liquidityUsd: 2000, tradingPts: 310, liquidityPts: 130, referralPts: 40, status: "claimed" },
      { label: "Jun 23", volumeUsd: 22800, liquidityUsd: 2000, tradingPts: 900, liquidityPts: 130, referralPts: 150, status: "claimable" },
      { label: "Jun 30", volumeUsd: 18400, liquidityUsd: 5000, tradingPts: 700, liquidityPts: 340, referralPts: 120, status: "claimable" },
      { label: "Jul 7", volumeUsd: 31200, liquidityUsd: 5000, tradingPts: 1200, liquidityPts: 340, referralPts: 200, status: "claimable" },
      { label: "Jul 14", volumeUsd: 27600, liquidityUsd: 8000, tradingPts: 1000, liquidityPts: 540, referralPts: 180, status: "claimable" },
      { label: "Jul 21", volumeUsd: 41000, liquidityUsd: 8000, tradingPts: 1500, liquidityPts: 540, referralPts: 280, status: "claimable" },
      { label: "This wk", volumeUsd: 28400, liquidityUsd: 8000, tradingPts: 960, liquidityPts: 540, referralPts: 180, status: "accruing" },
    ],
  };
}

// Source colours for the stacked chart / legend / table.
export const SOURCE_COLOR = {
  trading: "var(--m-primary)",
  liquidity: "var(--m-logo)",
  referral: "var(--m-warning)",
} as const;
