"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "wagmi/actions";
import { zeroAddress } from "viem";
import { AssetGeneratorABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { contractAddress } from "@/lib/deployments";
import { isLadderMarket, type LadderStep } from "@/lib/launch/ladderBuy";
import { ORDERBOOK_GET_ORDER } from "@/lib/launch/orderbookAbi";

export interface LadderBook {
  /** The coin/quote market is a launch coin still selling its ladder. */
  active: boolean;
  /** The five asks as they rest now: price and coins remaining (0 once sold). */
  steps: LadderStep[];
  /** The coin's taker fee on the 1e8 scale (`launches(coin).takerFee`). */
  takerFeeNum: number;
}

const INACTIVE: LadderBook = { active: false, steps: [], takerFeeNum: 0 };

/**
 * Whether `coin`/`quote` is a pre-graduation launch market, and what is left on
 * each of its five ladder asks.
 *
 * Read from the generator (`launches`, `ladderOf`) and the pair's own orders, so
 * a buy's expected fill walks what is actually resting. Every failure answers
 * INACTIVE: the token then trades as an ordinary market, which is what it is
 * for every token the generator did not launch.
 */
export function useLadderBook(networkName: string, coin: string | undefined, quote: string | undefined): LadderBook {
  const valid = (a?: string) => /^0x[0-9a-fA-F]{40}$/.test(a ?? "");
  const { data } = useQuery({
    queryKey: ["ladder-book", networkName, coin?.toLowerCase(), quote?.toLowerCase()],
    enabled: Boolean(networkName) && valid(coin) && valid(quote),
    // Fills move it; a stale step only means a more conservative expectation,
    // and the price ceiling still caps the order.
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<LadderBook> => {
      const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
      const client = chain ? getPublicClient(wagmiConfig, { chainId: chain.id }) : undefined;
      const generator = contractAddress(networkName, "assetGenerator");
      if (!client || !generator || !coin || !quote) return INACTIVE;
      const g = { abi: AssetGeneratorABI, address: generator } as const;
      try {
        const [creator, launchQuote, , , , , takerFee, , graduated] = await client.readContract({
          ...g,
          functionName: "launches",
          args: [coin as `0x${string}`],
        });
        if (!isLadderMarket({ creator, quote: launchQuote, graduated }, quote)) return INACTIVE;
        const ladder = await client.readContract({ ...g, functionName: "ladderOf", args: [coin as `0x${string}`] });
        if (ladder.pair === zeroAddress) return INACTIVE;
        const escrow = ladder.escrow.toLowerCase();
        const orders = await Promise.all(
          ladder.askIds.map((id) =>
            client.readContract({ abi: ORDERBOOK_GET_ORDER, address: ladder.pair, functionName: "getOrder", args: [false, id] }),
          ),
        );
        return {
          active: true,
          takerFeeNum: Number(takerFee),
          steps: orders.map((o) => ({
            price: o.price,
            remaining: o.owner.toLowerCase() === escrow ? o.depositAmount : BigInt(0),
          })),
        };
      } catch {
        return INACTIVE;
      }
    },
  });
  return data ?? INACTIVE;
}
