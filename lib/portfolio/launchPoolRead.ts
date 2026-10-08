"use client";

import { getPublicClient } from "wagmi/actions";
import { zeroAddress } from "viem";
import { AssetGeneratorABI, BandPoolABI, BandPoolFactoryABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { contractAddress } from "@/lib/deployments";
import { launchPoolValue, sumBandReserves, type LaunchPoolRead } from "./launchPool";

type Address = `0x${string}`;

export interface LaunchPoolInput {
  coin: Address;
  quote: Address;
  baseDecimals: number;
  quoteDecimals: number;
  baseUsd: number;
  quoteUsd: number;
}

/**
 * The coin's own taker fee and its band pool's reserves, read from chain.
 *
 * Never throws: every failure is null, and the Creator row then shows what it
 * showed before (the order book only). A coin the generator did not launch
 * still gets its pool read; only the fee is null for it.
 */
export async function readLaunchPool(network: string, input: LaunchPoolInput): Promise<LaunchPoolRead | null> {
  const chain = wagmiChains.find((c) => c.id === chainIds[network]);
  const client = chain ? getPublicClient(wagmiConfig, { chainId: chain.id }) : undefined;
  const factory = contractAddress(network, "bandPoolFactory");
  if (!client || !factory) return null;
  try {
    const generator = contractAddress(network, "assetGenerator");
    const takerFeeNum = generator
      ? await client
          .readContract({ abi: AssetGeneratorABI, address: generator, functionName: "launches", args: [input.coin] })
          .then((l) => (l[0] === zeroAddress ? null : Number(l[6])))
          .catch(() => null)
      : null;

    const f = { abi: BandPoolFactoryABI, address: factory } as const;
    let pool = (await client.readContract({ ...f, functionName: "getPool", args: [input.coin, input.quote] })) as Address;
    if (pool === zeroAddress) {
      pool = (await client.readContract({ ...f, functionName: "getPool", args: [input.quote, input.coin] })) as Address;
    }
    if (pool === zeroAddress) {
      return takerFeeNum === null ? null : { poolBase: 0, poolQuote: 0, valueUsd: 0, takerFeeNum };
    }

    const p = { abi: BandPoolABI, address: pool } as const;
    const [count, poolBase] = await Promise.all([
      client.readContract({ ...p, functionName: "bandCount" }),
      client.readContract({ ...p, functionName: "base" }),
    ]);
    const bands = (await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        client.readContract({ ...p, functionName: "bandReserves", args: [i] }),
      ),
    )) as unknown as (readonly [bigint, bigint])[];
    const { baseRaw, quoteRaw } = sumBandReserves(bands, String(poolBase).toLowerCase() === input.coin.toLowerCase());
    return {
      ...launchPoolValue({
        baseRaw,
        quoteRaw,
        baseDecimals: input.baseDecimals,
        quoteDecimals: input.quoteDecimals,
        baseUsd: input.baseUsd,
        quoteUsd: input.quoteUsd,
      }),
      takerFeeNum,
    };
  } catch {
    return null;
  }
}
