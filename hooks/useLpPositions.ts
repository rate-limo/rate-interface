"use client";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPublicClient } from "@wagmi/core";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { BandPositionManagerABI } from "@iter/abis";
import { wagmiConfig } from "@/lib/providers";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { positionManagerAddress } from "@/lib/deployments";
import { toastContractError } from "@/lib/errors/toastContractError";
import { eventBus } from "@/utils/events";
import { awaitReceipt } from "@/lib/tx/awaitReceipt";
import { getAccountLpPositions } from "@/queries/server/profile";
import {
  type ChainPositionView,
  type GatewayLpPosition,
  type LpToken,
  mergeLpPositions,
} from "@/lib/liquidity/positions";

/**
 * A wallet's LP positions on one chain: one `LpToken` per ERC-1155 token, bands inside.
 *
 * Which tokens exist and what they cost comes from the gateway; what each can collect
 * and what is still vesting comes from `BandPositionManager.portfolio(tokenIds)` in ONE
 * call. See lib/liquidity/positions.ts for why the two are separate authorities.
 */
export async function fetchLpPositions(networkName: string, address: string): Promise<LpToken[]> {
  const lp = await getAccountLpPositions(networkName, address);
  const rows = Array.isArray(lp?.positions) ? (lp.positions as GatewayLpPosition[]) : [];
  if (rows.length === 0) return [];

  const chainView = new Map<string, ChainPositionView>();
  const manager = positionManagerAddress(networkName);
  const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
  const open = rows.filter((r) => r.active);
  if (manager && chain && open.length > 0) {
    const client = getPublicClient(wagmiConfig, { chainId: chain.id });
    try {
      const views = (await client?.readContract({
        address: manager as `0x${string}`,
        abi: BandPositionManagerABI,
        functionName: "portfolio",
        args: [open.map((r) => BigInt(String(r.tokenId)))],
      })) as readonly ChainPositionView[] | undefined;
      // One row per requested id, in order: the contract builds its result by
      // iterating `tokenIds`.
      views?.forEach((view, i) => chainView.set(String(open[i]!.tokenId), view));
    } catch {
      // The positions still exist; their live fees are simply unknown (`live: false`).
    }
  }
  return mergeLpPositions(networkName, rows, chainView);
}

export function useLpPositions(networkName: string, address: string | undefined) {
  const queryClient = useQueryClient();
  const key = useMemo(
    () => ["lp-positions", networkName, address?.toLowerCase()],
    [networkName, address],
  );

  /**
   * Refetch the moment an LP action lands, instead of up to a minute later.
   *
   * `send` below already emits `spot-balance-refetch` after a receipt, and every
   * manager call goes through it — collect, increase, decrease, move, burn. Until
   * now only the BALANCE readers listened, so the position that had just changed
   * kept its old numbers until the interval came round. On the pair profile that
   * reads as "the page does not update after LPing", which is exactly how it was
   * reported.
   */
  useEffect(() => {
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: key });
    };
    eventBus.on("spot-balance-refetch", refetch);
    return () => {
      eventBus.off("spot-balance-refetch", refetch);
    };
  }, [queryClient, key]);

  return useQuery({
    queryKey: key,
    enabled: !!address,
    queryFn: () => fetchLpPositions(networkName, address as string),
    // Vesting moves every block; a minute is fresh enough for a card and the flows
    // re-read the chain themselves before anything is signed.
    refetchInterval: 60_000,
  });
}

/**
 * What a manager call came to.
 *
 * `null` is a DEFINITE failure — it threw, or it mined and reverted. A sent
 * transaction that has not been observed to settle is `confirmed: false`, which
 * is neither, and callers must render it as neither.
 */
export type SendResult = { hash: `0x${string}`; confirmed: boolean } | null;

type ManagerFn =
  | "collect"
  | "decreaseLiquidity"
  | "decreaseBand"
  | "moveLiquidity"
  | "redistribute"
  | "increaseLiquidity"
  | "burn";

/**
 * Send one call to this chain's `BandPositionManager` and wait for it.
 *
 * Switches the wallet to the position's chain first -- a position lives on exactly one
 * manager -- and treats a mined-but-reverted receipt as a failure, because a reverted
 * transaction HAS a receipt and only `status` tells the two apart.
 */
export function useManagerTx(networkName: string) {
  const { chainId: connected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const chainId = chainIds[networkName];
  const publicClient = usePublicClient({ chainId });
  const manager = positionManagerAddress(networkName);

  const send = useCallback(
    async (functionName: ManagerFn, args: readonly unknown[], failure: string): Promise<SendResult> => {
      if (!manager || !publicClient) {
        toast.error("No position manager is deployed on this network");
        return null;
      }
      try {
        if (chainId && connected !== chainId) await switchChainAsync({ chainId });
        const hash = await writeContractAsync({
          address: manager as `0x${string}`,
          abi: BandPositionManagerABI,
          functionName,
          // biome-ignore lint/suspicious/noExplicitAny: args are checked per call site against the ABI
          args: args as any,
          chainId,
        });
        const settled = await awaitReceipt(publicClient, hash);
        if (settled.status === "reverted") {
          toast.error(`${failure}: reverted on chain`);
          return null;
        }
        if (settled.status === "unknown") {
          /*
           * Sent, and not seen to settle. NOT a failure: returning null here is
           * what left a dialog back on its own confirm screen with a live
           * transaction in flight, inviting a second signature — on a
           * withdrawal, how one becomes two. The caller is told it is
           * unconfirmed and says so instead.
           */
          toast.message("Sent — still confirming on chain", {
            description: "It may take a moment to appear. Do not send it again.",
          });
          eventBus.emit("spot-balance-refetch");
          return { hash, confirmed: false };
        }
        eventBus.emit("spot-balance-refetch");
        return { hash, confirmed: true };
      } catch (error) {
        toastContractError(error, failure, { chainId });
        return null;
      }
    },
    [manager, publicClient, chainId, connected, switchChainAsync, writeContractAsync],
  );

  return { send, manager, publicClient, chainId };
}

/** A deadline 20 minutes out -- every value-moving manager call takes one. */
export function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
}
