import { findChain } from "@iter/deployments";

/**
 * The operator's chain-visibility rule, with no React and no `"use client"`.
 *
 * It lived in `useVisibleChains`, which is a client module, so the SERVER had
 * no way to ask the same question — and the market tape, rendered server-side
 * in the root layout, went on listing chains an operator had hidden. Two
 * answers to "which chains do we show" is the drift this repo keeps deleting,
 * so there is one implementation and both sides import it.
 *
 * The rule only ever REMOVES. Gateway and websocket URLs are compiled in
 * (`PonderLinks` / `PonderWssLinks`), so nothing arriving over the wire can
 * give this app an endpoint it did not ship with; admin-service enforces the
 * same thing from its side by refusing to enable a chain outside
 * `SUPPORTED_CHAINS`.
 */
export interface ChainDisplayOverrides {
  /** chainId (as a string key) -> shown. Only explicit decisions appear. */
  overrides: Record<string, boolean>;
}

export const NO_CHAIN_OVERRIDES: ChainDisplayOverrides = { overrides: {} };

/**
 * Apply the overrides to a list of network NAMES.
 *
 * Pure and exported so it can be tested without a query client — the filtering
 * rule is the part worth pinning, not the fetch.
 */
export function applyChainOverrides(
  names: readonly string[],
  overrides: Record<string, boolean>,
): string[] {
  return names.filter((name) => {
    const chain = findChain(name);
    // A name the registry cannot resolve is left alone rather than dropped: it
    // shipped in `supportedChains`, and silently removing it here would hide a
    // chain for a reason no operator chose.
    if (!chain) return true;
    const override = overrides[String(chain.chainId)];
    return override === undefined ? true : override;
  });
}

/**
 * Read `{ overrides }` out of whatever `/chains/display` returned.
 *
 * Shared by the hook and the server reader so a malformed body means the same
 * thing on both: no overrides, and therefore the build's own list.
 */
export function parseChainOverrides(body: unknown): ChainDisplayOverrides {
  if (!body || typeof body !== "object") return NO_CHAIN_OVERRIDES;
  const raw = (body as Partial<ChainDisplayOverrides>).overrides;
  if (!raw || typeof raw !== "object") return NO_CHAIN_OVERRIDES;
  const overrides: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean") overrides[key] = value;
  }
  return { overrides };
}
