/**
 * What a shared profile link carries — the url, the card, and the X intent.
 *
 * Pure and origin-injected: every one of these takes `origin` rather than reading
 * `window`, so they are testable and so a server render cannot silently produce a
 * relative url that a recipient's client has no way to resolve.
 */

/**
 * The CANONICAL profile url, never `window.location.href`.
 *
 * The address bar carries whatever transient params the visitor arrived with —
 * `?ref=`, `?viewer=`, utm — and those ride into every reshare and into the
 * unfurled card's link. `?viewer=` is the dangerous one: it is the READER's own
 * address, so sharing the raw location leaks who was looking at the profile.
 *
 * Same rule the token page already applies to `navigator.share`.
 */
export function profileShareUrl(origin: string, address: string, chainSlug?: string | null): string {
  const base = `${origin.replace(/\/$/, "")}/profile/${address}`;
  return chainSlug ? `${base}?chain=${encodeURIComponent(chainSlug)}` : base;
}

/**
 * The 1200×630 card, from the same route `generateMetadata` points crawlers at
 * (`app/[locale]/profile/[address]/page.tsx`). The preview in the share modal is
 * therefore the actual image an unfurl will show, not a mock-up of one — if the
 * card is broken, the preview is broken too, which is the point.
 */
export function profileShareCardUrl(origin: string, address: string, chainSlug?: string | null): string {
  const q = new URLSearchParams({ address });
  if (chainSlug) q.set("chain", chainSlug);
  return `${origin.replace(/\/$/, "")}/api/og/profile?${q.toString()}`;
}

/** A display name if the wallet set one, else the abbreviated address. */
export function profileShareText(name: string | null | undefined, address: string): string {
  const trimmed = name?.trim();
  const who = trimmed && trimmed.length > 0 ? trimmed : `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `${who} on Iter`;
}

/**
 * X's intent endpoint.
 *
 * `x.com`, not `twitter.com`: the old host still redirects, but a redirect on a
 * popup opened from a click is one more thing that can be blocked, and the
 * shortener rewrites the visible link either way.
 *
 * The image is NOT attached here and cannot be — an intent url takes text and a
 * link, and X renders the card by unfurling that link's OG tags. That is why
 * `Copy image` exists beside this as a separate action: it is the only way to put
 * the picture itself into a post, or into anything that is not X.
 */
export function xIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text, url });
  return `https://x.com/intent/tweet?${q.toString()}`;
}
