/**
 * How a chain's quote assets are presented — the rule, shared.
 *
 * `identity-service` stores and serves the curation; `apps/web` applies it to
 * the picker it renders. Both need the same comparator, and two copies of a
 * sort are exactly how two surfaces come to disagree about what an operator
 * set — the same argument `session.ts` and `xOAuth.ts` make for living here.
 *
 * This is NOT the allowlist. `AssetGenerator._quoteOptions` decides what a coin
 * may be quoted in and the contract enforces it; nothing here can enable a
 * quote the contract rejects.
 */

/**
 * What a quote picker offers when nobody has curated the chain.
 *
 * Stables first, then the chain's native coin (and its wrapped form, which is
 * what actually appears as a pair's quote). Below that, real market depth.
 *
 * A DEFAULT, not a rule: any operator rank overrides it, and a symbol absent
 * from this list is not demoted — it simply has no opinion attached and falls
 * through to depth. Matched on SYMBOL rather than address because it has to
 * hold across chains, where the same asset has a different address; an
 * operator who needs to distinguish two tokens sharing a symbol ranks them by
 * address, which is exactly what the curation is for.
 */
export const DEFAULT_QUOTE_PREFERENCE = ["USDC", "USDT", "ETH", "WETH"] as const;

export interface QuoteDisplayRow {
  /** Lowercased token address. Never a symbol — see the schema's note on why. */
  quoteAddress: string;
  /** Lower sorts first. `null` means unranked. */
  rank: number | null;
  hidden: boolean;
}

/**
 * Apply the curation to a list of quotes.
 *
 * Ranked entries first, ascending; everything unranked keeps the CALLER'S order,
 * which is depth-descending. That is the property worth protecting: an operator
 * ranking one quote must not silently reorder the rest, and a chain nobody has
 * curated must behave exactly as it did before this existed.
 *
 * Ties fall back to the caller's order too, so two quotes given the same rank
 * are separated by real market depth rather than by map iteration.
 */
export function applyQuoteDisplay<T extends { quoteAddress: string; symbol?: string }>(
  quotes: readonly T[],
  config: readonly QuoteDisplayRow[],
): T[] {
  const byAddress = new Map(config.map((c) => [c.quoteAddress.toLowerCase(), c]));
  /** Position in the default preference, or Infinity for "no opinion". */
  const preferred = (q: T) => {
    const i = DEFAULT_QUOTE_PREFERENCE.indexOf(
      (q.symbol ?? "").toUpperCase() as (typeof DEFAULT_QUOTE_PREFERENCE)[number],
    );
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };

  return quotes
    .filter((q) => !byAddress.get(q.quoteAddress.toLowerCase())?.hidden)
    .map((q, index) => ({
      q,
      index,
      rank: byAddress.get(q.quoteAddress.toLowerCase())?.rank ?? null,
      preference: preferred(q),
    }))
    .sort((a, b) => {
      // An operator's rank beats everything, in both directions.
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank || a.index - b.index;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      // Then the built-in preference, then the caller's order (depth).
      if (a.preference !== b.preference) return a.preference - b.preference;
      return a.index - b.index;
    })
    .map((entry) => entry.q);
}
