import { feeTokenOptions } from "@/lib/chains/gasToken";
import type { SwapToken } from "@/lib/swap/types";

/**
 * The chain's fee tokens, added to a token list that lacks them, for balance reads.
 *
 * Wallet balances are read for the tokens the gateway lists, which are the tokens some
 * market trades. Tempo's fee stablecoins (AlphaUSD, BetaUSD, ThetaUSD) are in no market,
 * so a wallet holding $3M of them showed $1M of net worth -- while the wallet menu's fee
 * picker listed all four. A wallet holds its gas asset whether or not anything trades
 * it. Every listed fee token is a USD stablecoin, so it is valued at $1.
 */
export function withFeeTokens(chainId: number | undefined, tokens: readonly SwapToken[]): SwapToken[] {
  const options = feeTokenOptions(chainId);
  if (chainId === undefined || options.length === 0) return [...tokens];
  const have = new Set(tokens.map((t) => t.address.toLowerCase()));
  // Borrow the listed default's logo (PathUSD is indexed: every Tempo pair quotes it).
  const logoURI = tokens.find((t) => t.address.toLowerCase() === options[0]!.address.toLowerCase())?.logoURI;
  const missing = options
    .filter((o) => !have.has(o.address.toLowerCase()))
    .map((o): SwapToken => ({
      symbol: o.symbol,
      name: o.symbol,
      address: o.address,
      decimals: o.decimals,
      chainId,
      priceUsd: 1,
      logoURI,
    }));
  return [...tokens, ...missing];
}
