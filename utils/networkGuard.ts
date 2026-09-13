/**
 * Trade-time wallet/viewing-network guard.
 *
 * `displayChainId` is whatever chain the trader is currently BROWSING (driven by the
 * ChainSwitcher / route, independent of the wallet — see MarketPageProvider). `connectedChainId`
 * is the chain the connected wallet actually lives on. Browsing any chain is free; submitting
 * an order is not — an order signed while the two disagree would be built against the wrong
 * chain's matching engine. `needsNetworkSwitch` is the single source of truth for that check,
 * used by PlaceOrderButton to swap the submit button for a "switch network" prompt.
 */
export function needsNetworkSwitch(
  displayChainId: number | undefined,
  connectedChainId: number | undefined
): boolean {
  return connectedChainId !== displayChainId;
}
