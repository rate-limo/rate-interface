import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Per-request i18n config. Resolves the locale from the route segment and loads
 * that locale's messages.
 *
 * `hasLocale` guards the segment: an unknown or absent one falls back to the
 * default rather than trying to import `messages/<garbage>.json` and throwing.
 * A bad locale in a URL should render English, not a 500.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
