/**
 * The resting order a fill consumed, or null when there was none.
 *
 * `spotTrades.orderId` and slot 0 of the trade tuples store the id of the
 * RESTING order a fill took liquidity from — the counterparty's, not the
 * viewer's, unless the viewer is the maker. A pool fill has no resting order,
 * and the broker writes 0 there (BandPool's pool-fill writer) because the column
 * is NOT NULL and the tuple slot is a plain number.
 *
 * That 0 is a storage spelling, not a value: engine order ids start at 1. It is
 * translated here, at the edge, so no consumer ever compares against it. The
 * gateway's REST serializers and the frame decoders both come through this one
 * function, which is what keeps a REST row and a live row for the same fill
 * keying identically.
 *
 * On a GROUPED trade (one taker order, many fills) the input is `min(orderId)`
 * across the fills, 0 included — the SQL and `collapseFillSummary` agree on that
 * rule, and must keep agreeing, or the same sweep keys two ways. So a null here
 * on a grouped row means "the representative fill was the pool", not "every fill
 * was"; `origins` is the field that answers how a grouped row filled.
 */
export function makerOrderIdFromWire(orderId: number | string | bigint | null | undefined): number | null {
	if (orderId === null || orderId === undefined || orderId === "") return null;
	const id = Number(orderId);
	return Number.isInteger(id) && id >= 1 ? id : null;
}
