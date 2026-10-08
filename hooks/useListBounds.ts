"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "wagmi/actions";
import { AssetGeneratorABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { contractAddress } from "@/lib/deployments";
import type { ListBounds } from "@/lib/liquidity/launchPolicy";

/**
 * The bounds `AssetGenerator.listPair` enforces, read from the generator on
 * `networkName`.
 *
 * Null while loading, on a chain with no generator, or on a failed read — and
 * the pickers then offer nothing, because offering a fee the contract refuses
 * costs the lister a reverted transaction after two approvals.
 */
export function useListBounds(networkName: string): ListBounds | null {
  const { data } = useQuery({
    queryKey: ["list-bounds", networkName],
    enabled: Boolean(networkName),
    // Admin-set and rarely changed; listPair re-checks anyway.
    staleTime: 60_000,
    queryFn: async (): Promise<ListBounds | null> => {
      const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
      const client = chain ? getPublicClient(wagmiConfig, { chainId: chain.id }) : undefined;
      const generator = contractAddress(networkName, "assetGenerator");
      if (!client || !generator) return null;
      const read = (functionName: "minSlippageLimitBps" | "maxSlippageLimitBps" | "minPairFee" | "maxPairFee" | "maxCreatorTakerFee") =>
        client.readContract({ abi: AssetGeneratorABI, address: generator, functionName }) as Promise<number | bigint>;
      try {
        const [minV, maxV, minF, maxPair, maxCreator] = await Promise.all([
          read("minSlippageLimitBps"),
          read("maxSlippageLimitBps"),
          read("minPairFee"),
          read("maxPairFee"),
          read("maxCreatorTakerFee"),
        ]);
        return {
          minVolatilityBps: Number(minV),
          maxVolatilityBps: Number(maxV),
          minFee: Number(minF),
          maxFee: Math.min(Number(maxPair), Number(maxCreator)),
        };
      } catch {
        return null;
      }
    },
  });
  return data ?? null;
}
