"use client";

import { useQuery } from "@tanstack/react-query";
import { findChain } from "@iter/deployments";
import { applyChainOverrides, parseChainOverrides, type ChainDisplayOverrides } from "./overrides";
import { AggregatorLink, supportedChains } from "@/consts";

/**
 * Which chains to SHOW, filtering the build's list by an operator's overrides.
 *
 * ## The build stays in charge of what CAN be served
 *
 * `supportedChains` is compiled in, and so are each chain's gateway URLs
 * (`PonderLinks` / `PonderWssLinks`). Nothing fetched at runtime can give this
 * app an endpoint it did not ship with, so this hook only ever REMOVES entries.
 * admin-service enforces the same rule from its side: `POST /api/chains/:id/display`
 * refuses to enable a chain that is not in `SUPPORTED_CHAINS`, because a flag
 * that appeared to add one would be a control that reports success and changes
 * nothing.
 *
 * The upshot is a small, honest feature: an operator can hide a chain — during
 * an incident, or a testnet reset — without a deploy, which previously required
 * editing `SUPPORTED_CHAINS` and shipping a build.
 *
 * ## Degrades to the shipped list, deliberately
 *
 * Any failure — admin-service down, a malformed body, a chain the registry does
 * not know — yields the build's own list. That is the safe direction: the app
 * renders exactly what it was deployed with, rather than an empty chain
 * switcher because an unrelated service is unreachable. It also means an
 * operator's "hide" does not take effect if the service is down, which is the
 * correct trade for a cosmetic filter and is why nothing security-shaped may be
 * built on this.
 *
 * A chain with no override, or a `null` one, is simply absent from the response
 * — silence and "use the default" are the same instruction.
 */
// The rule itself lives in ./overrides, with no "use client", so the server can
// apply the same one — see that module.
export { applyChainOverrides, type ChainDisplayOverrides };

export function useChainDisplayOverrides() {
  return useQuery({
    queryKey: ["chain-display"],
    // Short: an operator hiding a chain expects it gone in seconds, and the
    // payload is a handful of booleans.
    staleTime: 15_000,
    queryFn: async (): Promise<ChainDisplayOverrides> => {
      const response = await fetch("/chains/display");
      if (!response.ok) return parseChainOverrides(null);
      return parseChainOverrides(await response.json().catch(() => null));
    },
  });
}


/**
 * Which chains the AGGREGATOR is actually fanning out to.
 *
 * ## Why ask a service at all when the list is compiled in
 *
 * `supportedChains` says which chains this BUILD can talk to. It does not say
 * which ones the platform is currently serving, and the two drift: the
 * aggregator's `AGGREGATOR_UPSTREAMS` (one variable, in the `platform`
 * environment on Railway) is where that decision is actually made, and it can
 * change without a web deploy. A chain in the switcher whose gateway the
 * aggregator does not fan out to is a scope a reader can select and then get no
 * cross-chain rows for — the control reports a choice the platform cannot honour.
 *
 * ## Still only ever REMOVES
 *
 * Same rule as the operator overrides above, for the same reason: gateway and
 * websocket URLs are compiled in (`PonderLinks` / `PonderWssLinks`), so a name
 * arriving over the wire cannot give this app an endpoint it did not ship with.
 * A served chain the build does not carry is ignored rather than rendered.
 *
 * ## Degrades to the shipped list
 *
 * Unreachable, malformed, or an empty intersection all yield the build's own
 * list. An empty switcher because one service is down is strictly worse than a
 * switcher that is briefly too generous, and the same call `useChainDisplayOverrides`
 * already makes.
 */
export function useServedChains() {
  return useQuery({
    queryKey: ["aggregator-chains"],
    // The set of upstreams changes at deploy cadence, not request cadence, and
    // this gates rendering a dropdown — a minute of staleness is invisible, a
    // fetch per open is not.
    staleTime: 60_000,
    queryFn: async (): Promise<string[] | null> => {
      const response = await fetch(`${AggregatorLink}/api/chains`);
      if (!response.ok) return null;
      const body: unknown = await response.json().catch(() => null);
      if (!body || typeof body !== "object") return null;
      const raw = (body as { chains?: unknown }).chains;
      if (!Array.isArray(raw)) return null;
      const chains = raw.filter((entry): entry is string => typeof entry === "string");
      return chains.length > 0 ? chains : null;
    },
  });
}

/**
 * Narrow a list of network NAMES to those the aggregator serves.
 *
 * Pure and exported for the same reason `applyChainOverrides` is: the rule is
 * the part worth pinning. `null` (or an empty answer, or one that intersects
 * with nothing) means "unknown" and leaves the list alone.
 */
export function applyServedChains(
  names: readonly string[],
  served: readonly string[] | null | undefined,
): string[] {
  if (!served || served.length === 0) return [...names];
  // Names come from the same vocabulary on both sides (`@iter/token-list`), but
  // they are hand-typed into a Railway variable, so match forgivingly on case
  // and surrounding space rather than dropping a chain over a stray capital.
  const key = (name: string) => name.trim().toLowerCase();
  const servedKeys = new Set(served.map(key));
  const kept = names.filter((name) => servedKeys.has(key(name)));
  // No overlap at all is a misconfiguration on one side or the other, not a
  // platform with no chains. Say what shipped rather than nothing.
  return kept.length > 0 ? kept : [...names];
}

/**
 * The chains to offer: what the build ships, narrowed to what the aggregator
 * serves, minus anything an operator has switched off.
 *
 * Build order is preserved throughout — both layers filter, neither reorders,
 * so the switcher does not reshuffle itself when a service answers.
 */
export function useVisibleChains(): string[] {
  const { data: overrides } = useChainDisplayOverrides();
  const { data: served } = useServedChains();
  return applyChainOverrides(
    applyServedChains(supportedChains, served),
    overrides?.overrides ?? {},
  );
}

/**
 * The chain list to REQUEST from the aggregator.
 *
 * ## The bug this exists for
 *
 * Hiding a chain in admin removed it from the ChainSwitcher and the TokenPicker —
 * the two surfaces that called `useVisibleChains` — and left its assets in every
 * cross-chain list on Explore. An operator hid RISE, saw it vanish from the
 * dropdown, and its tokens kept ranking in Popular. The flag was filtering the
 * PICKERS while the DATA came from a fan-out that had never heard of it.
 *
 * So the resolution lives here rather than at each call site: four components
 * consume the aggregator (tokens, pairs, transactions, auctions) and a fifth will
 * be written eventually. `ChainBadge` is the precedent — the thing that knows the
 * answer asks for it, instead of N callers each remembering to.
 *
 * ## Restricting at the source, not after the merge
 *
 * The result is passed as `?chains=`, which narrows the aggregator's own fan-out.
 * Filtering the merged page client-side would return fewer rows than `pageSize`
 * asked for, so a hidden chain would leave visible gaps in the ranking rather
 * than simply not being in it.
 *
 * An explicit choice always wins: the scope control passes one chain and gets
 * exactly that. It is drawn from the visible list, so it cannot name a hidden one.
 *
 * Inherits `useVisibleChains`'s degradation: any failure yields the shipped list,
 * so an unreachable identity-service shows everything rather than nothing. A hide
 * is cosmetic and nothing security-shaped may rest on it.
 */
export function useAggregatorChains(explicit?: readonly string[]): readonly string[] {
  return resolveAggregatorChains(explicit, useVisibleChains());
}

/** The choice itself, split out so it can be pinned without a query client. */
export function resolveAggregatorChains(
  explicit: readonly string[] | undefined,
  visible: readonly string[],
): readonly string[] {
  // An EMPTY explicit array is not a request for nothing — no caller means it,
  // and honouring it would ask the aggregator for zero chains and render an
  // empty page. Absent and empty both mean "you decide".
  return explicit && explicit.length > 0 ? explicit : visible;
}
