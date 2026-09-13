import { isoTime } from "./live";
import type { SwapRow } from "./types";

/**
 * Router swap history — the card's own unit.
 *
 * One row per `SwapRouter.SwapExecuted`, which is the WHOLE route: all hops, all
 * fills, one decision. That is why a swap row is shaped differently from a trade
 * row and never expands into fills — it has them (a 1.5 ETH swap routinely
 * consumes a dozen resting orders), and showing them undoes the reason the card
 * exists. The fills are Pro's unit, reachable from Pro.
 *
 * Source: `GET /api/liquidity/swaps/:address/:pageSize/:page`, which existed and
 * was called by nothing until this landed.
 */

export interface LiveSwapRow {
  tokenIn?: string | null;
  tokenOut?: string | null;
  tokenInSymbol?: string | null;
  tokenOutSymbol?: string | null;
  amountIn?: number | null;
  amountOut?: number | null;
  timestamp?: number | null;
  txHash?: string | null;
}

/**
 * A token with no indexer row falls back to a short address, never a blank.
 *
 * The gateway LEFT JOINs the token tables, so a token it has not seen resolves
 * to null. A swap that happened must not render as a swap of nothing — the
 * address is worse to read and infinitely better than silence.
 */
function symbol(sym: string | null | undefined, address: string | null | undefined): string {
  if (sym) return sym;
  if (!address) return "--";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function amount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return String(value);
}

/**
 * The swap's realised rate, as `1 PAY = X RECEIVE`.
 *
 * A RATE, never a USD price — the same rule the liquidity and launch surfaces
 * follow, and for the same reason: a `$` prefix is simply wrong for a pair that
 * does not settle in dollars, and most of these do not.
 *
 * Returns "--" rather than 0 or Infinity when there is nothing to divide by. A
 * swap of zero is not a rate of zero.
 */
export function swapRate(amountIn: number | null | undefined, amountOut: number | null | undefined): string {
  if (
    amountIn === null || amountIn === undefined || !Number.isFinite(amountIn) || amountIn === 0 ||
    amountOut === null || amountOut === undefined || !Number.isFinite(amountOut)
  ) {
    return "--";
  }
  return String(amountOut / amountIn);
}

export function toSwapRows(rows: LiveSwapRow[], network: string): SwapRow[] {
  return rows.map((s) => ({
    kind: "swap" as const,
    network,
    payAmount: amount(s.amountIn),
    paySymbol: symbol(s.tokenInSymbol, s.tokenIn),
    receiveAmount: amount(s.amountOut),
    receiveSymbol: symbol(s.tokenOutSymbol, s.tokenOut),
    rate: swapRate(s.amountIn, s.amountOut),
    time: isoTime(s.timestamp ?? 0),
    txHash: s.txHash ?? "",
  }));
}
