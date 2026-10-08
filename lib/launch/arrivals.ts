/** How many cards animate in one batch before the rest are simply present. */
export const ARRIVAL_CAP = 4;
/** Milliseconds between each card in a batch. */
export const ARRIVAL_STAGGER_MS = 60;

/**
 * Which of `ids` are new since `seen`, and in what order they should enter.
 *
 * ## Deliberately not told HOW the coin arrived
 *
 * There is no venue-wide launch topic today — the gateway serves
 * `spotAccount:<address>`, `spotBar:`, `spotOrderbook:<pair>` and
 * `spotTrade:<pair>`, and the launch frame goes to the creator's own account
 * topic, so nobody else's session hears it. The grid therefore gains a coin
 * when its query refetches (mount, window focus).
 *
 * Keying the animation on "an id this list has not rendered before" rather than
 * on a socket message means the motion is correct for both: it works today on a
 * refetch, and the day a launch topic exists the only thing that changes is that
 * the row appears sooner. Nothing here needs rewriting for that.
 *
 * ## The first load is not an arrival
 *
 * `seen === null` means this list has never rendered, where every id is new by
 * definition and animating them all would be an entrance for the page rather
 * than for a launch. That case returns nothing and simply records what is there.
 */
export function arrivalsOf(
  seen: ReadonlySet<string> | null,
  ids: readonly string[],
  cap: number = ARRIVAL_CAP,
): Map<string, number> {
  if (seen === null) return new Map();

  /*
   * An arrival lands IN FRONT of something already on screen. A page of results
   * lands behind everything.
   *
   * Without that distinction, scrolling the infinite list would animate every
   * appended row as a fresh deployment — twenty coins announcing themselves as
   * new because the reader reached the bottom of the page. So an unseen id only
   * counts when a SEEN id still follows it: true for a coin inserted at the
   * head, false for anything `fetchNextPage` appended.
   */
  const lastSeenAt = ids.reduce(
    (last, id, index) => (seen.has(id) ? index : last),
    -1,
  );
  const fresh: string[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!;
    if (index > lastSeenAt) break;
    if (!seen.has(id) && !fresh.includes(id)) fresh.push(id);
  }
  // Past the cap a batch is marked but not animated: four landing together read
  // as a sequence, forty read as a fault.
  return new Map(fresh.slice(0, cap).map((id, index) => [id, index]));
}

/**
 * The most rows a live list will hold. Beyond this the oldest are dropped.
 *
 * A page of launches is 200, so this is "one page of headroom" rather than an
 * arbitrary ceiling: a reader who has scrolled two pages keeps what they
 * scrolled to, and a chain minting coins faster than anyone can read them
 * cannot grow the array without limit.
 */
export const MAX_LIVE_ROWS = 400;

/**
 * Fold pushed rows into a live list, bounded.
 *
 * ## Why a socket feed needs this and a query does not
 *
 * react-query hands back a whole page, so the list is as long as the pages
 * fetched — bounded by how far someone scrolled. A pushed row is different:
 * nothing else decides how many arrive, so `[...incoming, ...current]` grows
 * with the CHAIN rather than with the reader. A deployer minting in a loop, or
 * a quiet afternoon of a script testing the generator, walks the tab's memory
 * up until it dies, and every row also holds a mesh canvas.
 *
 * So the array is capped and the oldest fall off the end. They are not lost —
 * they are one refetch away, which is exactly where they were before anyone
 * pushed anything.
 *
 * ## Returning `current` unchanged is load-bearing
 *
 * A frame carrying a coin the list already holds — a duplicate delivery, a
 * reconnect replay — must not produce a new array, because a new array is a new
 * reference, which re-renders every card and restarts every mesh. Identity is
 * the signal that nothing happened.
 */
export function mergeArrivals<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
  max: number = MAX_LIVE_ROWS,
): readonly T[] {
  if (incoming.length === 0) return current;
  const held = new Set(current.map((row) => row.id));
  const fresh: T[] = [];
  for (const row of incoming) {
    if (held.has(row.id)) continue;
    held.add(row.id);
    fresh.push(row);
  }
  if (fresh.length === 0) return current;
  return [...fresh, ...current].slice(0, max);
}
