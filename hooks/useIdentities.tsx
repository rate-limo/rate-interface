"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIdentities } from "@/queries/server/profile";

/** A wallet's name and picture, or nulls when nobody has claimed it. */
export interface WalletIdentity {
  address: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Names and avatars for a LIST of wallets, in one request.
 *
 * ## Why this is not `useProfile` in a loop
 *
 * Two reasons, and the second is the one that matters. A hook cannot be called
 * in a loop over a list whose length changes between renders, so the per-row
 * approach needs a component per row purely to keep the hook count stable —
 * which works, and quietly issues one request per distinct wallet on screen. A
 * tape of forty fills across a dozen wallets is a dozen round trips to paint one
 * column.
 *
 * More importantly, `useProfile` reads only `admin.profiles`, and there are TWO
 * profile tables with no superset between them. `/api/identities` merges both
 * server-side under one precedence — see its route doc — so a wallet named in
 * either store renders with that name, and the tape can no longer disagree with
 * the traders table beside it about what the same wallet is called.
 *
 * ## The key is the address SET, sorted
 *
 * The tape re-renders on every fill, and an unsorted or unstable key would
 * refetch the same names whenever a row arrived in a different order. Sorted and
 * deduplicated, a new frame from a wallet already on screen changes nothing and
 * costs no request.
 */
export function useIdentities(networkName: string, addresses: readonly string[]) {
  const wanted = useMemo(() => {
    return [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))].sort();
  }, [addresses]);

  const { data } = useQuery({
    queryKey: ["wallet-identities", networkName, wanted],
    enabled: !!networkName && wanted.length > 0,
    queryFn: async () => {
      const raw = await getIdentities(networkName, wanted);
      // A failed read is an empty map, not an error state: every caller's
      // fallback is the address, which is a correct thing to show for a wallet
      // nobody has named. Blanking the column instead would be worse.
      const rows = (raw?.identities as WalletIdentity[] | undefined) ?? [];
      return new Map(rows.map((row) => [row.address.toLowerCase(), row]));
    },
    // Names change when someone edits a profile, which is rare and not urgent
    // enough to re-ask on every remount of a tape that re-renders constantly.
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const map = data ?? new Map<string, WalletIdentity>();
    return {
      /** The claimed name for `address`, or null when nobody has claimed it. */
      nameOf: (address: string): string | null =>
        map.get(address.toLowerCase())?.name ?? null,
      avatarOf: (address: string): string | null =>
        map.get(address.toLowerCase())?.avatarUrl ?? null,
    };
  }, [data]);
}
