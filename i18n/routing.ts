import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for apps/web.
 *
 * ## The URL contract
 *
 * `localePrefix: "as-needed"` — the default locale carries NO prefix, every
 * other locale does:
 *
 *     /trade?chain=rise      → en   (unchanged from before i18n)
 *     /ko/trade?chain=rise   → ko
 *
 * That is what lets this land without rewriting a single existing URL, link or
 * OG image, and without a redirect layer. The page-first scheme documented in
 * apps/web/CLAUDE.md survives intact for English, which is every URL today.
 *
 * ## Only `en` for now, on purpose
 *
 * The plumbing goes in first and the translations follow, so components are
 * touched once. With a single locale no prefix is ever emitted, so this is
 * inert at runtime — but the routing helpers and middleware are already
 * locale-aware, which means adding "ko" here is the whole change, not the start
 * of one.
 *
 * Adding a locale is: append it below, add `messages/<locale>.json`, ship a
 * locale switcher. No component edits.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Narrow an unknown path segment to a supported locale. */
export function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
