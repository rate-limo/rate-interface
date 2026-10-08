"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "wagmi/actions";
import { zeroAddress } from "viem";
import { AssetGeneratorABI, ERC20ABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { contractAddress } from "@/lib/deployments";
import type { CoinLaunchState } from "@/lib/portfolio/coinLaunch";
import { ORDERBOOK_GET_ORDER } from "@/lib/launch/orderbookAbi";

/**
 * A launched coin's ladder, graduation and lock, read from `AssetGenerator` on
 * its own chain.
 *
 * "Sold" is read the way `AssetLaunchLib.requireFilled` reads it — from the
 * ask's ORDER STATE: a step is sold once its slot no longer holds an
 * escrow-owned deposit. "Raised" is the escrow's quote balance: the dev buy
 * plus every fill, which is exactly what graduation seeds the pool with.
 *
 * Null while loading, for a coin this generator did not launch, or on a failed
 * read; the block then renders nothing rather than invented terms.
 */
export function useCoinLaunch(networkName: string, coin: string | undefined) {
  return useQuery({
    queryKey: ["coin-launch", networkName, coin],
    enabled: Boolean(networkName) && Boolean(coin),
    staleTime: 15_000,
    queryFn: async (): Promise<CoinLaunchState | null> => {
      const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
      const client = chain ? getPublicClient(wagmiConfig, { chainId: chain.id }) : undefined;
      const generator = contractAddress(networkName, "assetGenerator");
      if (!client || !generator || !coin) return null;
      const g = { abi: AssetGeneratorABI, address: generator } as const;
      const coinAddr = coin as `0x${string}`;
      try {
        const [creator, quote, , , slippageLimitBps, , takerFee, creatorFeeLocked, graduated] =
          await client.readContract({ ...g, functionName: "launches", args: [coinAddr] });
        if (creator === zeroAddress) return null;

        const [option, lock, ladder, maxCreator, minFee, minV, maxV, symbol, decimals] = await Promise.all([
          client.readContract({ ...g, functionName: "quoteOption", args: [quote] }),
          client.readContract({ ...g, functionName: "launchLocks", args: [coinAddr] }),
          client.readContract({ ...g, functionName: "ladderOf", args: [coinAddr] }),
          client.readContract({ ...g, functionName: "maxCreatorTakerFee" }),
          client.readContract({ ...g, functionName: "minPairFee" }),
          client.readContract({ ...g, functionName: "minSlippageLimitBps" }),
          client.readContract({ ...g, functionName: "maxSlippageLimitBps" }),
          client.readContract({ abi: ERC20ABI, address: quote, functionName: "symbol" }),
          client.readContract({ abi: ERC20ABI, address: quote, functionName: "decimals" }),
        ]);
        const [mode, readyAt, graduatedAt, releasedBps] = lock;

        const [orders, quoteRaised] = await Promise.all([
          Promise.all(
            ladder.askIds.map((id) =>
              client.readContract({ abi: ORDERBOOK_GET_ORDER, address: ladder.pair, functionName: "getOrder", args: [false, id] }),
            ),
          ),
          ladder.escrow === zeroAddress
            ? Promise.resolve(BigInt(0))
            : (client.readContract({ abi: ERC20ABI, address: quote, functionName: "balanceOf", args: [ladder.escrow] }) as Promise<bigint>),
        ]);
        const escrow = ladder.escrow.toLowerCase();
        const stepsSold = orders.map((o) => !(o.owner.toLowerCase() === escrow && o.depositAmount > BigInt(0)));

        return {
          creator,
          quote,
          quoteSymbol: String(symbol),
          quoteDecimals: Number(decimals),
          graduated,
          creatorFeeLocked,
          takerFeeNum: Number(takerFee),
          slippageLimitBps: Number(slippageLimitBps),
          stepsSold,
          // After graduation the escrow is swept into the pool; "raised" then
          // describes a past event the event log carries, not this balance.
          quoteRaised,
          graduationMarketCap: option.graduationMarketCap,
          readyAt: Number(readyAt),
          graduatedAt: Number(graduatedAt),
          lockMode: Number(mode) === 1 ? "vest12Months" : "feesOnly",
          releasedBps: Number(releasedBps),
          maxCreatorTakerFeeNum: Number(maxCreator),
          minFeeNum: Number(minFee),
          minVolatilityBps: Number(minV),
          maxVolatilityBps: Number(maxV),
        };
      } catch {
        return null;
      }
    },
  });
}
