
/** The shape this needs from a market row — symbols and a price. */
export interface RateMarket {
  base: { symbol: string };
  quote: { symbol: string };
  price?: number | string | null;
}

/**
 * The indexed rate for a market, in quote-per-base.
 *
 * ## Why this exists as a function rather than one `const`
 *
 * `LiquidityFlow` resolved the rate once, for the pair it rendered with, and
 * then called the MOCK's `pairRate()` directly in the token-picker and flip
 * handlers. So the first paint used the indexer and every token change and
 * every flip afterwards reset the range around a fabricated price — on a
 * market the indexer had a real rate for. Those handlers need the rate for the
 * pair they are moving TO, which a single precomputed value cannot give them.
 *
 * ## Both directions, deliberately
 *
 * The pair list holds one row per market. Flipping `ETH/USDC` asks for
 * `USDC/ETH`, which is not a missing market — it is the same market inverted.
 * Without the inverse lookup a flip would fall through to the static ratio
 * every time, which is exactly the bug on the direct path.
 *
 * ## The fallback is still the mock, and that is honest
 *
 * A pair with no indexed market has no real rate to show — the launch flow
 * creates markets that do not exist yet. `pairRate` is a static ratio of
 * placeholder USD prices; it is a starting point for a range the user then
 * edits, not a quote. When every market resolves, this fallback stops being
 * reached rather than needing removal.
 */
export function resolveRate(
  markets: readonly RateMarket[],
  base: string,
  quote: string,
): number {
  const direct = markets.find((m) => m.base.symbol === base && m.quote.symbol === quote);
  const directRate = Number(direct?.price);
  if (Number.isFinite(directRate) && directRate > 0) return directRate;

  const inverse = markets.find((m) => m.base.symbol === quote && m.quote.symbol === base);
  const inverseRate = Number(inverse?.price);
  if (Number.isFinite(inverseRate) && inverseRate > 0) return 1 / inverseRate;

  /**
   * 0 means "no rate", and callers must treat it as absent rather than as a price.
   *
   * This used to return `pairRate(base, quote)` — the hardcoded table in
   * lib/liquidity/mock.ts, where ETH is 1635 USD. That is not a stale default, it
   * is a fabricated market rate rendered in the same type and the same place as a
   * real one, with nothing distinguishing them. It reached the launch flow's
   * starting price and the chart anchor, so /pool/new displayed
   * "1 ETH = 1,635 USDC" while /explore, reading the gateway, displayed $2,000 —
   * two prices for one asset in one session.
   *
   * A launch has genuinely no rate to read, which is the whole point of asking
   * the creator to set one. Returning zero says that; inventing 1635 does not.
   */
  return 0;
}
