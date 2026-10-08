/**
 * How an order filled, in one line: how many fills, and how much of it the
 * POOL took rather than another trader.
 *
 * The gateway has carried `fills` and `origins` on every grouped order for a
 * while and no surface rendered either. That mattered once band pools became
 * the venue's main source of liquidity: an order can fill entirely against the
 * pool, and every screen reported it exactly as it reported a trade against
 * another wallet.
 *
 * Counts rather than a verdict, for the reason `tradeOrigin` gives server-side:
 * one order routinely takes both kinds, so a single badge would have to lie
 * about one of them.
 */
export interface FillOrigins {
  pool: number;
  maker: number;
}

/**
 * Null when there is nothing worth saying — a single fill against another
 * trader is the ordinary case and needs no annotation. Absent counts return
 * null rather than "0 pool", which would claim a measurement that was not made:
 * a row from before the gateway carried origins knows nothing about its
 * counterparty, and that is not the same as knowing it was not the pool.
 */
export function fillSummary(
  fills: number | undefined,
  origins: FillOrigins | undefined,
): string | null {
  const total = Number.isFinite(fills) ? Number(fills) : 0;
  const pool = origins && Number.isFinite(origins.pool) ? origins.pool : null;
  const maker = origins && Number.isFinite(origins.maker) ? origins.maker : null;

  // Nothing measured: no counts and no breakdown.
  if (total <= 0 && pool === null) return null;

  const parts: string[] = [];
  if (total > 1) parts.push(`${total} fills`);

  if (pool !== null && maker !== null && pool + maker > 0) {
    if (pool > 0 && maker === 0) parts.push("all from the pool");
    else if (pool > 0) parts.push(`${pool} from the pool`);
    // `maker`-only is the ordinary case and says nothing new, so it is left out
    // rather than printed as "0 from the pool".
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
