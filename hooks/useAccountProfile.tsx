"use client";
import { useQuery } from "@tanstack/react-query";
import { getAccountProfileForViewer } from "@/queries/server/profile";
import { emptyAccountProfile, toAccountProfile } from "@/lib/portfolio/profile";
import type { AccountProfile } from "@/lib/portfolio/types";

/**
 * The profile header's data — `GET /api/account/:address`, mapped through
 * `toAccountProfile` so a partial/failed response degrades field by field
 * instead of blanking the header. Same shape as `usePortfolioLive`: a
 * fallback constant so the component never has to null-check, `enabled` gated
 * on having an address, and a `refetch` the caller can fold into its own
 * refresh action.
 */
export function useAccountProfile(
  networkName: string,
  address: string | undefined,
  /**
   * The CONNECTED wallet, when there is one — not the wallet being viewed.
   *
   * Scopes the read so the response carries `social.viewerFollows`, which is
   * what lets a Follow button paint its real state on first render. Omitting it
   * is not a smaller request, it is a different answer: `viewerFollows` comes
   * back null and the button says "Follow" to someone who already does, making
   * unfollow unreachable.
   */
  viewer?: string,
) {
  const { data, isLoading, error, refetch } = useQuery<AccountProfile>({
    // The viewer is part of the key: the same profile answers differently for
    // two viewers, and sharing one cache entry would show one wallet another
    // wallet's follow state.
    queryKey: ["account-profile", networkName, address, viewer?.toLowerCase() ?? null],
    enabled: !!address && !!networkName,
    queryFn: async () => {
      if (!address) return emptyAccountProfile("");
      const raw = await getAccountProfileForViewer(networkName, address, viewer);
      return toAccountProfile(raw, address);
    },
  });

  return {
    data: data ?? emptyAccountProfile(address ?? ""),
    isLoading,
    error,
    refetch,
  };
}
