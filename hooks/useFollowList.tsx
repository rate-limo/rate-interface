"use client";
import { useQuery } from "@tanstack/react-query";
import { getFollowList } from "@/queries/server/profile";

export type FollowDirection = "followers" | "following";

/** One row of a follow list. Every field but `address` is null for a wallet that
 * has never been looked up — `accountProfiles` rows are generated lazily, so a
 * wallet can be followed before it has an identity row. The list still shows
 * them; it costs the name, not the entry. */
export interface FollowEntry {
  address: string;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
}

/**
 * Who follows a wallet, or who it follows.
 *
 * `broker.follows` had been `count()`-ed by the profile header since it shipped
 * and never listed, which is why those two numbers had nothing to link to.
 *
 * `enabled` is gated on `open` as well as the address: this backs a modal, and a
 * profile page should not fetch two follow lists nobody has asked to see. The
 * counts in the header come from the account read and are already on screen.
 */
export function useFollowList({
  networkName,
  address,
  direction,
  page = 1,
  pageSize = 25,
  enabled = true,
}: {
  networkName: string;
  address: string | undefined;
  direction: FollowDirection;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}) {
  const { data, isLoading, error } = useQuery<{
    entries: FollowEntry[];
    totalCount: number;
    totalPages: number;
  } | null>({
    queryKey: ["follow-list", networkName, address?.toLowerCase(), direction, page, pageSize],
    enabled: enabled && !!address && !!networkName,
    queryFn: async () => {
      if (!address) return null;
      const raw = await getFollowList(networkName, address, direction, page, pageSize);
      // null is the fetcher's "the read failed" — kept distinct from an empty
      // list so the modal can say which happened, the same split useThesesFeed
      // draws.
      if (!raw) return null;
      const rows = raw[direction];
      return {
        entries: Array.isArray(rows) ? (rows as FollowEntry[]) : [],
        totalCount: Number(raw.totalCount ?? 0),
        totalPages: Number(raw.totalPages ?? 0),
      };
    },
  });

  return {
    entries: data?.entries ?? [],
    totalCount: data?.totalCount ?? 0,
    totalPages: data?.totalPages ?? 0,
    /** True only when the read failed — not when nobody follows this wallet. */
    failed: data === null,
    isLoading,
    error,
  };
}
