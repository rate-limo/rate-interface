"use client";

import { useQuery } from "@tanstack/react-query";
import { readGasBalance } from "@/lib/wallet/feeToken";
import { useAccount } from "wagmi";
import { wagmiConfig } from "@/lib/providers";
import {
  chainSteps,
  type ChainOnboardingProfile,
  type ChainStepKey,
} from "@/lib/onboarding/chainProfile";

/**
 * Per-chain onboarding progress, for every chain at once.
 *
 * ## One query, not a hook per chain
 *
 * The obvious shape — `useBalance({ chainId })` inside the card — is a hook in a
 * loop the moment the container maps over chains, and it also leaves the
 * container unable to ORDER the cards, because only each card would know how far
 * along it is. So the balances are fetched together, through `@wagmi/core`'s
 * imperative `getBalance` rather than the hook, and the result is a map the
 * container can sort on.
 *
 * ## Observed, never recorded
 *
 * Same rule as `lib/onboarding/progress`: a balance is the truth, a stored "we
 * already asked" flag can drift from it. Nothing here is persisted.
 *
 * ## A chain that fails to answer is PENDING, not empty
 *
 * `getBalance` rejecting means an RPC problem, and rendering "add funds" over a
 * wallet whose balance merely failed to load is the lie `useGasStatus` refuses
 * to tell on the send path. Such a chain reports no progress at all and its card
 * is held back until it answers.
 */
export interface ChainOnboardingState {
  done: Set<ChainStepKey>;
  /** The first unfinished step, or null when this chain is complete. */
  activeStep: ChainStepKey | null;
  /** False while this chain's balance has not resolved. */
  ready: boolean;
}

export function useChainOnboarding(
  profiles: readonly ChainOnboardingProfile[],
): Map<number, ChainOnboardingState> {
  const { address, isConnected } = useAccount();
  const key = profiles.map((p) => p.chainId).join(",");

  const { data: funded } = useQuery({
    queryKey: ["chain-onboarding-balances", address?.toLowerCase(), key],
    enabled: Boolean(address) && profiles.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        profiles.map(async (profile): Promise<[number, boolean | null]> => {
          try {
            // The GAS balance, not the native one: on Tempo the native balance is a
            // fixed placeholder (~4.2e75), so a wallet holding no PathUSD read as
            // funded and skipped "add funds". readGasBalance reads the fee token there.
            const balance = await readGasBalance(wagmiConfig, profile.chainId, address as `0x${string}`);
            return [profile.chainId, balance > BigInt(0)];
          } catch {
            // Null is "unknown", which the caller renders as pending rather than
            // as empty — see the docstring.
            return [profile.chainId, null];
          }
        }),
      );
      return new Map(entries);
    },
  });

  /**
   * Has this wallet traded on each chain?
   *
   * The step could never be ticked before this: `done` only ever received
   * `wallet` and `fund`, so "first trade" stayed unfinished no matter how many
   * trades were made. The card was not failing to DETECT a trade — nothing was
   * looking.
   *
   * `stats.trades` on the gateway's account read is the count of that wallet's
   * indexed fills on that chain, which is the same source the profile header
   * uses. One request per chain, through the same-origin proxy the swap quote
   * already goes through, because the gateway refuses arbitrary browser origins.
   *
   * ## What this still cannot see
   *
   * A trade that produced no indexed fill. The dock's swaps settle through
   * `BandSwapRouter`, and a band pool's fills arrive as `BandSwap`, which has no
   * indexer handler — the same gap that makes a band pool's APR unmeasurable.
   * So a swap made from the rail may leave this step unticked while a trade on
   * `/trade/pro`, which goes through the MatchingEngine, ticks it. That is an
   * indexer gap rather than a bug in this hook, and it is why the step is
   * marked from an observed count rather than from anything the client records
   * about its own clicks: a local flag would say "traded" for an order that
   * reverted.
   */
  const { data: traded } = useQuery({
    queryKey: ["chain-onboarding-trades", address?.toLowerCase(), key],
    enabled: Boolean(address) && profiles.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        profiles.map(async (profile): Promise<[number, boolean | null]> => {
          try {
            const response = await fetch(
              `/api/gateway/account/${address}?network=${encodeURIComponent(profile.name)}`,
              { cache: "no-store" },
            );
            if (!response.ok) return [profile.chainId, null];
            const body = (await response.json()) as { stats?: { trades?: number } };
            return [profile.chainId, (body.stats?.trades ?? 0) > 0];
          } catch {
            // Unknown, not "has not traded" — the same distinction the balance
            // read above draws, and for the same reason: an unreachable gateway
            // must not un-tick a step the user has actually completed.
            return [profile.chainId, null];
          }
        }),
      );
      return new Map(entries);
    },
  });

  const out = new Map<number, ChainOnboardingState>();
  for (const profile of profiles) {
    const hasFunds = funded?.get(profile.chainId) ?? null;
    const done = new Set<ChainStepKey>();
    if (isConnected) done.add("wallet");
    if (hasFunds === true) done.add("fund");
    // Only a definite yes. Null is "we could not ask", which must not tick a
    // step, and must not un-tick one either — hence `=== true`.
    if (traded?.get(profile.chainId) === true) done.add("trade");

    const steps = chainSteps(profile);
    const activeStep = steps.find((step) => !done.has(step)) ?? null;
    out.set(profile.chainId, {
      done,
      activeStep,
      // Connected but no balance answer yet: the card would otherwise flash
      // "add funds" and then correct itself on every page load.
      ready: !isConnected || hasFunds !== null,
    });
  }
  return out;
}
