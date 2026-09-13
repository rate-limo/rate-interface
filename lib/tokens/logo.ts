/**
 * Is a `logoURI` actually a logo?
 *
 * Two values mean "this token has no artwork", and only one of them looks like it:
 *
 *   1. empty / absent — what the broker writes from 2026-09-04 on;
 *   2. `raw.githubusercontent.com/standardweb3/default-token-list/.../placeholder_token.png`
 *      — what it wrote before that, for every token absent from the static list.
 *
 * The second is the reason this module exists. It is a LIVE URL serving a real
 * grey disc, so nothing downstream could tell it apart from artwork: `<img>`
 * loaded it, `onError` never fired, and every launched coin rendered the
 * predecessor project's placeholder on Explore, in the portfolio and on the
 * token page. A missing logo has to look missing for the fallback marks to ever
 * get a chance to draw.
 *
 * Treating it as absent HERE rather than only at the source is deliberate:
 * `spotTokens.logoURI` is written once, from the `PairAdded` event, so every row
 * already in a chain database keeps the old URL until it is backfilled
 * (`apps/broker/scripts/clear-legacy-placeholder-logos.ts`). Recognising the
 * string is what makes the image disappear on the next page load instead of on
 * the next deploy of the indexer.
 *
 * Matched on the FILENAME, not the full URL: the same asset is reachable through
 * `raw.githubusercontent.com`, `github.com/.../raw/` and any CDN in front of
 * them, and pinning the whole URL would miss the same image served three ways.
 */
export const LEGACY_PLACEHOLDER_MARKER = "placeholder_token";

/** The predecessor token list's grey disc, in any of the forms it is served as. */
export function isLegacyPlaceholderLogo(logoURI: unknown): boolean {
  return typeof logoURI === "string" && logoURI.includes(LEGACY_PLACEHOLDER_MARKER);
}

/**
 * The URL to actually render, or `undefined` when the token has no artwork.
 *
 * Callers pass this straight to an `<img src>` or to `TokenImageIcon`, so
 * `undefined` — never `""` — is the empty answer: an empty `src` resolves
 * against the current document and fetches the PAGE, which then fails to decode.
 */
export function tokenLogoURI(logoURI: unknown): string | undefined {
  if (typeof logoURI !== "string") return undefined;
  const trimmed = logoURI.trim();
  if (!trimmed || isLegacyPlaceholderLogo(trimmed)) return undefined;
  return trimmed;
}

/**
 * The inverse, for the UI that says so out loud — the Creator tab's "logo
 * pending" hint and Explore's `placeholder` chip. Both are claims to the token's
 * own creator that their artwork has not landed, so they must agree exactly with
 * what the icon decided to draw.
 */
export function hasNoTokenLogo(logoURI: unknown): boolean {
  return tokenLogoURI(logoURI) === undefined;
}
