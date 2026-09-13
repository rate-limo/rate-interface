/**
 * Is the pair the provide flow currently has selected a market that has not
 * listed yet?
 *
 * `/pool/new` is where the graduation threshold is actionable: providing QUOTE
 * liquidity to an unlisted market is the thing that lists it. So the flow says
 * so at the moment someone is about to deposit, rather than leaving them to
 * find out from the Pool overview.
 *
 * ## Matching on symbols, and why that is safe here
 *
 * LiquidityFlow is still mock-driven — its token picker offers `liqToken`
 * symbols, not addresses off the indexer — so this matches the selected
 * base/quote symbols against the REAL unlisted list the server passed in.
 *
 * The failure mode is one-directional and correct: a mock-only symbol matches
 * nothing and shows no banner (there is no such market to warn about), while a
 * real unlisted market matches and warns. It can never invent a warning for a
 * listed pair, because the list it searches contains only unlisted ones.
 *
 * Symbols are compared case-insensitively: the picker's are hand-written and
 * the broker's come off the token contract, and a case difference between them
 * would silently suppress the warning — the one direction that matters.
 */

export interface UnlistedMarket {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  quoteTvlUsd: number;
}

export interface UnlistedMatch {
  market: UnlistedMarket;
  thresholdUsd: number;
  shortfallUsd: number;
  progressPct: number;
}

function eq(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function findUnlisted(
  base: string,
  quote: string,
  markets: UnlistedMarket[],
  thresholdUsd: number,
): UnlistedMatch | null {
  const market = markets.find(
    (m) => eq(m.baseSymbol, base) && eq(m.quoteSymbol, quote),
  );
  if (!market) return null;

  const pct =
    thresholdUsd > 0
      ? Math.max(0, Math.min(100, (market.quoteTvlUsd / thresholdUsd) * 100))
      : 100;
  return {
    market,
    thresholdUsd,
    shortfallUsd: Math.max(0, thresholdUsd - market.quoteTvlUsd),
    progressPct: pct,
  };
}
