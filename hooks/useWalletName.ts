"use client";

import { useAccount } from "wagmi";
import { wagmiChains } from "@/lib/customChains";
import { useProfile } from "@/hooks/useProfile";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { pickWalletName } from "@/lib/profile/walletName";

/**
 * What to call a connected wallet — its name, or null when nobody has named it.
 *
 * ## Why a hook and not two inline lookups
 *
 * There are TWO profile tables and neither is a superset. `admin.profiles` holds
 * `username` and the authored `displayName`; `broker.accountProfiles` holds the
 * generated `handle`. A wallet routinely has a row in one and not the other,
 * which is why `useProfile` alone left the wallet menu showing a bare address
 * for an account the traders table was already naming. The precedence lives in
 * `pickWalletName` so the two call sites here cannot drift apart.
 *
 * ## `/api/account/:address`, not `/api/identities`, and that is the fix
 *
 * This read `useIdentities`, which is the right call for a TABLE of wallets and
 * the wrong one for this: identities only READS, while the generated row is
 * written lazily on first lookup of `/api/account/:address`. So a wallet that
 * had never been looked up had no handle for identities to return, and the one
 * wallet guaranteed to be in that state is the one that has just connected for
 * the first time. Measured against the gateway, on an address nobody had asked
 * about: `identities` answered `name: null`, `account` answered
 * `handle: "CalmKindredHeron"` and CREATED it, and `identities` answered with
 * that same handle afterwards.
 *
 * The chip therefore showed a truncated address for every new wallet, except
 * where something else on the page happened to call the account route first —
 * `/home` does, through `useChainOnboarding`, which is why the name appeared
 * there sometimes and never on `/deposit`. That was a race, not a rule.
 *
 * One request either way: this replaces the identities call rather than joining
 * it, and react-query keys it per (network, address) so the shell's several
 * mounts share one.
 */
export function useWalletName(address: `0x${string}` | undefined): string | null {
  const { chainId } = useAccount();
  const networkName = wagmiChains.find((chain) => chain.id === chainId)?.name ?? "";

  // Both swallow their own failure and answer null, so an unreachable gateway
  // costs the NAME and nothing else. Everything these surfaces exist to do —
  // copy, send, receive, disconnect — works without one.
  const { data: profile } = useProfile(networkName, address);
  const account = useAccountProfile(networkName, address);

  if (!address) return null;
  return pickWalletName(profile, account.data.profile.handle);
}
