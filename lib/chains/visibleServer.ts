import "server-only";
import { supportedChains } from "@/consts";
import { applyChainOverrides, parseChainOverrides } from "./overrides";

/**
 * Which chains to show, resolved on the SERVER.
 *
 * The client has had this since the overrides shipped: `useVisibleChains`
 * filters the build's list by the operator's decisions, and the token picker,
 * the deposit panel and the withdraw panel all honour it. The market tape did
 * not, because it renders server-side in the root layout and the rule lived
 * inside a `"use client"` module — so a chain an operator had hidden went on
 * scrolling across the top of every page, and its markets went on being
 * counted in the "N markets · N chains" label beside them.
 *
 * ## Degrades to the shipped list, deliberately
 *
 * No `IDENTITY_SERVICE_URL`, an unreachable service, a non-200, a malformed
 * body — all yield `supportedChains`. That is the safe direction and the same
 * one the hook takes: the page renders exactly what it was deployed with rather
 * than an empty tape because an unrelated service is down. It also means an
 * operator's "hide" does not take effect while identity-service is unreachable,
 * which is the correct trade for a cosmetic filter and is why nothing
 * security-shaped may be built on this.
 *
 * ## Cached, because this is in the root layout
 *
 * `SiteRows` renders on every page, so an uncached read here would put an
 * identity-service round trip in front of every request. Fifteen seconds
 * matches the hook's own `staleTime`: an operator hiding a chain expects it
 * gone in seconds, and the payload is a handful of booleans.
 */
export async function getVisibleChains(): Promise<string[]> {
  const base = process.env.IDENTITY_SERVICE_URL?.trim();
  if (!base) return [...supportedChains];

  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/chains/display`, {
      next: { revalidate: 15 },
    });
    if (!response.ok) return [...supportedChains];
    const { overrides } = parseChainOverrides(await response.json().catch(() => null));
    return applyChainOverrides(supportedChains, overrides);
  } catch {
    return [...supportedChains];
  }
}
