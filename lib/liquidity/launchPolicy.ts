/**
 * What a pool lister chooses when they create a market: volatility and the
 * taker fee. Both go on chain through `AssetGenerator.listPair`, which refuses
 * anything outside the generator's own bounds — so the choices offered here are
 * filtered by those bounds, read from the contract, rather than trusted.
 *
 * Coin launches (/create) choose neither: they start at Meme volatility and the
 * quote's starting fee, and the creator gets control only at graduation.
 */

import { FEE_DENOM } from "@/lib/launch/types";
import type { FeeTier } from "./types";

export type VolatilityPreset = "stable" | "standard" | "uniswap" | "meme";

/** The four volatility profiles, as the slippage limit `listPair` records, in basis points. */
export const VOLATILITY_PRESETS: readonly {
  key: VolatilityPreset;
  label: string;
  bps: number;
  description: string;
}[] = [
  { key: "stable", label: "Stable", bps: 5, description: "Tightly priced, low-volatility markets" },
  { key: "standard", label: "Standard", bps: 10, description: "Balanced, for established assets" },
  { key: "uniswap", label: "Active", bps: 50, description: "More room for active price movement" },
  { key: "meme", label: "Meme", bps: 100, description: "Wide tolerance for very volatile assets" },
];

export const DEFAULT_LIST_VOLATILITY_BPS = 10;
export const DEFAULT_LIST_FEE: FeeTier = "0.10";

/** The taker fees a lister can pick, before the chain's bounds are applied. */
export const LIST_FEE_CHOICES: readonly FeeTier[] = ["0.05", "0.10", "0.30", "1.00"];

/** A percent tier as the generator's `FEE_DENOM` numerator: "0.10" -> 100_000. */
export function feeTierNum(tier: FeeTier): number {
  return Math.round((Number(tier) / 100) * FEE_DENOM);
}

/** The generator's bounds for `listPair`. Null until read; nothing is offered while unknown. */
export interface ListBounds {
  minVolatilityBps: number;
  maxVolatilityBps: number;
  minFee: number;
  /** min(maxPairFee, maxCreatorTakerFee): `listPair` enforces both. */
  maxFee: number;
}

export function allowedVolatility(bounds: ListBounds | null) {
  if (!bounds) return [];
  return VOLATILITY_PRESETS.filter((p) => p.bps >= bounds.minVolatilityBps && p.bps <= bounds.maxVolatilityBps);
}

export function allowedFees(bounds: ListBounds | null): FeeTier[] {
  if (!bounds) return [];
  return LIST_FEE_CHOICES.filter((t) => feeTierNum(t) >= bounds.minFee && feeTierNum(t) <= bounds.maxFee);
}
