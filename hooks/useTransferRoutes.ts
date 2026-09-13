"use client";

import { useQuery } from "@tanstack/react-query";
import type { TransferDirection, TransferRoute } from "@iter/types";

/**
 * The cross-chain routes on offer, from identity-service.
 *
 * ## It degrades to NO routes, deliberately
 *
 * Every failure — identity-service down, a malformed body, an empty table —
 * yields an empty list, and the deposit panel then renders exactly what it
 * rendered before this feature existed. This can only ever ADD options, which is
 * why losing the cross-chain section to an outage is acceptable and inventing
 * one would not be. Nothing security-shaped may be built on this list: it is an
 * offer, not a permission, and the actual decision was made when the route was
 * proved.
 *
 * The empty table is the SHIPPED state — no migration seeds a route — so the
 * empty answer is the common case on day one, not an error path.
 *
 * ## Not chain-scoped
 *
 * Unlike almost every other read in this app, this takes no chain: a route is
 * about a PAIR of chains, so identity-service serves one list for all of them.
 * The per-chain filtering happens in `sourcesFor`, against the destination the
 * user picked.
 */
export function useTransferRoutes(direction: TransferDirection): {
  routes: TransferRoute[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["transfer-routes", direction],
    // Short, matching the route's own cache header: an operator disabling a rail
    // during an incident expects it gone in seconds.
    staleTime: 15_000,
    queryFn: async (): Promise<TransferRoute[]> => {
      const response = await fetch(`/transfer-routes?direction=${direction}`);
      if (!response.ok) return [];
      const body = (await response.json().catch(() => null)) as { routes?: TransferRoute[] } | null;
      return Array.isArray(body?.routes) ? body.routes : [];
    },
  });

  return { routes: data ?? [], isLoading };
}
