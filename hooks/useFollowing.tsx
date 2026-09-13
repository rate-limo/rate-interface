"use client";

import { useQuery } from "@tanstack/react-query";
import { PonderLinks } from "@/consts";

/** One account you follow, as the withdraw picker needs it. */
export interface FollowedAccount {
  address: string;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
}

/**
 * The accounts this wallet FOLLOWS.
 *
 * ## Following, not followers, and the difference is the whole point
 *
 * A follower is someone who chose you; you did not choose them, and anyone can
 * become one. Offering that list as withdrawal destinations would put strangers
 * one tap from an irreversible transfer, sorted by an action they took. The
 * people you follow are the ones you picked, which is the only version of this
 * list that means anything about where you might send money.
 *
 * It is still not an allowlist. The picker fills the address field and the
 * confirmation step is unchanged — the same second screen, the same
 * irreversibility warning — because a familiar name is not verification.
 */
export function useFollowing(networkName: string, address: string | undefined) {
  return useQuery({
    queryKey: ["following", networkName, address?.toLowerCase()],
    enabled: !!address && !!networkName && !!PonderLinks[networkName],
    // The graph changes rarely and this is a picker, not a feed.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FollowedAccount[]> => {
      const response = await fetch(
        `${PonderLinks[networkName]}/api/account/${address}/following?pageSize=100`,
      );
      // A picker is a convenience: a follow graph that cannot be read must cost
      // the shortcut and nothing else, because the address field still works.
      if (!response.ok) return [];
      const body = (await response.json()) as { following?: FollowedAccount[] };
      return Array.isArray(body.following) ? body.following : [];
    },
  });
}
