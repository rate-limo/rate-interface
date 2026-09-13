/**
 * Native ↔ wrapped-native, which the swap card could not previously express.
 *
 * ## What was broken
 *
 * The matching engine trades ERC-20s. There is no native leg anywhere in the
 * execution path — `SwapCard` approves and calls `createOrder`, and never sends
 * a `value:`. On RISE the token the list showed as "ETH" was in fact the WETH
 * contract (`symbol()` reads "WETH" on chain; the "ETH" label came from an
 * `adminTokenMeta` override), so a wallet holding native ETH read a balance of
 * zero, the amount slider disabled itself, and there was no route to wrap.
 * The card's own comment recorded the symptom — "a wallet holding native ETH
 * reads zero here and is right to" — without the conclusion: correct balance,
 * unusable product.
 *
 * ## Two chains, two different truths
 *
 * These are NOT the same situation and must not share a code path:
 *
 *  - **RISE** — native ETH and WETH are different assets. Converting between
 *    them is a real operation, 1:1, done by `deposit()`/`withdraw()` on the
 *    WETH contract. That is `wrap` / `unwrap` below.
 *
 *  - **Arc** — the native gas asset IS USDC. The native view (18 decimals) and
 *    the ERC-20 at `0x3600…` (6 decimals) are one pool of funds behind two
 *    interfaces, not two assets. There is nothing to wrap, no contract to call,
 *    and no exchange rate — converting is meaningless. That is `same-asset`,
 *    and the UI must refuse it rather than route it. Treating it as a trade is
 *    what produced the `USDC/USDC` chart request that 404'd in a loop.
 *
 * A chain absent from `WRAPPED_NATIVE` simply has no native leg in this UI, so
 * every pair on it classifies as an ordinary `trade`.
 */

import type { SwapToken } from "./types";

/**
 * The address a native asset takes in the token list.
 *
 * The usual EIP-7528 sentinel. It is not a contract, so nothing may call
 * `decimals()`, `symbol()` or `balanceOf` on it — `isNativeAddress` exists so
 * every such call site can branch before it tries. On Arc in particular that
 * call reverts rather than returning a default.
 */
export const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function isNativeAddress(address: string): boolean {
  return address.toLowerCase() === NATIVE_SENTINEL.toLowerCase();
}

interface WrappedNative {
  /** The wrapped ERC-20 the engine actually trades. */
  address: string;
  /** What the wrapped token is really called — used to undo the "ETH" mislabel. */
  wrappedSymbol: string;
  /** The native asset's ticker, for the synthetic native entry. */
  nativeSymbol: string;
  nativeName: string;
  decimals: number;
}

/**
 * Chains where native and wrapped are genuinely different assets.
 *
 * Arc is deliberately ABSENT rather than mapped to USDC. Listing it here would
 * say "these two convert", which on Arc is false — see the header. Its
 * same-asset case is handled by `SAME_ASSET_NATIVE` instead.
 */
export const WRAPPED_NATIVE: Record<number, WrappedNative> = {
  // RISE Testnet. Verified on chain: symbol() is "WETH", and the bytecode
  // carries both deposit() (0xd0e30db0) and withdraw(uint256) (0x2e1a7d4d).
  11155931: {
    address: "0x008fCD6315c68EbAa31244aea174993f63Ef14D5",
    wrappedSymbol: "WETH",
    nativeSymbol: "ETH",
    nativeName: "Ether",
    decimals: 18,
  },
};

/**
 * Chains whose native asset is an ERC-20 on the same balance, where "converting"
 * is a category error rather than an operation.
 *
 * Arc: the ERC-20 USDC at `0x3600…`. Keyed by chain so the check cannot be
 * mistaken for a general native-token test.
 */
export const SAME_ASSET_NATIVE: Record<number, string> = {
  5042002: "0x3600000000000000000000000000000000000000",
};

export type SwapKind = "wrap" | "unwrap" | "same-asset" | "trade";

/**
 * What this pair of tokens actually is.
 *
 * Order matters: `same-asset` is tested before anything else, because on Arc a
 * native/USDC pair would otherwise look like a legitimate wrap to a check that
 * only asked "is one side native".
 */
export function classifySwap(pay: SwapToken, get: SwapToken, chainId: number): SwapKind {
  const payNative = isNativeAddress(pay.address);
  const getNative = isNativeAddress(get.address);

  // Same address on both legs is never a trade, whatever the chain.
  if (!payNative && !getNative && pay.address.toLowerCase() === get.address.toLowerCase()) {
    return "same-asset";
  }

  const sameAsset = SAME_ASSET_NATIVE[chainId]?.toLowerCase();
  if (sameAsset && (payNative || getNative)) {
    const other = (payNative ? get : pay).address.toLowerCase();
    if (other === sameAsset) return "same-asset";
  }

  const wrapped = WRAPPED_NATIVE[chainId];
  if (!wrapped) return "trade";
  const w = wrapped.address.toLowerCase();

  if (payNative && get.address.toLowerCase() === w) return "wrap";
  if (getNative && pay.address.toLowerCase() === w) return "unwrap";
  // Native against anything else is a trade the engine cannot serve directly —
  // the caller wraps first. Classifying it here would claim a route that the
  // execution path does not implement.
  return "trade";
}

/** The synthetic native entry for a chain's token list, or null where native is
 * not a separate asset. `priceUsd` is taken from the wrapped token, which is the
 * same asset priced 1:1 — a native entry with no price would render as $0. */
export function nativeTokenFor(chainId: number, wrappedPriceUsd: number): SwapToken | null {
  const wrapped = WRAPPED_NATIVE[chainId];
  if (!wrapped) return null;
  return {
    symbol: wrapped.nativeSymbol,
    name: wrapped.nativeName,
    address: NATIVE_SENTINEL,
    decimals: wrapped.decimals,
    chainId,
    priceUsd: wrappedPriceUsd,
  };
}

/**
 * Undo the display override that made this bug invisible.
 *
 * The wrapped token was listed as "ETH", so a native holder had every reason to
 * think their balance should appear. Once a real native entry exists the two
 * cannot both be called ETH, and the wrapped one is the one that is misnamed.
 */
export function correctWrappedSymbol(token: SwapToken): SwapToken {
  const wrapped = WRAPPED_NATIVE[token.chainId];
  if (!wrapped) return token;
  if (token.address.toLowerCase() !== wrapped.address.toLowerCase()) return token;
  if (token.symbol === wrapped.wrappedSymbol) return token;
  return { ...token, symbol: wrapped.wrappedSymbol };
}

/** Minimal WETH ABI — the two functions this file's whole purpose is to reach. */
export const wrappedNativeAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;
