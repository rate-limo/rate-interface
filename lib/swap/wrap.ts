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

import type { SwapQuote, SwapToken } from "./types";

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
  // Monad Testnet: the engine's WETH9 (0x7Eff…65D8), deployed 2026-10-02. Its own
  // symbol() reads "WETH" because WETH9 hardcodes it; on this chain it wraps MON.
  10143: {
    address: "0x7Eff1500024D9393BE3Ad2B5e643C540018365D8",
    wrappedSymbol: "WMON",
    nativeSymbol: "MON",
    nativeName: "Monad",
    decimals: 18,
  },
  // Robinhood Chain Testnet: the engine's WETH9, deployed 2026-10-02.
  46630: {
    address: "0x14325a62d71848c1Ed358CEA3EfAE883920C13bf",
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

/**
 * Whether changing the pay token invalidates the amount already typed.
 *
 * The amount on the swap card is an ABSOLUTE quantity of the pay token, and the
 * slider's whole track is `[0, that token's balance]`. So when the pay token
 * changes, the number stops meaning anything: the thumb re-scales against a
 * balance the figure was never sized against, and commonly pins at 100% while
 * the input above it still shows the old number. The two controls then actively
 * disagree, and `insufficientBalance` can fail an amount nobody typed for that
 * token.
 *
 * `same-asset` is the exception, and it is the reason this is a function rather
 * than an address comparison. On Arc the native asset and the ERC-20 at
 * `0x3600…` are one pool of funds behind two interfaces — flipping between them
 * changes `pay.address` while the spendable balance and the meaning of the
 * number are identical, so clearing there would throw away a valid amount.
 * `classifySwap` already answers this, including for the same address on both
 * legs, and routing through it is what stops a second opinion about what "the
 * same asset" means from growing here.
 */
export function payChangeClearsAmount(
  previous: SwapToken,
  next: SwapToken,
  chainId: number,
): boolean {
  /*
   * A different CHAIN always clears, and `classifySwap` cannot say so — it takes
   * one `chainId` and compares addresses, so two deployments of one token at the
   * same address (which CREATE2 produces routinely; Multicall3 is identical on
   * every chain) would classify as `same-asset` and carry an amount across a
   * re-home. The balance there is a different balance in every sense that
   * matters.
   */
  if (previous.chainId !== next.chainId) return true;
  return classifySwap(previous, next, chainId) !== "same-asset";
}

/**
 * The quote for a wrap, computed here because there is nothing to ask.
 *
 * A wrap is `deposit()` / `withdraw()` on the wrapped contract: exactly 1:1, no
 * book, no pool, no counterparty and no protocol fee. `execution.ts` has
 * implemented it that way all along — it branches to the contract BEFORE any
 * pool lookup, precisely because "a wrap has no pool by design".
 *
 * The card did not follow. It sent every pair to `useRouteQuote`, which asked
 * the gateway for a route between two tokens that share no market. The request
 * failed, `quote.execution` stayed undefined, and the primary button was
 * disabled on a conversion the execution path could have performed. `isWrapKind`
 * was computed in the card for exactly this and read by nothing.
 *
 * On RISE it is one pick away, in the direction that is easy to get backwards:
 * the card opens paying the WRAPPED token, because `initial` takes the static
 * list's "ETH" entry and on RISE that entry is the WETH contract. So the first
 * reachable conversion is an UNWRAP. See `SwapCard.wrap.test.tsx`, which pins
 * it.
 *
 * Every figure below is exact rather than estimated, which is the unusual part
 * and the reason this is not a fallback shaped like a quote:
 *
 * - **`delivered` is `amountIn`.** Not approximately — the contract mints one
 *   for one.
 * - **`minReceived` is `amountIn` too**, so slippage is not applied. There is no
 *   price to slip against, and a `minReceived` below the amount would imply a
 *   worse fill is possible when none is.
 * - **`impactPct` and `feeUsd` are 0 because they ARE zero**, not because they
 *   are unknown. This is the one place on the card where that distinction runs
 *   the other way from the usual em-dash rule.
 * - **`hops` is empty and `placements` is empty.** A wrap has no hop to break
 *   down and nothing can fail to fill, so there is never a remainder.
 *
 * No `execution` field: that carries the gateway's router path, and the wrap
 * never touches the router. Callers gate on the KIND rather than on its
 * presence — fabricating a path here would put a route into a structure that
 * something later could try to send.
 */
export function wrapQuote(pay: SwapToken, get: SwapToken, amountIn: number): SwapQuote {
  const amount = Number.isFinite(amountIn) && amountIn > 0 ? amountIn : 0;
  // Priced off the PAY leg for both sides. Native and wrapped are the same asset
  // at the same price, and `nativeTokenFor` already seeds the native entry's
  // price from its twin — so reading `get.priceUsd` for the receive side would
  // reintroduce a second source for one number.
  const usd = amount * (Number.isFinite(pay.priceUsd) ? pay.priceUsd : 0);
  return {
    amountIn: amount,
    payUsd: usd,
    route: [pay, get],
    hops: [],
    delivered: amount,
    deliveredUsd: usd,
    placedUsd: 0,
    placements: [],
    impactPct: 0,
    minReceived: amount,
    feeUsd: 0,
  };
}
