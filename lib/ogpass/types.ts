/**
 * OG Pass domain types — the pre-launch membership pass.
 *
 * A tiered, capped-supply pass sold before the app opens. It grants a permanent
 * points boost, passkey login (Turnkey), sponsored gas, and a fee discount — all
 * tied to the wallet that holds it. A mock drives this today; wire to the pass
 * contract (ownership + mint) and the paymaster (gas balance) later without
 * touching the components. See apps/web/CLAUDE.md.
 */

export type TierId = "insider" | "founder" | "og";

export interface PassTier {
  id: TierId;
  name: string;
  priceEth: string;
  priceUsd: string;
  /** permanent points multiplier, e.g. 25 (%) */
  pointsBoostPct: number;
  /** sponsored-gas budget in USD */
  gasBudgetUsd: number;
  /** maker/taker fee discount, e.g. 25 (%) */
  feeDiscountPct: number;
  supply: number;
  sold: number;
  popular?: boolean;
}

export interface OwnedPass {
  tier: TierId;
  tierName: string;
  /** display pass number, e.g. "0000 · 0312" */
  number: string;
  gasBudgetUsd: number;
  gasUsedUsd: number;
  feeDiscountPct: number;
  pointsBoostPct: number;
  passkeyEnabled: boolean;
}

export interface OgPassConfig {
  season: number;
  /** seconds until the sale opens, from now (mock; real = a fixed on-chain/config timestamp). */
  saleStartsInSec: number;
  tiers: PassTier[];
}
