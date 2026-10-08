/**
 * How loudly to warn an LP about pool pricing being pushed.
 *
 * Rate's band pools price every fill from the order book's recent price (a
 * 5-minute average). Orders that merely rest on the book move that price a few
 * percent each, and the per-order clamp limits each order, not the total. So a
 * pool whose other side is empty can be priced away: a coin-only pool can have
 * its price pushed down and its coins bought cheap, a USDC-holding pool can have
 * its price pushed up and its USDC taken. Accepted and disclosed on 2026-10-02
 * (see /fees#risks); this module only decides which warning to show.
 *
 * `thin` means ONE SIDE IS EMPTY while the other is not. It is deliberately not a
 * value ratio: `bandReserves` is read in the POOL's token order, which may be the
 * inverse of the form's base/quote, and comparing values would need both
 * decimals and a price. "One side has nothing" is true in either orientation and
 * needs neither.
 */

export type PoolRiskLevel = "standard" | "thin";

export interface ReserveLike {
  baseReserve?: bigint;
  quoteReserve?: bigint;
}

const ZERO = BigInt(0);

/**
 * `thin` when the pool holds tokens on exactly one side. An empty pool, an
 * unread one (`null`), or one with both sides funded is `standard`.
 */
export function poolRiskLevel(bands: readonly ReserveLike[] | null | undefined): PoolRiskLevel {
  if (!bands || bands.length === 0) return "standard";
  let a = ZERO;
  let b = ZERO;
  for (const band of bands) {
    a += band.baseReserve ?? ZERO;
    b += band.quoteReserve ?? ZERO;
  }
  const oneSided = (a === ZERO) !== (b === ZERO);
  return oneSided ? "thin" : "standard";
}

/**
 * A pool launch whose deposit brings no quote token: the lister is opening a
 * coin-only pool, with nobody's USDC behind the price.
 *
 * `side` is ConfirmFlow's: -1 base only · 0 both · 1 quote only.
 */
export function launchIsCoinOnly(side: -1 | 0 | 1, amtQuote: string): boolean {
  if (side === -1) return true;
  if (side === 1) return false;
  const q = Number(String(amtQuote).replace(/,/g, ""));
  return !(q > 0);
}
