"use client";

import { useQuery } from "@tanstack/react-query";
import { getBalance } from "@wagmi/core";
import { useAccount } from "wagmi";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { useVisibleChains } from "@/lib/chains/useVisibleChains";
import { getTokens } from "@/queries/server/tokens";
import { hasDistinctNativeAsset } from "@/lib/wallet/depositAssets";
import type { SpotTokenWithBalance } from "@/types/tables/tokens";

/**
 * Everything a wallet could deposit, across every chain the operator serves.
 *
 * ## One query for every chain, not a hook per chain
 *
 * `useTokenlistBalances` is per-chain, so an asset-first list would need it once
 * per network — a hook in a loop the moment the component maps over chains.
 * Fetching them together also lets the list be sorted globally, which is the
 * whole point of asking for an asset before a network.
 *
 * ## Native assets are synthesised, not fetched
 *
 * The chain's own gas asset is what a new wallet actually needs and is the only
 * thing `fundPasskeyWallet` can send, but it is not an ERC-20 and so appears in
 * no token list. It is added per chain from `nativeCurrency`, marked `native`,
 * and carries the wallet's real balance — which is also what tells the sheet it
 * may offer a one-click send rather than only an address.
 *
 * NOT on every chain, though. Arc's gas asset IS the USDC ERC-20 at 0x3600…, so
 * a synthesised row there duplicates a token already in the list.
 * `hasDistinctNativeAsset` is the gate, and it reads the token list's
 * `iter_native` — the same signal `useTokenlistBalances` and
 * `WalletTransferModal` read, rather than a fourth answer to one question.
 */
export interface DepositCandidate {
  token: SpotTokenWithBalance;
  chainId: number;
  chainName: string;
  /** True for the chain's gas asset — the only kind this app can send for you. */
  native: boolean;
}

export function useDepositAssets(): { assets: DepositCandidate[]; isLoading: boolean } {
  const { address } = useAccount();
  const visible = useVisibleChains();
  const chains = wagmiChains.filter((c) => visible.includes(c.name));
  const key = chains.map((c) => c.id).join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["deposit-assets", address?.toLowerCase(), key],
    enabled: chains.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<DepositCandidate[]> => {
      const perChain = await Promise.all(
        chains.map(async (chain): Promise<DepositCandidate[]> => {
          const out: DepositCandidate[] = [];

          // The gas asset first — it is the one a wallet cannot do without, and
          // the only one with a send path.
          //
          // Only where the chain HAS one distinct from its ERC-20s. On Arc the
          // native view and the USDC ERC-20 are one pool of funds behind two
          // interfaces, so synthesising here listed USDC TWICE — once at 18
          // decimals flagged `native`, once at 6 flagged not — and that flag is
          // what tells the panel it may offer a one-click send, so the two rows
          // are not interchangeable.
          if (hasDistinctNativeAsset(chain.name)) {
            let nativeBalance = "0";
            if (address) {
              try {
                const read = await getBalance(wagmiConfig, {
                  address,
                  chainId: chain.id as (typeof wagmiConfig)["chains"][number]["id"],
                });
                nativeBalance = read.formatted;
              } catch {
                // An unreachable RPC must not remove the asset from the list —
                // the user can still be shown where to send it.
              }
            }
            out.push({
              chainId: chain.id,
              chainName: chain.name,
              native: true,
              token: {
                id: `native:${chain.id}`,
                symbol: chain.nativeCurrency.symbol,
                name: chain.nativeCurrency.name,
                decimals: chain.nativeCurrency.decimals,
                creator: "",
                // The chain's own asset is as verified as anything can be here.
                verified: true,
                balance: nativeBalance,
              } as unknown as SpotTokenWithBalance,
            });
          }

          try {
            /*
             * UNGATED, because a deposit list is not a ranking.
             *
             * This read the listing-gated list, so a token showed up here only
             * once its market had graduated. On a freshly deployed chain that
             * is every token: measured on Arc, nine tokens existed and all nine
             * were unverified, so this page offered nothing at all — including
             * USDC, which is the asset the venue settles in.
             *
             * "Unlisted, not hidden" is the standing rule (see CLAUDE.md): a
             * pre-graduation market never appears in a ranking, a default view
             * or an aggregate, and is reachable everywhere else. Depositing an
             * asset you already hold is reachability, not endorsement.
             */
            const listed = (await getTokens(chain.name, 500, 1, "", "all")) as {
              tokens?: SpotTokenWithBalance[];
            };
            for (const token of listed?.tokens ?? []) {
              out.push({ token, chainId: chain.id, chainName: chain.name, native: false });
            }
          } catch {
            // A gateway being down costs that chain's ERC-20s, never its native
            // asset — which is synthesised above and needs no service at all.
          }
          return out;
        }),
      );
      return perChain.flat();
    },
  });

  return { assets: data ?? [], isLoading };
}
