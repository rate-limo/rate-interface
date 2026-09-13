import type { QuoteInput, SwapQuote, SwapToken, HopFill, RestingPlacement } from "./types";

/**
 * MOCK quote engine — the illustrative model behind the swap card today.
 *
 * It reproduces the approved UX: hub-and-spoke routing (most swaps 2 hops via a
 * hub token), a per-hop fill cascade where only matched value proceeds, price
 * impact on the matched part, and the invariant `delivered + Σplaced === paid`.
 *
 * Replace `quoteSwap` with the real Router/Pool.sol quote when the routing
 * algorithm lands — keep the SwapQuote shape so the card is unchanged.
 * See apps/web/CLAUDE.md.
 */

const HUB = "USDC";
const IMPACT_K = 1.1; // % at full depth
const TAKER_FEE = 0.001; // 0.10%

// Immediate-fill depth per directed hop (USD notional), illustrative.
const DEPTH: Record<string, number> = {
  "WBTC>USDC": 80_000,
  "USDC>ETH": 35_000,
  "USDC>USDT": 90_000,
  "USDC>WBTC": 40_000,
};
const DEFAULT_DEPTH = 50_000;

function depthUsd(a: string, b: string): number {
  return DEPTH[`${a}>${b}`] ?? DEPTH[`${b}>${a}`] ?? DEFAULT_DEPTH;
}

/** Hub-and-spoke: direct if either side is the hub, else route through the hub. */
export function routeTokens(pay: SwapToken, get: SwapToken, hub: SwapToken): SwapToken[] {
  if (pay.symbol === HUB || get.symbol === HUB) return [pay, get];
  return [pay, hub, get];
}

export function quoteSwap(input: QuoteInput, hub: SwapToken): SwapQuote {
  const { pay, get, amountIn } = input;
  const slip = input.slippagePct ?? 0.005;
  const route = routeTokens(pay, get, hub);

  // Cascade: each hop matches up to depth; only matched value proceeds.
  const hops: HopFill[] = [];
  let flowUsd = amountIn * pay.priceUsd;
  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i];
    const to = route[i + 1];
    const d = depthUsd(from.symbol, to.symbol);
    const matchedUsd = Math.min(flowUsd, d);
    const placedUsd = flowUsd - matchedUsd;
    hops.push({ from, to, inUsd: flowUsd, matchedUsd, placedUsd, depthUsd: d });
    flowUsd = matchedUsd;
  }

  const last = hops[hops.length - 1];
  const impactPct = IMPACT_K * (last.matchedUsd / last.depthUsd);
  const gp = get.priceUsd;
  const delivered = (last.matchedUsd / gp) * (1 - impactPct / 100) * (1 - TAKER_FEE);
  const deliveredUsd = last.matchedUsd;
  const placedUsd = hops.reduce((s, h) => s + h.placedUsd, 0);

  const placements: RestingPlacement[] = hops
    .filter((h) => h.placedUsd > 0)
    .map((h) => ({
      from: h.from,
      to: h.to,
      inAmount: h.placedUsd / h.from.priceUsd,
      outAmount: h.placedUsd / h.to.priceUsd,
      settlesToTarget: h.to.symbol === get.symbol,
    }));

  return {
    amountIn,
    payUsd: amountIn * pay.priceUsd,
    route,
    hops,
    delivered,
    deliveredUsd,
    placedUsd,
    placements,
    impactPct,
    minReceived: delivered * (1 - slip),
    feeUsd: deliveredUsd * TAKER_FEE,
  };
}

/** Estimated single-sided LP fee APR for a hop's pool (illustrative). */
const LP_APR: Record<string, number> = {
  "USDC>ETH": 14,
  "WBTC>USDC": 11,
  "USDC>USDT": 6,
  "USDC>WBTC": 12,
};
export function lpAprPct(a: string, b: string): number {
  return LP_APR[`${a}>${b}`] ?? LP_APR[`${b}>${a}`] ?? 12;
}
