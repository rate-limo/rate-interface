"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * A token's catalogue-set brand colour and logo, if the operator has linked
 * this exact deployment. See `apps/admin-service`'s `lookupBrand` for the full
 * reasoning — the short version: this is keyed by `(chainId, address)`, the
 * identity a `SwapToken` already carries, never by symbol, because matching on
 * symbol is how a counterfeit token would inherit a real one's brand colour.
 *
 * Most tokens will not be linked yet — the catalogue is new and populated by
 * hand. `null` fields are the expected, common case, not a failure; callers
 * fall back to a synthetic colour (see `tokenColor` in `lib/swap/tokens.ts`)
 * rather than branching on this query's error state.
 */
export interface TokenBrand {
  brandColorHex: string | null;
  logoURI: string | null;
}

const EMPTY_BRAND: TokenBrand = { brandColorHex: null, logoURI: null };

export function useTokenBrand(chainId: number, address: string) {
  return useQuery({
    queryKey: ["token-brand", chainId, address],
    enabled: Boolean(chainId) && Boolean(address),
    // A catalogue link changes rarely — an operator visiting the page again
    // a minute later should not re-fetch what cannot plausibly have changed.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TokenBrand> => {
      const response = await fetch(`/token-brand/${chainId}/${address}`);
      // Unreachable admin-service or a malformed address both degrade to "no
      // brand set" rather than surfacing an error — a chart's fallback colour
      // is cosmetic, and treating this as fatal would make an unrelated
      // service's uptime a dependency of the swap card rendering at all.
      if (!response.ok) return EMPTY_BRAND;
      const body: unknown = await response.json().catch(() => null);
      if (!body || typeof body !== "object") return EMPTY_BRAND;
      const { brandColorHex, logoURI } = body as Partial<TokenBrand>;
      return {
        brandColorHex: typeof brandColorHex === "string" ? brandColorHex : null,
        logoURI: typeof logoURI === "string" ? logoURI : null,
      };
    },
  });
}
