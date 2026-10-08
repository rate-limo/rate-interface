"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useCrossChainNetworks } from "@/hooks/useCrossChainPositions";
import { getCreatorAuctions } from "@/queries/server/profile";
import { fetchLpPositions } from "@/hooks/useLpPositions";

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
 * The list now comes from the per-token LP ledger (`lpPositions`, via
 * `fetchLpPositions`), the ledger the LP board itself ranks on, so a plain launch's position appears the
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
  // One source with /pool: the gateway's per-token list joined with ONE
  // `portfolio(tokenIds)` read, so the two surfaces cannot disagree about what a
  // token can collect. Claimable is owed + every band's vested part (v2).
  const [tokens, auctionsRaw] = await Promise.all([
    fetchLpPositions(networkName, address),
    getCreatorAuctions(networkName, address, 50, 1),
  ]);

  /** `liquidityUnlockAt` by position id -- the one thing only an auction knows. */
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

  return {
    networkName,
    rewards: tokens
      // Only tokens the chain answered for: a claim needs a real figure, not a guess.
      .filter((t) => t.active && t.live)
      .map((t) => ({
        tokenId: t.tokenId,
        networkName,
        pool: t.pool,
        coin: t.base,
        symbol: t.baseSymbol,
        quoteSymbol: t.quoteSymbol,
        vestedBase: formatUnits(t.claimableBase, t.baseDecimals),
        vestedQuote: formatUnits(t.claimableQuote, t.quoteDecimals),
        vestedBaseRaw: t.claimableBase,
        vestedQuoteRaw: t.claimableQuote,
        vestedPct: t.vestedPct ?? 0,
        unlockAt: unlockByTokenId.get(t.tokenId) ?? null,
      })),
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
