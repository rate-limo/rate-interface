import { wagmiChains } from "@/lib/customChains";

/**
 * The block explorer for a network, by the name `MarketPageProvider` uses.
 *
 * Read from the active wagmi chain list rather than the larger historical chain
 * registry. This intentionally returns undefined for dormant networks so they
 * cannot leak back into web-facing wallet and explorer UI.
 */
export function explorerUrlForNetwork(networkName: string): string | undefined {
    if (!networkName) return undefined;
    const chain = wagmiChains.find((c) => c.name === networkName);
    return chain?.blockExplorers?.default?.url;
}
