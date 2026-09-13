"use client";

import { useSyncExternalStore } from "react";
import { findChain } from "@iter/deployments";

/**
 * A chain's operator-set presentation: label, logo, brand colour, gas-token mark.
 *
 * Until 2026-09-03 nothing in this app read it. Icons came from
 * `getChainIconUrl`, a lookup into the BUILD-TIME `evmNetworks` list — so an
 * operator could upload a chain logo in the panel, see it saved, and watch the
 * app keep rendering a generated badge. The row and the bytes were both fine;
 * there was no reader.
 *
 * That list is gone. Its two icon URLs were dead `pbs.twimg.com` links, so the
 * lookup returned a broken URL and then, once they were removed, `undefined` —
 * a fallback nothing could fill. **This is now the only source of a chain mark**,
 * and a chain with no upload renders the badge's initials.
 *
 * ## No QueryClientProvider, deliberately
 *
 * This started as `useQuery`, and that was wrong for what reads it. `ChainBadge`
 * is an ATOM: it renders on every token row, pair row, pool row and transaction
 * row in the app. Making it throw without a provider gives a component whose
 * only job is picking an image the power to take down whatever mounts it — and
 * that is not hypothetical, it broke twelve existing component tests the moment
 * it landed. Wrapping those tests in a provider would have hidden the coupling
 * rather than removed it, and left the next provider-free mount to find it at
 * runtime.
 *
 * So: a module-level store plus `useSyncExternalStore`. One fetch per session
 * shared by every subscriber, no provider anywhere, and a component that renders
 * fine mounted bare. The subscription is what makes the late answer arrive —
 * without it the first render's empty map would stick and the upload would still
 * never appear.
 *
 * ## Every failure degrades to the caller's fallback
 *
 * An unreachable admin-service, a malformed body, no network: all resolve to an
 * empty map, and `chainIconFrom`/`nativeIconFrom` then return exactly the
 * build-time icon the app rendered before. A chain mark must never blank because
 * a service is down.
 */
export interface ChainBrand {
  chainId: number;
  label: string | null;
  logoURI: string | null;
  nativeCurrencyLogoURI: string | null;
  brandColorHex: string | null;
}

export type ChainBrands = Record<string, ChainBrand>;

/** Shared across every subscriber. A stable empty object, so a component that
 * renders before the fetch resolves does not see a new identity each render. */
const EMPTY: ChainBrands = {};

let snapshot: ChainBrands = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function publish(next: ChainBrands): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Fetched once per session. A logo changes when an operator uploads one, which
 * is rare, and the alternative is a request per table render. */
function start(): void {
  if (started) return;
  started = true;
  void fetch("/chain-brand")
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { chains?: ChainBrand[] } | null) => {
      if (!body || !Array.isArray(body.chains)) return;
      publish(Object.fromEntries(body.chains.map((c) => [String(c.chainId), c])));
    })
    .catch(() => {
      // Deliberately silent. The caller's fallback is the build-time icon, which
      // is what the app rendered before this existed.
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;
/** The server has no operator overrides to offer, and rendering one on the first
 * client pass would mismatch. Same hydration rule as the consent banner. */
const getServerSnapshot = () => EMPTY;

export function useChainBrand(): { data: ChainBrands } {
  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { data };
}

/**
 * The icon for a chain by NAME, preferring the operator's upload.
 *
 * Name in, because that is what every caller has — `supportedChains` is a list
 * of names and a token row carries its network's name, while the chainId needed
 * to look up a brand row comes from the registry.
 *
 * Resolving name → id through the registry rather than trusting a caller's id is
 * the same rule `lib/search/explorer.ts` follows, and for the same reason: the
 * repo does not agree with itself on every number (`consts.chainIds` puts MegaETH
 * at 6342 while `deployments.json` says 6343).
 */
export function chainIconFrom(
  brands: ChainBrands | undefined,
  networkName: string,
): string | undefined {
  const chainId = findChain(networkName)?.chainId;
  // `?? undefined` because `logoURI` is nullable: a chainMeta row exists for
  // every chain an operator has touched, and most carry nulls. The old
  // `?? fallback` collapsed that by accident; without it a null would reach
  // `<img src>` as the string "null" and request /null.
  return (chainId ? brands?.[String(chainId)]?.logoURI : undefined) ?? undefined;
}

/**
 * The same mark, by chain id, for chains the BUILD has never heard of.
 *
 * `chainIconFrom` resolves a name through `findChain`, which reads
 * `@iter/deployments` — so it answers only for chains this venue trades on. The
 * cross-chain deposit list names two dozen chains Circle bridges and Iter does
 * not serve (Arbitrum Sepolia, Polygon Amoy, …), and `findChain` returns
 * undefined for every one of them.
 *
 * The brands map is already keyed by chain id, so this needs no new fetch and no
 * new endpoint — only to stop going through a registry that cannot know these
 * chains. Nothing resolves for them TODAY, because `chainMeta` rows can only be
 * written for a chain some registry knows; the caller falls back to initials,
 * which is this app's established answer for a chain with no upload.
 *
 * Do NOT fill that gap with a third-party icon URL. `getChainIconUrl` and
 * `evmNetworks` were deleted precisely because their "fallback" was a hotlink to
 * a host this project does not control, and a broken image beats no image only
 * until the host goes away.
 */
export function chainIconById(brands: ChainBrands | undefined, chainId: number): string | undefined {
  return brands?.[String(chainId)]?.logoURI ?? undefined;
}

/**
 * The GAS TOKEN's mark for a chain — a different image from the chain's own.
 *
 * `chainMeta` carries both columns on purpose, and its docstring is explicit
 * about why: a chain's mark identifies the NETWORK in a switcher, a native
 * currency's mark identifies the ASSET in a balance, a swap leg or a gas
 * estimate. A rollup whose gas token is ETH does not use its own logo for the
 * ether, and rendering one where the other belongs claims the rollup issued it.
 *
 * ## `symbol` decides, and it is compared against THE REGISTRY
 *
 * Not against a hardcoded list. `utils/order.ts`'s `isNativeSymbol` is one —
 * `ETH || NEON || INJ || IP || MON || STT` — and it does not contain USDC, so it
 * does not recognise Arc's gas asset at all. The registry declares
 * `nativeCurrency.symbol` per chain, which is right for every chain including
 * the ones nobody thought of when that list was written.
 *
 * ## This is the MARK only — never let it reach balance arithmetic
 *
 * apps/web/CLAUDE.md records the trap in detail: `useBalances.ts` finds the
 * native token with `token.symbol === "ETH"`, and "fixing" that to match the
 * native symbol generically formats Arc's value with the wrong decimals (its
 * native view is 18, the USDC ERC-20 is 6 — a 10^12 error) or lists USDC twice
 * and double-counts one balance. Choosing an image has none of those
 * consequences, which is exactly why this helper answers a question about pixels
 * and nothing else.
 *
 * Returns `fallback` unless this really is the chain's gas token AND an operator
 * uploaded a mark for it — so a chain with no upload renders what it always did.
 */
export function nativeIconFrom(
  brands: ChainBrands | undefined,
  networkName: string | undefined,
  symbol: string | undefined,
  fallback: string | undefined,
): string | undefined {
  if (!networkName || !symbol) return fallback;
  const chain = findChain(networkName);
  if (!chain) return fallback;
  if (chain.nativeCurrency.symbol.toUpperCase() !== symbol.trim().toUpperCase()) return fallback;
  return brands?.[String(chain.chainId)]?.nativeCurrencyLogoURI ?? fallback;
}
