import defaultTokenlist from "@iter/token-list";
import {
  chainIdToNetworkName,
  networkNameToSlug,
  supportedChains,
} from "@/consts";

/**
 * Landing-page market data.
 *
 * The running tape and the "N markets · N chains" lead label are built from the
 * SAME set the rest of the app deploys against — `supportedChains` (the rollout
 * allowlist, now in @iter/deployments and currently RISE alone). We deliberately
 * do NOT surface chains that aren't live: every row on the tape links to a
 * `/{slug}/trade/{base}/{quote}` page that actually resolves, and every price is
 * a real listing price from the token list — nothing on the landing page implies
 * a market you can't yet trade.
 *
 * Prices here are the token list's LISTING prices, not a live feed (the chain
 * indexers are the live source). When those are wired in, swap `price` for the
 * live last price; the component markup does not change.
 */

export interface TapePair {
  base: string;
  quote: string;
  network: string;
  slug: string;
  price: number;
  href: string;
}

export interface ChainMarkets {
  network: string;
  slug: string;
  markets: number;
}

export interface MarketTapeData {
  pairs: TapePair[];
  byChain: ChainMarkets[];
  counts: { chains: number; markets: number; tokens: number };
}

// Fixed categorical colour slot per chain, so the dot colour is stable across
// renders (matches the chain chips used in the cross-chain market search).
const CHAIN_HUE: Record<string, number> = {
  "Monad Testnet": 1,
  "Ink Sepolia": 2,
  Story: 3,
  "MegaETH Testnet": 4,
  "RISE Testnet": 5,
  "Somnia Testnet": 6,
};

export function chainHue(network: string): number {
  return CHAIN_HUE[network] ?? 1;
}

// Categorical dot colour per chain (dark-surface tuned — the tape and strip sit
// on the dark hero backdrop). Keyed by hue slot for stability.
const HUE_COLOR: Record<number, string> = {
  1: "#3987e5",
  2: "#d95926",
  3: "#199e70",
  4: "#c98500",
  5: "#d55181",
  6: "#2ba563",
};

export function chainColor(network: string): string {
  return HUE_COLOR[chainHue(network)] ?? HUE_COLOR[1];
}

interface RawToken {
  chainId: number;
  symbol: string;
}
interface RawPair {
  base: RawToken;
  quote: RawToken;
  listing_price?: number;
}

const supported = new Set(supportedChains);

function networkOf(chainId: number): string | undefined {
  return chainIdToNetworkName[String(chainId)];
}

export function getMarketTapeData(): MarketTapeData {
  const pairsRaw = (defaultTokenlist.pairs ?? []) as unknown as RawPair[];
  const tokensRaw = (defaultTokenlist.tokens ?? []) as unknown as RawToken[];

  const seen = new Set<string>();
  const pairs: TapePair[] = [];
  const perChain = new Map<string, number>();

  for (const p of pairsRaw) {
    const network = networkOf(p.base.chainId);
    if (!network || !supported.has(network)) continue;
    const slug = networkNameToSlug[network];
    if (!slug) continue;

    const key = `${network}:${p.base.symbol}/${p.quote.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push({
      base: p.base.symbol,
      quote: p.quote.symbol,
      network,
      slug,
      price: p.listing_price ?? 0,
      href: `/trade/pro?chain=${slug}&base=${p.base.symbol}&quote=${p.quote.symbol}`,
    });
    perChain.set(network, (perChain.get(network) ?? 0) + 1);
  }

  const tokenSet = new Set<string>();
  for (const t of tokensRaw) {
    const network = networkOf(t.chainId);
    if (network && supported.has(network)) tokenSet.add(`${network}:${t.symbol}`);
  }

  const byChain: ChainMarkets[] = [...perChain.entries()]
    .map(([network, markets]) => ({
      network,
      slug: networkNameToSlug[network],
      markets,
    }))
    .sort((a, b) => b.markets - a.markets);

  return {
    pairs,
    byChain,
    counts: {
      chains: byChain.length,
      markets: pairs.length,
      tokens: tokenSet.size,
    },
  };
}

/** "$96,277" / "$2.00" / "$0.0012" — neutral, no live-feed decoration. */
export function formatTapePrice(p: number): string {
  if (!p || p <= 0) return "—";
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
}
