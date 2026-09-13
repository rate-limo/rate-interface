"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProfile } from "@/lib/portfolio/profile";
import type { ProfileData } from "@/lib/portfolio/profile";

/**
 * The USER-AUTHORED half of a wallet's identity — `GET /api/profile/:address`
 * over `admin.profiles`, which is the table `EditProfileModal` writes through
 * `PUT /api/profile`.
 *
 * ## Why this is a second profile hook
 *
 * `useAccountProfile` reads `/api/account/:address`, which serves
 * `broker.accountProfiles`. The two tables are not the same store and neither is
 * a superset: only this one has `username` and `bio`, only that one has the
 * `createdAt` behind the header's "Joined" line and the follower/trade counts.
 * They were one table until the 2026-08-15 merge repointed `/api/account`.
 *
 * So the portfolio header reads BOTH and overlays this one on top: what a user
 * can edit is shown from where their edit actually lands. Merging the tables is
 * the real fix; until then, an overlay is what keeps the header honest about the
 * save it just accepted.
 *
 * A missing row is not an error — the route answers 200 with every field null
 * for a wallet that has never saved a profile, which is the common case. A
 * FAILED read degrades to null so the header falls back to the account profile
 * rather than blanking an identity it can still partly resolve.
 */
export function useProfile(networkName: string, address: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["wallet-profile", networkName, address?.toLowerCase()];

  const { data, isLoading, refetch } = useQuery<ProfileData | null>({
    queryKey: key,
    enabled: !!address && !!networkName && /^0x[0-9a-fA-F]{40}$/.test(address ?? ""),
    queryFn: async () => {
      if (!address) return null;
      try {
        return await fetchProfile(networkName, address);
      } catch (error) {
        console.warn(`useProfile: read failed for ${address}`, error);
        return null;
      }
    },
  });

  return {
    data: data ?? null,
    isLoading,
    refetch,
    /**
     * Seed the cache with what the server just returned from a save, so the
     * header updates on the same tick the modal closes rather than after a
     * round trip that can visibly lag behind the "Profile saved" toast.
     */
    setProfile: (profile: ProfileData) => queryClient.setQueryData(key, profile),
  };
}
