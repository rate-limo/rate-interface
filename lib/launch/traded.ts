/** How long a trade keeps a coin at the top before the ranking takes it back. */
export const TRADED_WINDOW_MS = 5 * 60_000;
/** Most coins the hoist may lift at once. */
export const TRADED_CAP = 6;

/**
 * Coins that just traded, lifted to the front of whatever ranking is showing.
 *
 * ## Why this is a different signal from an arrival
 *
 * `arrivalsOf` keys on "an id this list has not rendered before", because there
 * is no venue-wide LAUNCH topic — the launch frame goes to the creator's own
 * account topic and nobody else's session hears it. A TRADE is not like that:
 * `spotTrade:allPairs` is a real public feed (apps/gateway/src/protocol.ts), so
 * "this coin traded a moment ago" is observable rather than inferred, and it is
 * observable for coins the list has been showing all along.
 *
 * So the two cannot share a mechanism. An arrival is a set difference over
 * renders; this is a recency order over events.
 *
 * ## Recency, then the ranking — never a blend
 *
 * The lifted coins keep trade order among themselves (newest first) and
 * everything else keeps the order the gateway returned. A score mixing "traded
 * recently" with market cap would produce a list whose order nobody can
 * predict or explain, which on a directory people scan is worse than either
 * rule alone.
 *
 * ## Bounded twice, on purpose
 *
 * By TIME, so a coin that traded once does not hold the top of the page for the
 * rest of the session; and by COUNT, because a busy minute would otherwise
 * reorder the entire visible grid and leave the ranking doing nothing at all.
 * Past the cap the older trades simply stay where the ranking put them.
 */
export function hoistRecentlyTraded<T extends { id: string }>(
  tokens: readonly T[],
  tradedAt: ReadonlyMap<string, number>,
  now: number,
  {
    windowMs = TRADED_WINDOW_MS,
    cap = TRADED_CAP,
    /**
     * Whether a trade MOVES the card or only marks it.
     *
     * The sort decides. Under "Last trade" the hoist IS the sort — a fill is
     * exactly the thing being ordered by, so moving the card is the ranking
     * staying true between fetches. Under any other sort it is not: the reader
     * asked for market cap, or for newest, and silently promoting whatever
     * happened to trade answers a question they did not ask. The chip still
     * appears, because a trade is worth knowing about either way; it just does
     * not overrule the order.
     */
    reorder = true,
  } = {},
): { ordered: T[]; lifted: ReadonlySet<string> } {
  if (tradedAt.size === 0) return { ordered: [...tokens], lifted: new Set() };

  const fresh = tokens
    .map((token) => ({ token, at: tradedAt.get(token.id.toLowerCase()) ?? 0 }))
    .filter((row) => row.at > 0 && now - row.at < windowMs)
    .sort((a, b) => b.at - a.at)
    .slice(0, cap);

  if (fresh.length === 0) return { ordered: [...tokens], lifted: new Set() };

  const lifted = new Set(fresh.map((row) => row.token.id));
  // Marks without moving anything. Deliberately still capped and still expired
  // by the same window: a chip that never cleared would eventually be on every
  // card, which says nothing.
  if (!reorder) return { ordered: [...tokens], lifted };
  const rest = tokens.filter((token) => !lifted.has(token.id));
  return { ordered: [...fresh.map((row) => row.token), ...rest], lifted };
}

/**
 * Record a trade, keeping the map small enough to live in a tab for hours.
 *
 * Returns a NEW map only when something changed, so a component reading it can
 * use identity to decide whether to re-render — a busy market delivers frames
 * far faster than a grid should reorder.
 */
export function noteTrade(
  tradedAt: ReadonlyMap<string, number>,
  ids: readonly string[],
  now: number,
  { windowMs = TRADED_WINDOW_MS } = {},
): ReadonlyMap<string, number> {
  const relevant = ids.map((id) => id.toLowerCase()).filter(Boolean);
  if (relevant.length === 0) return tradedAt;

  const next = new Map(tradedAt);
  for (const id of relevant) next.set(id, now);
  // Expire here rather than on a timer: the map is only read when it changes,
  // so a stale entry costs nothing until the next trade, and a tab left open on
  // a quiet market runs no interval at all.
  for (const [id, at] of next) if (now - at >= windowMs) next.delete(id);
  return next;
}
