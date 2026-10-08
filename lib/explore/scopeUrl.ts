/**
 * Explore's chain scope, as a URL.
 *
 * ## Why this exists
 *
 * The scope was client state only, so there was no address that means "Explore,
 * narrowed to this chain". That is why the token breadcrumb's network crumb was
 * demoted to a plain label: it used to link `/explore/tokens?chain=<slug>`,
 * which navigated to the same page it was already on, because `SCHEME.explore`
 * is `"none"` and Explore has never read `?chain=`. The comment on that crumb
 * called it "the exact control that appears to work and changes nothing".
 *
 * ## `chains`, plural, holding network NAMES
 *
 * Not `?chain=<slug>`. `chains` is the vocabulary the aggregator already takes
 * (`useAggregatorChains` → `?chains=`), and `chainFilter` holds a network name
 * rather than a slug, so this is the same value written down rather than a
 * second encoding to keep in step. Reusing the singular name would also mean a
 * dead param and a live one differing by one letter.
 *
 * One chain, because the scope control holds one. The plural is the
 * aggregator's shape, and a list is what it would take if the control ever
 * offered several.
 */

const PARAM = "chains";

/**
 * The scope a URL asks for, or null.
 *
 * Validated against the chains this venue serves: `resolveAggregatorChains`
 * treats any non-empty explicit list as authoritative, so an unrecognised name
 * would narrow the fan-out to a chain nobody serves and render an empty Explore
 * with nothing on screen to explain it. Unknown reads as "no scope asked for".
 */
export function scopeFromUrl(href: string, known: readonly string[]): string | null {
  let raw: string | null;
  try {
    raw = new URL(href).searchParams.get(PARAM);
  } catch {
    return null;
  }
  const first = raw?.split(",")[0]?.trim();
  if (!first) return null;
  return known.find((name) => name.toLowerCase() === first.toLowerCase()) ?? null;
}

/**
 * The URL this scope should be at, or null to leave it alone.
 *
 * Null for "no change" rather than an equal string, so the caller cannot write
 * a history entry that changes nothing — the same contract as `flowUrl`.
 */
export function scopeUrl(href: string, chain: string | null): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (chain) url.searchParams.set(PARAM, chain);
  else url.searchParams.delete(PARAM);
  return url.href === href ? null : url.href;
}
