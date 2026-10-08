"use client";
import { useQuery } from "@tanstack/react-query";
import { getPublicClient } from "@wagmi/core";
import { BandPoolABI, BandPoolFactoryABI, MatchingEngineABI } from "@iter/abis";
import { wagmiConfig } from "@/lib/providers";
import { chainIds } from "@/consts";
import { poolFactoryAddress } from "@/lib/deployments";
import { resolveBandPool } from "@/lib/swap/bandPool";
import { wagmiChains } from "@/lib/customChains";
import { getPoolLiquidity } from "@/queries/server/liquidity";
import { toBandSet, type ChainBand, type ChainBandSet } from "@/lib/liquidity/bandSet";
import type { BandSet } from "@/lib/liquidity/bands";

/**
 * The pool's own band ladder, read from the chain.
 *
 * ## Why this is a read and not a constant
 *
 * `mockBandSet()` was the deposit flow's ladder, and `apps/web/CLAUDE.md`
 * carried "the band set is still `mockBandSet()`, which matches a stock
 * three-band pool by coincidence" as an open item. The coincidence does not
 * hold — see `lib/liquidity/bandSet.ts` for the measured comparison — and the
 * consequence is not cosmetic: `usableBands` compares each tolerance against
 * `spreadReach`, so a ladder five times too wide offers bands
 * `BandPool._requireWithinSpread` reverts on, AFTER the deposit's two
 * approvals.
 *
 * ## Everything comes from one pool and one engine call
 *
 * `bandCount()` decides the loop; `bands(i)` carries tolerance and open;
 * `bandFeeMultiplier(i)` and `bandReserves(i)` fill the rest. `spreadReach` is
 * the ENGINE's, because that is where `_requireWithinSpread` reads it —
 * `min(getSpread(ob, true, true), getSpread(ob, false, true))`.
 *
 * The base LP fee is the gateway's `aprBasis.lpFeeRate` rather than
 * `effectiveFeeRate`, which scales with a trade's impact and returns the 3% cap
 * for anything large against a thin band.
 *
 * ## Null is "do not plan", never "use the mock"
 *
 * A failed read resolves null and the caller decides. Falling back to the mock
 * here would restore exactly the bug being fixed, silently and only on the
 * machines where the read failed.
 */
export function useBandSet(
  networkName: string,
  baseAddress: string | undefined,
  quoteAddress: string | undefined,
) {
  return useQuery<BandSet | null>({
    queryKey: ["band-set", networkName, baseAddress, quoteAddress],
    enabled: Boolean(baseAddress) && Boolean(quoteAddress) && Boolean(networkName),
    // The ladder is pinned on the pool's first deposit and does not move after;
    // what changes underneath is reserves, which nothing here decides on.
    staleTime: 60_000,
    queryFn: async () => {
      if (!baseAddress || !quoteAddress) return null;
      const chain = wagmiChains.find((c) => c.id === chainIds[networkName]);
      if (!chain) return null;
      const client = getPublicClient(wagmiConfig, { chainId: chain.id });
      if (!client) return null;

      /*
       * BOTH orders, because `getPool`'s CREATE2 salt is keyed on the argument
       * order — the same resolution `ConfirmFlow.blockedBand` does, through the
       * same helper rather than a second copy of the rule.
       */
      const factory = poolFactoryAddress(networkName);
      if (!factory) return null;
      const read = (a: string, b: string) =>
        client.readContract({
          abi: BandPoolFactoryABI,
          address: factory as `0x${string}`,
          functionName: "getPool",
          args: [a as `0x${string}`, b as `0x${string}`],
        }) as Promise<`0x${string}`>;
      const resolved = resolveBandPool(
        await read(baseAddress, quoteAddress),
        await read(quoteAddress, baseAddress),
      );
      // No pool is not a failure — it is the "Launch a pool" case, and the
      // caller decides what an absent ladder means.
      if (!resolved) return null;
      const pool = resolved.pool;

      const poolContract = { address: pool, abi: BandPoolABI } as const;
      const [count, maturity, orderbook, engine, base, quote] = await Promise.all([
        client.readContract({ ...poolContract, functionName: "bandCount" }),
        client.readContract({ ...poolContract, functionName: "maturity" }),
        client.readContract({ ...poolContract, functionName: "orderbook" }),
        client.readContract({ ...poolContract, functionName: "engine" }),
        client.readContract({ ...poolContract, functionName: "base" }),
        client.readContract({ ...poolContract, functionName: "quote" }),
      ]);

      const total = Number(count);
      if (!Number.isFinite(total) || total <= 0) return null;

      const indexes = Array.from({ length: total }, (_, i) => i);
      const [bandRows, tolerances, multipliers, reserves] = await Promise.all([
        Promise.all(
          indexes.map((i) =>
            client.readContract({ ...poolContract, functionName: "bands", args: [i] }),
          ),
        ),
        /*
         * `bandTolerances`, NOT `bands(i)[0]`.
         *
         * In LP v2 that first field is `spreadFrac` — the band's share of the
         * pair's limit, per the contract's own docstring: `tolerance =
         * spreadFrac x pairLimit(side) / DENOM`. Measured on Arc's TITER/USDC
         * pool 0x8a7cCE…6D15: spreadFrac reads 2e7/6e7/1e8 (20%/60%/100%) while
         * the derived tolerances are 2e4/6e4/1e5 (0.02%/0.06%/0.10%).
         *
         * Reading the first field as an absolute half-width made every band
         * look 200x wider than the pair's reach, so `bandReachable` refused all
         * of them, `usableBands` came back EMPTY, and the deposit card lost its
         * band distribution entirely — `BandShapePicker` hides itself below two
         * usable bands. It was right to; the input was wrong.
         *
         * It read correctly on a v1 pool, where the stored value was already
         * absolute, which is why the first verification of this hook passed.
         */
        Promise.all(
          indexes.map((i) =>
            client.readContract({ ...poolContract, functionName: "bandTolerances", args: [i] }),
          ),
        ),
        Promise.all(
          indexes.map((i) =>
            client.readContract({ ...poolContract, functionName: "bandFeeMultiplier", args: [i] }),
          ),
        ),
        Promise.all(
          indexes.map((i) =>
            client.readContract({ ...poolContract, functionName: "bandReserves", args: [i] }),
          ),
        ),
      ]);

      /*
       * The SMALLER of the two sides, because that is the one that binds —
       * `_requireWithinSpread` takes `up < down ? up : down` and a band wider
       * than it reverts.
       */
      const spread = await Promise.all(
        [true, false].map((isBuy) =>
          client.readContract({
            address: engine as `0x${string}`,
            abi: MatchingEngineABI,
            functionName: "getSpread",
            args: [orderbook as `0x${string}`, isBuy, true],
          }),
        ),
      );
      const spreadReach = Math.min(...spread.map((s) => Number(s)));
      // `_requireWithinSpread` returns early on a zero reach — "not knowable
      // yet". Planning against it would mark every band unusable, so this is a
      // refusal to answer rather than an answer of none.
      if (!Number.isFinite(spreadReach) || spreadReach <= 0) return null;

      // Non-fatal: the fee only feeds the single-sided ESTIMATE, so a gateway
      // that cannot answer costs precision, not the ladder.
      const poolStats = await getPoolLiquidity(networkName, base as string, quote as string);

      const bands: ChainBand[] = indexes.map((i) => {
        const row = bandRows[i] as readonly [number, bigint, bigint, bigint, boolean];
        const res = reserves[i] as readonly [bigint, bigint];
        const tol = tolerances[i] as readonly [number, number];
        return {
          // The SMALLER side binds, the same way `_requireWithinSpread` takes
          // `up < down ? up : down`: a band is only usable if both directions
          // fit inside the pair's limit.
          tolerance: Math.min(Number(tol[0]), Number(tol[1])),
          open: Boolean(row[4]),
          feeMultiplier: Number(multipliers[i]),
          baseReserve: res[0],
          quoteReserve: res[1],
        };
      });

      const chainSet: ChainBandSet = {
        maturitySec: Number(maturity),
        spreadReach,
        lpFeeRate: poolStats?.aprBasis?.lpFeeRate ?? 0,
        bands,
      };
      return toBandSet(chainSet);
    },
  });
}
