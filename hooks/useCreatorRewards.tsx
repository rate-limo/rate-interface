"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getPublicClient } from "@wagmi/core";
import { formatUnits } from "viem";
import { BandPositionManagerABI } from "@iter/abis";
import { wagmiConfig } from "@/lib/providers";
import { chainIds } from "@/consts";
import { wagmiChains } from "@/lib/customChains";
import { positionManagerAddress } from "@/lib/deployments";
import { useCrossChainNetworks } from "@/hooks/useCrossChainPositions";
import { getAccountLpPositions, getCreatorAuctions } from "@/queries/server/profile";

/**
 * What a wallet's LP positions have earned it in fees.
 *
 * ## It used to be able to see auctions only
 *
 * The list came from `getCreatorAuctions(…)`, filtered to sales carrying a
 * `positionTokenId` — which only a GRADUATED AUCTION has. Every position created
 * by an ordinary launch was therefore not missing but unreachable: no query
 * could return it. Measured on Arc, wallet 0x9E7A…850E: the auctions endpoint
 * answered `[]` while `/leaderboard/lps` reported four open positions across four
 * pools with $400,000 of open cost. The tab rendered empty.
 *
 * The list now comes from `broker.bandPositions` (`getAccountLpPositions`), the
 * ledger the LP board itself ranks on, so a plain launch's position appears the
 * same way an auction's does. Auctions are still read — they are the only source
 * for `liquidityUnlockAt`, which the ledger does not carry — and merged in by
 * `tokenId`.
 *
 * ## And only one chain
 *
 * `positionManagerAddress(networkName)` pinned it to whatever was in `?chain=`,
 * beside tabs that read every chain. It fans out now; `networkName` survives as
 * the chain that sorts first.
 *
 * ## No backend, and that is not a shortcut
 *
 * A graduated `PresaleLaunch` puts `lpBps` of the raise (at least 20%) into a
 * BandPool position held by the contract until `liquidityUnlockAt`.
 * `presaleCampaigns` records that position's `positionTokenId`, and
 * `BandPositionManager.portfolio(tokenIds)` is a **view** that answers every
 * position in ONE call — its own docstring says it exists to refuse the N+1 of
 * asking the pool per position. So claimable fees are a chain read, the same
 * shape as `useWalletBalances`, and nothing needs indexing.
 *
 * What DOES need indexing is lifetime fees *claimed*: `BandFeesClaimed` is
 * emitted and calls itself the sole source for LP income, but
 * `apps/broker/src/processors/BandPool.ts` acknowledges the BandPool events
 * without aggregating them. Until a processor exists this hook can only answer
 * "owed right now", which is why the panel leads with that rather than a total.
 *
 * ## Owed is not withdrawable
 *
 * `vestedBase`/`vestedQuote` are fees the position may collect, and collecting
 * them does not touch the LIQUIDITY, which stays locked until
 * `liquidityUnlockAt`. Those are two different clocks and the UI must not merge
 * them: a creator can take fees today on a position they cannot withdraw for
 * months. `unlockAt` rides along so the panel can say so.
 */

export interface CreatorReward {
  /** ERC-1155 id of the LP position, as a decimal string (it is a uint256). */
  tokenId: string;
  /** Which chain the position is on. The rows are merged across chains, and a
   *  claim can only be sent to the manager on one of them. */
  networkName: string;
  pool: string;
  coin: string;
  symbol: string;
  quoteSymbol: string;
  /** Claimable now, in token units — already decimal-adjusted for display. */
  vestedBase: string;
  vestedQuote: string;
  /** Raw, for a claim's own arithmetic and for an "is there anything?" check. */
  vestedBaseRaw: bigint;
  vestedQuoteRaw: bigint;
  /**
   * Fee vesting, 0–100. NOT the liquidity lock — see the module note. A pool
   * expresses this as a numerator on its own scale, normalised here.
   */
  vestedPct: number;
  /** Unix seconds the LOCKED LIQUIDITY unlocks. Null before graduation. */
  unlockAt: number | null;
}

/** `vestedNum` is a uint32 numerator over 1e6, the scale PoolFeeMath uses. */
const VESTED_DENOM = 1_000_000;

function pct(vestedNum: number | bigint): number {
  const n = Number(vestedNum);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, (n / VESTED_DENOM) * 100));
}

/** One chain's rewards, kept whole so a failed chain is absent rather than zero. */
interface ChainRewards {
  networkName: string;
  rewards: CreatorReward[];
}

/**
 * Read one chain's LP positions and mark them to what is claimable right now.
 *
 * Two sources, and the order matters. `bandPositions` decides WHICH positions
 * exist — it is the ledger, and it covers plain launches as well as auctions.
 * The auctions read supplies only `liquidityUnlockAt`, which the ledger has no
 * column for; a position with no auction behind it simply has no lock date,
 * which is the truth rather than a gap.
 */
async function fetchChainRewards(networkName: string, address: string): Promise<ChainRewards> {
  const [lp, auctionsRaw] = await Promise.all([
    getAccountLpPositions(networkName, address),
    getCreatorAuctions(networkName, address, 50, 1),
  ]);

  const rows = Array.isArray(lp?.positions) ? (lp.positions as Record<string, unknown>[]) : [];
  // A position with no `tokenId` has no manager-side half yet — a pool event
  // whose ERC-1155 mint has not been indexed. It cannot be claimed against, so
  // it cannot be listed as claimable.
  const withIds = rows.filter((r) => r.tokenId !== null && r.tokenId !== undefined);
  if (withIds.length === 0) return { networkName, rewards: [] };

  const manager = positionManagerAddress(networkName);
  // Narrowed through `wagmiChains` rather than cast: the config is built from a
  // const tuple, so its actions accept only the literal union of ids it was
  // given, and a chain the wallet config does not know must be skipped rather
  // than forced through. Same narrowing `lib/launch/execution.ts` documents.
  const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
  if (!manager || !chain) return { networkName, rewards: [] };
  // Per chain, not the connected wallet's chain: `usePublicClient()` follows the
  // wallet, which is exactly how a cross-chain read ends up asking one network
  // about another's positions.
  const client = getPublicClient(wagmiConfig, { chainId: chain.id });
  if (!client) return { networkName, rewards: [] };

  /** `liquidityUnlockAt` by position id — the one thing only an auction knows. */
  const unlockByTokenId = new Map<string, number>();
  const auctions = Array.isArray(auctionsRaw?.auctions)
    ? (auctionsRaw.auctions as Record<string, unknown>[])
    : [];
  for (const auction of auctions) {
    const id = auction.positionTokenId;
    const unlock = Number(auction.liquidityUnlockAt);
    if (id !== null && id !== undefined && Number.isFinite(unlock) && unlock > 0) {
      unlockByTokenId.set(String(id), unlock);
    }
  }

  const tokenIds = withIds.map((r) => BigInt(String(r.tokenId)));

  const portfolio = (await client.readContract({
    address: manager as `0x${string}`,
    abi: BandPositionManagerABI,
    functionName: "portfolio",
    args: [tokenIds],
  })) as readonly {
    tokenId: bigint;
    pool: `0x${string}`;
    base: `0x${string}`;
    quote: `0x${string}`;
    position: {
      vestedBase: bigint;
      vestedQuote: bigint;
      vestedNum: number;
    };
  }[];

  // Zipped by INDEX, which is safe only because `portfolio` returns one row per
  // requested id in order — the contract builds its result by iterating
  // `tokenIds`. Matching on tokenId instead would be defensive noise suggesting
  // a reordering the ABI does not permit.
  return {
    networkName,
    rewards: portfolio.map((entry, i) => {
      const row = withIds[i]!;
      const baseDecimals = Number(row.baseDecimals ?? 18);
      const quoteDecimals = Number(row.quoteDecimals ?? 18);
      const tokenId = entry.tokenId.toString();
      return {
        tokenId,
        networkName,
        pool: entry.pool,
        coin: String(row.base ?? entry.base ?? ""),
        symbol: String(row.baseSymbol ?? "?"),
        quoteSymbol: String(row.quoteSymbol ?? "?"),
        vestedBase: formatUnits(entry.position.vestedBase, baseDecimals),
        vestedQuote: formatUnits(entry.position.vestedQuote, quoteDecimals),
        vestedBaseRaw: entry.position.vestedBase,
        vestedQuoteRaw: entry.position.vestedQuote,
        vestedPct: pct(entry.position.vestedNum),
        unlockAt: unlockByTokenId.get(tokenId) ?? null,
      };
    }),
  };
}

export function useCreatorRewards(
  /** The chain being viewed. Sorts first; no longer decides what is read. */
  networkName: string,
  address: string | undefined,
) {
  // Narrowed by the operator's admin overrides — see useCrossChainNetworks.
  const networks = useCrossChainNetworks();

  const results = useQueries({
    queries: networks.map((chain) => ({
      queryKey: ["creator-rewards", chain, address?.toLowerCase()],
      enabled: !!address,
      queryFn: async (): Promise<ChainRewards> => {
        if (!address) return { networkName: chain, rewards: [] };
        return fetchChainRewards(chain, address);
      },
    })),
  });

  const statuses = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => results.map((r) => ({ status: r.status, data: r.data })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((r) => r.status).join(","), results.map((r) => r.dataUpdatedAt).join(",")],
  );

  const rewards = useMemo(() => {
    const answered = statuses
      .filter((r) => r.status === "success" && r.data)
      .map((r) => r.data as ChainRewards);
    return answered
      .flatMap((c) => c.rewards)
      .sort((a, b) => {
        // Viewed chain first — the reader arrived on one, and a claim is made on
        // one. Then most-owed, so what is worth acting on is at the top.
        const home = (r: CreatorReward) => (r.networkName === networkName ? 0 : 1);
        if (home(a) !== home(b)) return home(a) - home(b);
        return Number(b.vestedBaseRaw - a.vestedBaseRaw);
      });
  }, [statuses, networkName]);

  const failedChains = useMemo(
    () =>
      statuses
        .map((r, i) => (r.status === "error" ? (networks[i] ?? "") : null))
        .filter((n): n is string => !!n),
    [statuses, networks],
  );

  return {
    rewards,
    /**
     * Whether anything is claimable ON THE VIEWED CHAIN. Drives the Claim
     * control — a button that submits a transaction moving zero tokens costs gas
     * and does nothing.
     *
     * Scoped to one chain deliberately, and it has to match `tokenIds` below: a
     * claim goes to a single `BandPositionManager`, so measuring this across
     * every chain would enable the button on the strength of fees it is not
     * about to collect, then send an empty id list.
     */
    hasClaimable: rewards.some(
      (r) =>
        r.networkName === networkName &&
        (r.vestedBaseRaw > BigInt(0) || r.vestedQuoteRaw > BigInt(0)),
    ),
    /**
     * Chains OTHER than the viewed one that have fees waiting, so the panel can
     * point at them instead of leaving the reader to discover it by switching.
     */
    claimableElsewhere: [
      ...new Set(
        rewards
          .filter(
            (r) =>
              r.networkName !== networkName &&
              (r.vestedBaseRaw > BigInt(0) || r.vestedQuoteRaw > BigInt(0)),
          )
          .map((r) => r.networkName),
      ),
    ],
    /**
     * Claimable ids for ONE chain — the chain being viewed.
     *
     * A claim is a transaction on a single `BandPositionManager`, so this cannot
     * be the cross-chain list even though the rows above are: sending another
     * chain's token ids to this chain's manager addresses positions that do not
     * exist there. The panel switches chains to claim the rest.
     */
    tokenIds: rewards.filter((r) => r.networkName === networkName).map((r) => BigInt(r.tokenId)),
    isLoading: !!address && statuses.some((r) => r.status === "pending"),
    /** Chains whose read failed — their positions are absent, not zero. */
    failedChains,
    /** True when EVERY chain failed, which is distinct from an empty result. */
    failed: !!address && statuses.length > 0 && statuses.every((r) => r.status === "error"),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}
