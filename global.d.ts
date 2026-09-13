import type messages from "./messages/en.json";
import type { routing } from "./i18n/routing";

/**
 * Typed messages and locales.
 *
 * `en.json` is the source of truth for the key space, so a typo in
 * `t("shell.nav.explroe")` is a compile error rather than the key echoed back
 * as visible UI text at runtime.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
