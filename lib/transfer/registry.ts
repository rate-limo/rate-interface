import type { TransferRoute } from "@iter/types";

/**
 * The client half of the cross-chain route registry.
 *
 * Nothing here decides whether a route EXISTS — identity-service already
 * filtered out `demo` rows and the wrong direction, and a route only reached the
 * database by being proved. This module answers the two questions the panel can
 * settle on its own: which chains can send me this asset, and may this amount go.
 */

export type LimitCheck = { ok: true } | { ok: false; reason: string };

export function withinLimits(route: TransferRoute, amount: number): LimitCheck {
  // NaN before the comparisons, or an empty input silently reads as "below the
  // minimum" and reports a number the user did not type.
  if (!Number.isFinite(amount)) return { ok: false, reason: "Enter an amount" };
  if (amount <= 0) return { ok: false, reason: "Enter an amount" };
  if (amount < route.minAmount) return { ok: false, reason: `Minimum is ${route.minAmount}` };
  if (route.maxAmount !== null && amount > route.maxAmount) {
    return { ok: false, reason: `Maximum is ${route.maxAmount}` };
  }
  return { ok: true };
}

/**
 * The leg for the chain a deposit lands ON, or null when there is none.
 *
 * The destination must itself be a proved, offered leg: a provider that cannot
 * mint here is not a route into here, however many chains can burn.
 */
export function destinationLeg(
  routes: readonly TransferRoute[],
  asset: string,
  destinationChainId: number,
): TransferRoute | null {
  return (
    routes.find((route) => route.asset === asset && route.chainId === destinationChainId) ?? null
  );
}

/**
 * The chains this asset can be sent FROM, to arrive on `destinationChainId`.
 *
 * A route row describes one LEG — an asset on one chain, over one provider. A
 * transfer needs two legs of the same asset on the same rail, so a source is a
 * row sharing the destination's `asset` and `provider` on a different chain.
 *
 * Matched on `asset` and not on `tokenAddress`, which looks like a violation of
 * this codebase's address-keying rule and is not: the same asset has a DIFFERENT
 * address on every chain — USDC is 0x3600… on Arc and 0x036c… on Base Sepolia —
 * so an address cannot find the other legs at all. See the field's docstring in
 * @iter/types for why the symbol is trustworthy here specifically.
 *
 * Returns [] rather than throwing when the destination has no leg. That is the
 * common case — most assets on most chains have no bridge — and it is what makes
 * the panel render nothing instead of an error.
 */
export function sourcesFor(
  routes: readonly TransferRoute[],
  asset: string,
  destinationChainId: number,
): TransferRoute[] {
  const destination = destinationLeg(routes, asset, destinationChainId);
  if (!destination) return [];

  return routes.filter(
    (route) =>
      route.asset === asset &&
      route.provider === destination.provider &&
      route.chainId !== destinationChainId,
  );
}
