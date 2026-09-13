/**
 * Which price levels changed, so the book can flash them.
 *
 * Pure and separate from the component because "what moved" is a question about
 * two snapshots, and the component's job is to paint the answer.
 *
 * ## Derived from the DATA, never from an event
 *
 * The book used to flash whichever price an `spot-orderblock-update` event
 * named. Two things are wrong with that and both are visible on a busy market:
 *
 * An event names a level that was touched, which is not the same as a level
 * whose size changed — a fill that consumes and replaces the same quantity
 * flashes a row that looks identical before and after. And `lib/realtime/
 * frameBuffer` deliberately batches socket frames into one flush, so several
 * levels routinely move between two renders while the component sees one
 * event. Comparing snapshots catches every one of them and invents none.
 *
 * ## Size, not accumulated size
 *
 * `accumulatedQuoteLiquidity` changes for every level BELOW one that moved, so
 * flashing on it lights up half the book when a single level fills. The
 * level's own liquidity is what actually moved.
 */

/** The subset of a book row this needs. Structural, so both bid and ask rows
 * satisfy it without importing the table types. */
export interface FlashableLevel {
  price: string | number;
  baseLiquidity: string | number;
}

/** A stable key for a level. Prices arrive as both strings and numbers
 * depending on the source, and `"1.50"` and `1.5` are the same level. */
export function levelKey(price: string | number): string {
  const n = Number(price);
  return Number.isFinite(n) ? String(n) : String(price);
}

/**
 * Prices whose own liquidity differs between two snapshots.
 *
 * A level present in one snapshot and absent from the other counts as changed:
 * a level appearing is new depth and a level vanishing is a fill, and both are
 * exactly what a trader is watching the book for.
 *
 * Returns an empty set when `previous` is undefined — the FIRST render must not
 * flash. Every row is "new" then, and lighting the whole book on mount trains
 * people to ignore the signal.
 */
export function changedLevels(
  previous: readonly FlashableLevel[] | undefined,
  next: readonly FlashableLevel[],
): Set<string> {
  if (!previous) return new Set();

  const before = new Map<string, string>();
  for (const level of previous) before.set(levelKey(level.price), String(level.baseLiquidity));

  const changed = new Set<string>();
  const seen = new Set<string>();

  for (const level of next) {
    const key = levelKey(level.price);
    seen.add(key);
    const was = before.get(key);
    // Compared as strings: these are decimal quantities carried on the wire,
    // and `Number()` on two different strings can collapse them to one float —
    // which would silently stop flashing the smallest real changes.
    if (was === undefined || was !== String(level.baseLiquidity)) changed.add(key);
  }

  // Levels that disappeared. They have no row to flash now, but including them
  // keeps this function's answer complete and lets a caller that renders a
  // fading row use it.
  for (const key of before.keys()) if (!seen.has(key)) changed.add(key);

  return changed;
}
