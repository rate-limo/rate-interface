"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "wagmi/actions";
import { BandPoolFactoryABI, MatchingEngineABI } from "@iter/abis";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { wagmiConfig } from "@/lib/providers";
import { matchingEngineAddress, poolFactoryAddress } from "@/lib/deployments";
import { resolveBandPool } from "@/lib/swap/bandPool";
import { marketState, type MarketState } from "@/lib/liquidity/marketExists";
import { isNativeAddress } from "@/lib/swap/wrap";

/**
 * Whether this pair already has a book and a pool, answered BEFORE the form.
 *
 * `ConfirmFlow` performs these same two reads, one transaction from the end —
 * which is the right place for the backstop and the wrong place for the only
 * check. Launch mode asked for a starting price it would discard because
 * nothing looked until then.
 *
 * ## A failed read is `checking`, never `none`
 *
 * `none` is what unlocks the launch button, so degrading to it on an unreachable
 * RPC would offer a launch that then reverts `PairAlreadyExists` after two
 * approvals — the same "approve, then refuse itself" shape the deposit guards
 * exist to remove. Staying on `checking` costs a disabled button on a broken
 * connection, which is the safe direction.
 */
export function useMarketExists(
  networkName: string,
  baseAddress: string | undefined,
  quoteAddress: string | undefined,
): MarketState {
  const query = useQuery({
    queryKey: ["market-exists", networkName, baseAddress, quoteAddress],
    enabled: Boolean(networkName) && Boolean(baseAddress) && Boolean(quoteAddress),
    // A pair is listed once and never unlisted, so the answer only changes when
    // somebody lists this exact pair — rare, and ConfirmFlow re-reads anyway.
    staleTime: 30_000,
    queryFn: async () => {
      if (!baseAddress || !quoteAddress) return null;
      const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
      const client = chain ? getPublicClient(wagmiConfig, { chainId: chain.id }) : undefined;
      const engine = matchingEngineAddress(networkName);
      const factory = poolFactoryAddress(networkName);
      if (!client || !engine || !factory) return null;

      /*
       * THE NATIVE ROW IS A SENTINEL, AND NOTHING IS LISTED AGAINST IT.
       *
       * The token list gives the native asset `0xEeee…EEeE`, while the pair and
       * the pool are keyed on the WETH CONTRACT the engine was initialised with.
       * Asking `getPair(0xEeee…, USDC)` therefore answers zero for a market that
       * plainly exists — measured on RISE, where ETH/USDC is book `0xFCAeaAB5`
       * and this read called it a new market.
       *
       * Read the address off the ENGINE rather than a table: `WETH()` is the one
       * definition that counts, there is more than one WETH9 deployed on RISE,
       * and on Arc it is USDC itself.
       */
      const weth = (await client.readContract({
        abi: MatchingEngineABI,
        address: engine as `0x${string}`,
        functionName: "WETH",
      })) as `0x${string}`;
      const listed = (a: string) => (isNativeAddress(a) ? weth : (a as `0x${string}`));
      const baseListed = listed(baseAddress);
      const quoteListed = listed(quoteAddress);

      const pair = (await client.readContract({
        abi: MatchingEngineABI,
        address: engine as `0x${string}`,
        functionName: "getPair",
        args: [baseListed, quoteListed],
      })) as `0x${string}`;

      /*
       * BOTH orientations, through the shared helper rather than a second copy
       * of the rule: `getPool`'s CREATE2 salt is keyed on argument order, so a
       * pool listed the other way round is still a pool.
       */
      const read = (a: string, b: string) =>
        client.readContract({
          abi: BandPoolFactoryABI,
          address: factory as `0x${string}`,
          functionName: "getPool",
          args: [a as `0x${string}`, b as `0x${string}`],
        }) as Promise<`0x${string}`>;
      const resolved = resolveBandPool(
        await read(baseListed, quoteListed),
        await read(quoteListed, baseListed),
      );

      return { pair, pool: resolved?.pool ?? "0x0000000000000000000000000000000000000000" };
    },
  });

  // `undefined` while loading AND on failure — see the docstring: `none` is the
  // state that unlocks launching, and a read that did not happen has not earned it.
  if (!query.data) return marketState(undefined, undefined);
  return marketState(query.data.pair, query.data.pool);
}
