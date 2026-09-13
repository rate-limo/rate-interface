"use client";

import { useAccount } from "wagmi";
import { wagmiChains } from "@/lib/customChains";
import { useProfile } from "@/hooks/useProfile";
import { useIdentities } from "@/hooks/useIdentities";

/**
 * What to call a connected wallet — its name, or null when nobody has claimed it.
 *
 * ## Why a hook and not two inline lookups
 *
 * There are TWO profile tables and neither is a superset. `admin.profiles` holds
 * `username` and `bio`; `broker.accountProfiles` holds `handle`. A wallet
 * routinely has a row in one and not the other, which is why `useProfile` alone
 * left the wallet menu showing a bare address for an account the traders table
 * and the trade tape were already naming. `/api/identities` merges both
 * server-side under one precedence.
 *
 * That precedence is the part worth centralising. The wallet's OWN authored name
 * wins and the lazily generated row only ever fills a blank — never the reverse,
 * which is the bug migration 0002 removed, where a derived value permanently
 * outranked something the user had typed. Two call sites writing that chain by
 * hand is how the button and the menu it opens end up disagreeing about the same
 * wallet, on the same screen, one pixel apart.
 *
 * Returns null rather than a shortened address: the caller decides how to render
 * an unnamed wallet, and the button and the menu render it differently — mono
 * and truncated in one, full and wrapped in the other.
 */
export function useWalletName(address: `0x${string}` | undefined): string | null {
  const { chainId } = useAccount();
  const networkName = wagmiChains.find((chain) => chain.id === chainId)?.name ?? "";

  // Both swallow their own failure and answer null, so an unreachable gateway
  // costs the NAME and nothing else. Everything these surfaces exist to do —
  // copy, send, receive, disconnect — works without one.
  const { data: profile } = useProfile(networkName, address);
  const identities = useIdentities(networkName, address ? [address] : []);

  if (!address) return null;
  return profile?.displayName ?? profile?.username ?? identities.nameOf(address);
}
