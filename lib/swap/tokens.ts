import defaultTokenlist from "@iter/token-list";
import { chainIds, chainIdToNetworkName } from "@/consts";
import type { SwapToken } from "./types";

/**
 * Token-list → SwapToken adapter for the swap card.
 *
 * The swap card needs a small, priced universe of tokens per network. We derive
 * it from the SAME source the landing tape uses — `@iter/token-list`
 * — because the chain indexers (the live price/quote source) are down. Every
 * SwapToken carries a `priceUsd`; the mock `quoteSwap` divides by it, so the
 * invariant this file guarantees is **priceUsd > 0 for every token returned**.
 *
 * Prices are the token list's LISTING prices (against the USDC/USDT hub), not a
 * live feed. When indexers return, swap the price source here — the SwapToken
 * shape and the card stay put. See apps/web/CLAUDE.md ("Swap page & swap card").
 */

const HUB_SYMBOL = "USDC";
const STABLES = new Set(["USDC", "USDT"]);
/** Last-resort price so a token with no priced path never yields NaN downstream. */
const FALLBACK_PRICE = 1;

interface RawToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}
interface RawPair {
  base: RawToken;
  quote: RawToken;
  listing_price?: number;
}

/** Stable, deterministic avatar colour when a token has no logoURI. */
const AVATAR_COLORS = [
  "#3987e5",
  "#c98500",
  "#2ba563",
  "#d55181",
  "#7c5cff",
  "#d95926",
  "#199e70",
  "#5f93d6",
];
export function tokenColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function chainIdOf(networkName: string): number | undefined {
  return chainIds[networkName];
}

/**
 * Build a symbol→USD price map for one chain via a small fixpoint: seed stables
 * at 1, then repeatedly price any token that shares a pair with an already-priced
 * token (base↔quote in either direction). Converges in a couple of passes for a
 * hub-and-spoke list; anything still unpriced falls back to a nonzero default.
 */
function buildPriceMap(pairs: RawPair[]): Map<string, number> {
  const price = new Map<string, number>();
  for (const s of STABLES) price.set(s, 1);

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const p of pairs) {
      const lp = p.listing_price;
      if (!lp || lp <= 0) continue;
      const b = p.base.symbol;
      const q = p.quote.symbol;
      // listing_price is the price of `base` denominated in `quote`.
      if (!price.has(b) && price.has(q)) {
        price.set(b, lp * (price.get(q) as number));
        changed = true;
      } else if (!price.has(q) && price.has(b)) {
        price.set(q, (price.get(b) as number) / lp);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return price;
}

function toSwapToken(raw: RawToken, priceUsd: number): SwapToken {
  return {
    symbol: raw.symbol,
    name: raw.name,
    address: raw.address,
    decimals: raw.decimals,
    chainId: raw.chainId,
    priceUsd: priceUsd > 0 ? priceUsd : FALLBACK_PRICE,
    logoURI: raw.logoURI,
  };
}

/**
 * All swappable tokens on `networkName`, priced and deduped by symbol.
 * Derived from the pairs on that chain (they carry decimals + logoURI). Pure/sync.
 */
export function getSwapTokens(networkName: string): SwapToken[] {
  const chainId = chainIdOf(networkName);
  if (chainId == null) return [];

  const allPairs = (defaultTokenlist.pairs ?? []) as unknown as RawPair[];
  const pairs = allPairs.filter((p) => p.base.chainId === chainId);
  const priceMap = buildPriceMap(pairs);

  const bySymbol = new Map<string, SwapToken>();
  for (const p of pairs) {
    for (const raw of [p.base, p.quote]) {
      if (bySymbol.has(raw.symbol)) continue;
      bySymbol.set(raw.symbol, toSwapToken(raw, priceMap.get(raw.symbol) ?? 0));
    }
  }

  // Hub first, then by descending USD price (majors surface at the top).
  return [...bySymbol.values()].sort((a, b) => {
    if (a.symbol === HUB_SYMBOL) return -1;
    if (b.symbol === HUB_SYMBOL) return 1;
    return b.priceUsd - a.priceUsd;
  });
}

/** The hub token (USDC) on `networkName`, or a priced fallback if absent. */
export function getHubToken(networkName: string): SwapToken {
  const tokens = getSwapTokens(networkName);
  const hub = tokens.find((t) => t.symbol === HUB_SYMBOL);
  if (hub) return hub;
  return {
    symbol: HUB_SYMBOL,
    name: "USD Coin",
    address: "",
    decimals: 6,
    chainId: chainIdOf(networkName) ?? 0,
    priceUsd: 1,
  };
}

/**
 * Two distinct non-hub tokens for the card's initial state (never the same token
 * on both sides — the picker treats "pick the other side's token" as a flip).
 * Falls back to the hub if the list is thin.
 */
export function defaultSwapPair(networkName: string): { pay: SwapToken; get: SwapToken } {
  const tokens = getSwapTokens(networkName);
  const hub = getHubToken(networkName);
  const nonHub = tokens.filter((t) => t.symbol !== HUB_SYMBOL);
  const pay = nonHub[0] ?? hub;
  const get = nonHub.find((t) => t.symbol !== pay.symbol) ?? hub;
  return { pay, get };
}

export { chainIdToNetworkName };
