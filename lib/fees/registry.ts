import { getSwapTokens } from "@/lib/swap/tokens";
import type { MarketFeeClass } from "./strategy";

export type AssetKind = "fiat" | "wrapped" | "staked" | "major" | "unknown";

export interface AssetClassification {
  address: string;
  symbol: string;
  kind: AssetKind;
  /** Economic value the asset is intended to follow, never inferred from user metadata. */
  referenceAsset?: "USD" | "ETH" | "BTC";
  verified: boolean;
}

const CURATED: Record<string, Pick<AssetClassification, "kind" | "referenceAsset">> = {
  USDC: { kind: "fiat", referenceAsset: "USD" },
  USDT: { kind: "fiat", referenceAsset: "USD" },
  DAI: { kind: "fiat", referenceAsset: "USD" },
  USDE: { kind: "fiat", referenceAsset: "USD" },
  USDS: { kind: "fiat", referenceAsset: "USD" },
  FRAX: { kind: "fiat", referenceAsset: "USD" },
  ETH: { kind: "major", referenceAsset: "ETH" },
  WETH: { kind: "wrapped", referenceAsset: "ETH" },
  WSTETH: { kind: "staked", referenceAsset: "ETH" },
  STETH: { kind: "staked", referenceAsset: "ETH" },
  RETH: { kind: "staked", referenceAsset: "ETH" },
  CBETH: { kind: "staked", referenceAsset: "ETH" },
  BTC: { kind: "major", referenceAsset: "BTC" },
  WBTC: { kind: "wrapped", referenceAsset: "BTC" },
};

const normalize = (address: string) => address.toLowerCase();

/**
 * Build the registry from the trusted, chain-specific token list. Symbol is used
 * only while CURATING that trusted list; classification lookup is address-only.
 */
export function assetRegistry(networkName: string): Map<string, AssetClassification> {
  const registry = new Map<string, AssetClassification>();
  for (const token of getSwapTokens(networkName)) {
    if (!token.address) continue;
    const curated = CURATED[token.symbol.toUpperCase()];
    registry.set(normalize(token.address), {
      address: token.address,
      symbol: token.symbol,
      kind: curated?.kind ?? "unknown",
      referenceAsset: curated?.referenceAsset,
      verified: Boolean(curated),
    });
  }
  return registry;
}

export function tokenAddress(networkName: string, symbol: string): string | undefined {
  return getSwapTokens(networkName).find(
    (token) => token.symbol.toUpperCase() === symbol.toUpperCase(),
  )?.address;
}

/** Stable/correlated classifications fail closed when either address is absent. */
export function classifyPairByAddress(
  baseAddress: string | undefined,
  quoteAddress: string | undefined,
  registry: ReadonlyMap<string, AssetClassification>,
): MarketFeeClass {
  if (!baseAddress || !quoteAddress) return "volatile";
  const base = registry.get(normalize(baseAddress));
  const quote = registry.get(normalize(quoteAddress));
  if (!base?.verified || !quote?.verified) return "volatile";

  if (base.kind === "fiat" && quote.kind === "fiat" && base.referenceAsset === quote.referenceAsset) {
    return "stable";
  }
  if (base.referenceAsset && base.referenceAsset === quote.referenceAsset) {
    return "correlated";
  }
  return "major";
}

export function suggestedFeeClassForPair(
  networkName: string,
  baseSymbol: string,
  quoteSymbol: string,
): MarketFeeClass {
  const registry = assetRegistry(networkName);
  return classifyPairByAddress(
    tokenAddress(networkName, baseSymbol),
    tokenAddress(networkName, quoteSymbol),
    registry,
  );
}
