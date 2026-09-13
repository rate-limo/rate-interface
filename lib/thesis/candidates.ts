/**
 * Which of a wallet's trades qualify as a THESIS ANCHOR on a given token.
 *
 * `/api/tradehistory/:address/:pageSize/:page` (apps/gateway/src/api/orders.ts)
 * returns GROUPED rows — a Pro sweep across several resting orders reads as one
 * trade (see apps/gateway/src/api/tradeGrouping.ts). Within a group, `pair` is
 * exact (it's the grouping key itself), but `tradeId` is only a REPRESENTATIVE
 * pick (`min(tradeId)`) and the displayed `valueUSD` is the group's SUM across
 * every underlying fill. When a group covers more than one fill (`fills > 1`),
 * that picked `tradeId` names a single `spotTrades` row whose own `valueUSD` has
 * no relation to the summed figure shown here — anchoring a thesis to it would
 * send the server a trade that doesn't match what the trader just looked at.
 *
 * So multi-fill groups are excluded from the candidate list entirely, rather
 * than offered and left to fail with a confusing "below the minimum" from a
 * trade that, on screen, cleared it. This is a DATA-INTEGRITY filter, not the
 * $100 eligibility gate — that check is the server's alone (see
 * `checkThesisEligibility` in apps/admin-service/src/theses.ts) and is repeated
 * here, via `THESIS_DISPLAY_MIN_USD`, only to decide what this control shows as
 * "qualifying" before a click. A stale or wrong copy of the threshold here can
 * only under- or over-OFFER a trade; the server still has the only vote that
 * counts.
 */

export interface ThesisTradeCandidate {
  pair: string;
  /** `spotTrades.tradeId`, as the decimal string the wire already carries. */
  tradeId: string;
  valueUsd: number;
  price: number;
  /** Unix seconds (or ms — see lib/portfolio/live.ts's isoTime for the same ambiguity). */
  timestamp: number;
  baseSymbol: string;
  quoteSymbol: string;
  isBid: boolean;
  txHash: string;
}

/**
 * The subset of a raw `/api/tradehistory` row this module reads. A plain
 * shape, not `SpotTrade` (packages/types) — that zod type predates `tradeId`
 * and `fills` and doesn't declare either, even though the gateway sends both
 * (see tradeGrouping.ts's `groupedTradeSelection`) — and `base` arrives as the
 * joined token object, not the bare address string the type also claims.
 */
export interface RawThesisTradeRow {
  base?: { id?: string | null } | string | null;
  pair?: string | null;
  tradeId?: string | null;
  valueUSD?: number | null;
  price?: number | null;
  timestamp?: number | null;
  baseSymbol?: string | null;
  quoteSymbol?: string | null;
  isBid?: boolean | null;
  fills?: number | null;
  txHash?: string | null;
}

function baseAddressOf(base: RawThesisTradeRow["base"]): string | null {
  if (!base) return null;
  return typeof base === "string" ? base : (base.id ?? null);
}

/** Trades in `tokenAddress`, restricted to groups a thesis can honestly anchor to. */
export function selectThesisCandidates(
  rows: RawThesisTradeRow[],
  tokenAddress: string,
): ThesisTradeCandidate[] {
  const token = tokenAddress.toLowerCase();
  return rows
    .filter((row) => {
      const base = baseAddressOf(row.base);
      if (!base || base.toLowerCase() !== token) return false;
      if (!row.pair || !row.tradeId) return false;
      if (row.fills != null && row.fills > 1) return false;
      return true;
    })
    .map((row) => ({
      pair: row.pair as string,
      tradeId: row.tradeId as string,
      valueUsd: row.valueUSD ?? 0,
      price: row.price ?? 0,
      timestamp: row.timestamp ?? 0,
      baseSymbol: row.baseSymbol ?? "",
      quoteSymbol: row.quoteSymbol ?? "",
      isBid: !!row.isBid,
      txHash: row.txHash ?? "",
    }));
}

/**
 * Display-only mirror of `THESIS_MIN_TRADE_VALUE_USD`
 * (apps/admin-service/src/theses.ts). The server re-derives this from its own
 * `spotTrades` row on every post — this constant only decides what the compose
 * control shows as a pickable trade before a click, never what it lets through.
 */
export const THESIS_DISPLAY_MIN_USD = 100;

export function qualifies(candidate: ThesisTradeCandidate): boolean {
  return candidate.valueUsd >= THESIS_DISPLAY_MIN_USD;
}
