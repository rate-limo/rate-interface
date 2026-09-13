"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { AssetGeneratorABI, ERC20ABI } from "@iter/abis";
import { findChain } from "@iter/deployments";
import { contractAddress } from "@/lib/deployments";

/**
 * The quote tokens AssetGenerator currently allows a coin to list against.
 *
 * ## Read from the contract, not from a list
 *
 * `AssetGenerator` keeps an admin-configured registry — `_quoteOptions` keyed by
 * token, `_quoteTokens` for enumeration — and exposes `enabledQuoteTokens()`.
 * That registry IS the answer to "which tokens can a market be quoted in", and
 * it changes whenever an operator calls `setQuoteOption`, which emits
 * `QuoteOptionSet`.
 *
 * Reading the contract directly rather than a cached copy is deliberate. An
 * operator disabling a quote takes effect on the next read, with no indexing lag
 * and no second source to drift — and a stale allowlist here would offer a
 * creator a quote the contract will reject, or hide one it would accept.
 * `lib/launch/execution.ts` has documented this as the intended path all along;
 * until now it was wired to a mock.
 *
 * The alternative — indexing `QuoteOptionSet` into a broker table and serving it
 * from the gateway — is the right shape if this ever needs to be queried
 * off-chain (analytics, admin views, a server-rendered launch page). It is not
 * needed to render a picker the user is about to transact against, and it would
 * put an indexer between the user and a value the contract will enforce anyway.
 *
 * Never throws: a failed read degrades to an empty list, and callers show the
 * "no quotes configured" state rather than a broken picker.
 */
export interface QuoteOptionRow {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  enabled: boolean;
  /** Engine-scaled (1e8) listing rate, as stored. Callers divide for display. */
  listingPrice: bigint;
  /** What the engine charges the listing cost in. Zero address => the coin itself. */
  listingPayment: `0x${string}`;
  /** `FEE_DENOM`-scaled taker fee a coin launched against this quote starts on. */
  startingTakerFee: number;
}

export function useQuoteOptions(networkName: string | number | undefined) {
  // PINNED to the chain the page is about, not wagmi's current chain. Bare
  // `usePublicClient()` follows the connected wallet — or the first configured
  // chain when nothing is connected — so a RISE token profile viewed by a
  // disconnected visitor read RISE's generator address against another chain's
  // RPC, got nothing back, and silently rendered no quotes at all.
  const chainId = networkName === undefined ? undefined : findChain(networkName)?.chainId;
  const client = usePublicClient(chainId ? { chainId } : undefined);
  const generator = contractAddress(networkName, "assetGenerator");

  const { data, isLoading, error } = useQuery<QuoteOptionRow[]>({
    queryKey: ["quote-options", networkName, generator],
    enabled: Boolean(client && generator),
    // Operator changes are rare; a minute of staleness is invisible and keeps a
    // picker from re-reading the chain on every render.
    staleTime: 60_000,
    queryFn: async () => {
      if (!client || !generator) return [];
      try {
        const enabled = (await client.readContract({
          address: generator,
          abi: AssetGeneratorABI,
          functionName: "enabledQuoteTokens",
        })) as `0x${string}`[];

        if (enabled.length === 0) return [];

        // Individual reads, deliberately NOT multicall.
        //
        // multicall needs `contracts.multicall3` on the chain object, and viem
        // rejects the whole batch with ChainDoesNotSupportContract when it is
        // missing — which is what happened here: the chain definition wagmi
        // actually uses carried no contracts block, so every quote silently
        // vanished while the contract was answering perfectly. A picker that
        // depends on chain metadata to render at all is too fragile for the job.
        //
        // These run in parallel, so the cost is one round trip either way for
        // the handful of quotes an operator configures.
        const results = await Promise.all(
          enabled.flatMap((quote) => [
            client
              .readContract({ address: generator, abi: AssetGeneratorABI, functionName: "quoteOption", args: [quote] })
              .then((r) => ({ ok: true as const, r }))
              .catch(() => ({ ok: false as const, r: undefined })),
            client
              .readContract({ address: quote, abi: ERC20ABI, functionName: "symbol" })
              .then((r) => ({ ok: true as const, r }))
              .catch(() => ({ ok: false as const, r: undefined })),
            client
              .readContract({ address: quote, abi: ERC20ABI, functionName: "decimals" })
              .then((r) => ({ ok: true as const, r }))
              .catch(() => ({ ok: false as const, r: undefined })),
          ]),
        );

        return enabled.flatMap((quote, i): QuoteOptionRow[] => {
          const option = results[i * 3];
          const symbol = results[i * 3 + 1];
          const decimals = results[i * 3 + 2];
          // A quote whose option read failed is DROPPED, not defaulted. Showing
          // it with invented terms would present admin configuration the
          // contract never granted, and every field on this row renders as fact.
          if (!option?.ok) return [];

          const o = option.r as {
            enabled: boolean;
            listingPrice: bigint;
            listingPayment: `0x${string}`;
            startingTakerFee: number | bigint;
          };

          return [
            {
              address: quote,
              // Symbol/decimals are cosmetic — a token that will not answer them
              // is still a valid quote, so these fall back rather than drop the row.
              symbol: symbol?.ok ? String(symbol.r) : shortAddr(quote),
              decimals: decimals?.ok ? Number(decimals.r) : 18,
              enabled: Boolean(o.enabled),
              listingPrice: BigInt(o.listingPrice ?? 0),
              listingPayment: o.listingPayment,
              startingTakerFee: Number(o.startingTakerFee ?? 0),
            },
          ];
        });
      } catch {
        return [];
      }
    },
  });

  return { options: data ?? [], isLoading, error };
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
