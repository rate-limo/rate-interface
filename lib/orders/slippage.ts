/**
 * The market-order slippage limit, from the percent the ticket shows to the
 * number the engine reads.
 *
 * ## The engine's denominator is 1e8, and the app used to send ten times too much
 *
 * `MatchingEngine` bounds a market order at `lmp * (DENOM ± spreadLimit) / DENOM`
 * with `DENOM = 100_000_000` (MatchingEngine.sol:44, :600, :733). So a slippage
 * limit of 1e8 is 100%, and 0.1% is `0.001 * 1e8 = 100_000`.
 *
 * The ticket holds the limit as a PERCENT (`buySlippageLimit = 0.1`, rendered
 * "0.1%") and sent it as `parseUnits("0.1", 8) = 10_000_000` — 10% of the
 * denominator. Every market order went out with a hundredfold-wider band than
 * the one on screen (the engine then clamps to the pair's spread, so the real
 * damage was "as wide as the venue allows", never "as tight as you asked").
 *
 * A percent is `pct / 100 * 1e8 = pct * 1e6` engine units. Integer math rather
 * than `parseUnits(pct.toString(), 6)`: a small number stringifies as `1e-7`,
 * which `parseUnits` refuses.
 *
 * The ladder paths (`quoteLadderBuy`, `ladderSellFloor`) already read the same
 * state as a percent and convert it to basis points themselves; they do not go
 * through here.
 */
export const ENGINE_SLIPPAGE_DENOM = 100_000_000;

/** Engine units per displayed percent: 1e8 / 100. */
const UNITS_PER_PERCENT = 1_000_000;

/** `slippageLimit` is a uint32 on chain. */
const UINT32_MAX = 4_294_967_295;

/**
 * The engine's `slippageLimit` for a slippage shown as `pct` percent.
 *
 * Clamped to [0, 1e8] (0%..100%). A negative or non-finite input is 0 — zero
 * tolerance on `marketBuy`/`marketSell` (`createOrder` reads 0 as the venue
 * default) — so a bad value errs toward filling less, never toward a silently
 * huge band. The engine further caps whatever arrives at the pair's own limit
 * (`_pairSlippageLimit`, bps × 1e4) and its spread.
 */
export function slippagePctToEngine(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const units = Math.round(pct * UNITS_PER_PERCENT);
  return Math.min(units, ENGINE_SLIPPAGE_DENOM, UINT32_MAX);
}
