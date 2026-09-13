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
 */
export function tradeRowKey(row: {
  txHash?: string | null;
  pair?: string | null;
  orderId?: number | null;
}): string {
  return [
    (row.txHash ?? "").toLowerCase(),
    (row.pair ?? "").toLowerCase(),
    row.orderId ?? "",
  ].join(":");
}
