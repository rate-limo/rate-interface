import { makerOrderIdFromWire } from "@iter/types";

/**
 * Which cached trade row an incoming fill frame is an update to.
 *
 * `useTradeHistory` merged live frames into its React Query cache by `orderId`
 * alone, and `orderId` is not an identity: it is the ORDERBOOK's per-side
 * sequence number, so a small integer that repeats across pairs, across sides
 * and over time as ids are recycled (`Trade.ts` says as much — the trades table
 * was re-keyed off `(pair, isBid, orderId)` for exactly this reason).
 *
 * It was survivable while every row in that cache was a fill this wallet had
 * TAKEN: a collision then meant one taker row overwriting another, wrong but
 * roughly shaped the same. `/api/tradehistory/:address` now also returns fills
 * taken FROM this wallet, whose `orderId` is the wallet's OWN resting order —
 * so a later taker frame carrying an unrelated maker's id `7` would replace this
 * wallet's maker row `7` wholesale, flipping that row's side, price and size to
 * a different trade's. Silent, and it renders as a perfectly ordinary fill.
 *
 * `txHash` is what makes this an identity — one transaction, one market, one
 * resting order. `pair` is not redundant with it: a routed multi-hop swap
 * settles across several books in a single transaction, and those books number
 * their orders independently.
 *
 * The id segment is `makerOrderId`, empty for a pool fill: the REST row and the
 * live row for one fill must produce the same key, or the fill shows twice until
 * the next refetch.
 */
export function tradeRowKey(row: TradeIdentityRow): string {
  return [
    (row.txHash ?? "").toLowerCase(),
    (row.pair ?? "").toLowerCase(),
    makerOrderIdOf(row) ?? "",
  ].join(":");
}

type TradeIdentityRow = {
  txHash?: string | null;
  pair?: string | null;
  makerOrderId?: number | null;
  /** Legacy spelling of `makerOrderId`, 0 for the pool. Read only when a row
   *  from a gateway older than `makerOrderId` lacks the explicit field. */
  orderId?: number | null;
};

/**
 * The resting order a trade row consumed, null for a pool fill.
 *
 * A REST row from a current gateway and every decoded frame carry
 * `makerOrderId`. A REST row from an older gateway has only `orderId`, spelled
 * 0 for the pool, and goes through the same translation the decoders use — so
 * both kinds of row key identically while the gateway rolls out after the web.
 */
export function makerOrderIdOf(row: Pick<TradeIdentityRow, "makerOrderId" | "orderId">): number | null {
  return row.makerOrderId !== undefined ? row.makerOrderId : makerOrderIdFromWire(row.orderId);
}
