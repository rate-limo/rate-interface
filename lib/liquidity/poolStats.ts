import { gatewayFetch } from "@/lib/realtime/watermark";
import "server-only";
import { derivePools, poolTotals, splitPools, type PoolRow } from "./derive";
import { PonderLinks, defaultConnectedChain } from "@/consts";

/** Mirrors admin-service's DEFAULT_CONFIG.thresholdUsd — the value served when
 * the settings row has never been written. Duplicated rather than imported
 * because apps/web does not depend on admin-service; the config row is the
 * single source of truth whenever one exists. */
const DEFAULT_THRESHOLD_USD = 100_000;

/**
 * Market-wide liquidity stats for the /pool overview.
 *
 * Same contract as lib/iter/protocolMetrics.ts: one query, and a zero-state with
 * `isFallback` on throw. That flag matters — an empty pool table reads as "Rate
 * has no liquidity", a very different claim from "we can't reach the indexer", so
 * the component has to be able to tell them apart.
 *
 * The maths lives in ./derive so it can be unit-tested without server-only or a
 * db client. This file is just the query and the failure mode.
 *
 * ## What is deliberately absent
 *
 * - **Fee tier** (0.05 / 0.30 / 1.00%): a Pool.sol concept, not a column on
 *   spotPairs. Rendering the flat protocol rate on every row would be a column
 *   of identical values pretending to be a differentiator.
 * - **Depth ±2%**: comes off the order book, one query per pair. It's the column
 *   that makes this page Rate's rather than a generic AMM's, so it's worth
 *   adding — as its own change, not behind a fabricated number.
 *
 * The APR is also gross. The Rate dashboard advertises LP yield "net of estimated
 * impermanent loss"; that estimate is a modelling decision nobody has made yet,
 * so the UI labels this one honestly instead.
 */

const BASE_TAKER_FEE_RATE = 0.001;

export type { PoolRow } from "./derive";

export interface LiquidityOverview {
  /** Graduated markets. The headline totals cover these and only these. */
  pools: PoolRow[];
  /** Pre-graduation markets, kept out of the totals — see below. */
  launches: PoolRow[];
  totalTvlUsd: number;
  totalVolume24hUsd: number;
  totalFees24hUsd: number;
  medianAprPct: number;
  feeRate: number;
  /** USD of quote liquidity a launch pool needs to list. */
  thresholdUsd: number;
  isFallback: boolean;
}

/**
 * Read every pool, then split on the listing gate.
 *
 * This query deliberately does NOT filter in SQL, unlike the gateway's list
 * endpoints. The page needs both halves: listed pools for the table and the
 * totals, unlisted ones for the Launches filter — providing quote liquidity to
 * an unlisted market is what graduates it, so hiding them here would make the
 * threshold unreachable. What changed is that they are now separated and
 * labelled, rather than silently mixed into "Total value locked".
 */
export async function getLiquidityOverview(networkName = defaultConnectedChain): Promise<LiquidityOverview> {
  try {
    const gateway = PonderLinks[networkName];
    if (!gateway) throw new Error(`No gateway configured for ${networkName}`);
    const [listedResponse, launchesResponse] = await Promise.all([
      gatewayFetch(`${gateway}/api/pairs/1000/1`, { cache: "no-store" }),
      gatewayFetch(`${gateway}/api/pairs/unlisted/1000/1`, { cache: "no-store" }),
    ]);
    if (!listedResponse.ok || !launchesResponse.ok) {
      throw new Error(`Pair gateway returned ${listedResponse.status}/${launchesResponse.status}`);
    }
    const [listedBody, launchesBody] = await Promise.all([
      listedResponse.json(),
      launchesResponse.json(),
    ]);
    const pairs = [...(listedBody.pairs ?? []), ...(launchesBody.pairs ?? [])];

    const { listed, launches } = splitPools(derivePools(pairs, BASE_TAKER_FEE_RATE));

    return {
      pools: listed,
      launches,
      // Listed pools only. An unlisted $6k book inside a median LP APR moves a
      // number people size positions against.
      ...poolTotals(listed),
      feeRate: BASE_TAKER_FEE_RATE,
      thresholdUsd: DEFAULT_THRESHOLD_USD,
      isFallback: false,
    };
  } catch (error) {
    console.warn("Liquidity overview unavailable; rendering zero-state.", error);
    return {
      pools: [],
      launches: [],
      totalTvlUsd: 0,
      totalVolume24hUsd: 0,
      totalFees24hUsd: 0,
      medianAprPct: 0,
      feeRate: BASE_TAKER_FEE_RATE,
      thresholdUsd: DEFAULT_THRESHOLD_USD,
      isFallback: true,
    };
  }
}
