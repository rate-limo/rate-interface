/**
 * Where an auction draft lives, and how the old key is retired.
 *
 * `/cookies` states plainly that nothing about a presale is recorded anywhere
 * else yet — this browser is the only place it exists, and clearing it loses
 * the launch unrecoverably. That is what makes renaming the key a data
 * question rather than a cosmetic one: writing to `iter:auction:*` and reading
 * only from there would strand every draft someone already started.
 *
 * So reads try the current key, fall back to the legacy one, and rewrite
 * forward on the way out. `LEGACY_PREFIX` is deletable once no old drafts can
 * remain; it is not a general compatibility layer, and nothing else should be
 * added to it.
 *
 * Both halves live here rather than in the two components that use them,
 * because a reader and a writer that disagree about a key is the failure this
 * module exists to prevent — the same reason the referral apply/capture split
 * is one module and not two implementations.
 */

const PREFIX = "iter:auction";
/** Written by the flow until 2026-08-15, when white launch was renamed auction. */
const LEGACY_PREFIX = "iter:white-launch";

export function auctionDraftKey(networkSlug: string, id: string): string {
  return `${PREFIX}:${networkSlug}:${id}`;
}

export function legacyAuctionDraftKey(networkSlug: string, id: string): string {
  return `${LEGACY_PREFIX}:${networkSlug}:${id}`;
}

/** Persist a draft. Returns false when storage refused it, so a caller can say
 *  so rather than silently promising persistence it does not have. */
export function writeAuctionDraft(networkSlug: string, id: string, draft: unknown): boolean {
  try {
    window.localStorage.setItem(auctionDraftKey(networkSlug, id), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * The draft for `id`, from either key.
 *
 * A hit on the legacy key is rewritten under the current one and the old entry
 * removed, so each draft migrates exactly once, on the first read after this
 * shipped. A failed rewrite is not an error — the value was still found, and
 * reporting it would turn a successful read into a broken page.
 */
export function readAuctionDraft(networkSlug: string, id: string): unknown | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(auctionDraftKey(networkSlug, id));
  } catch {
    return null;
  }
  if (raw !== null) return parse(raw);

  let legacy: string | null = null;
  try {
    legacy = window.localStorage.getItem(legacyAuctionDraftKey(networkSlug, id));
  } catch {
    return null;
  }
  if (legacy === null) return null;

  try {
    window.localStorage.setItem(auctionDraftKey(networkSlug, id), legacy);
    window.localStorage.removeItem(legacyAuctionDraftKey(networkSlug, id));
  } catch {
    /* the value is still returned below; migrating it can wait for the next read */
  }
  return parse(legacy);
}

/** A hand-edited or truncated entry reads as "no draft", never as a crash --
 *  the same rule `lib/support/store` applies to its own localStorage values. */
function parse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
