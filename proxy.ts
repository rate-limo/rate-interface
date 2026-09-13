import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation.
 *
 * Named `proxy.ts`, not `middleware.ts`: Next 16 deprecated the middleware file
 * convention and warns on every build. Same export shape, same matcher.
 *
 * With `localePrefix: "as-needed"` and a single locale this currently rewrites
 * nothing — but the matcher below is the part that has to be right from day
 * one, because what it accidentally swallows fails silently.
 *
 * ## What must NOT reach this middleware
 *
 * `next.config.ts` rewrites three paths to admin-service, and they are not
 * pages — they are a different origin's API and image delivery:
 *
 *   /logo/:path*     token logo bytes, rendered in <img src>
 *   /token-logo      the launch flow's multipart upload
 *   /graduate/:pairId the Creator tab's graduate POST
 *   /referral/*      code lookup + linking (admin-service)
 *   /profile/*       profile nonce + delete, for /delete-account (admin-service)
 *   /thesis/*        thesis post + retract, signed (admin-service)
 *   /launch-config   the launch flow's quote options + terms (admin-service)
 *
 * `/launch-config` had a rewrite and NO exclusion until 2026-08-15, which is this
 * file's own documented failure: the rewrite is right, the service route is right,
 * and the request 404s because i18n claimed the path first. Worth re-running the
 * comparison when adding any passthrough — every `source:` in next.config.ts's
 * rewrites needs a token here. `/waitlist` is still unlisted and was left alone: it
 * moved to waitlist.iter.cx and whether its entries want excluding depends on
 * redirect-vs-rewrite semantics nobody has confirmed.
 *
 *                    NOTE this prefix is riskier than its neighbours. `/referral`
 *                    and `/wallet` will never be pages; `/profile` plausibly will
 *                    be. The day someone adds `app/[locale]/profile/`, it inherits
 *                    this exclusion and silently loses its locale — the page will
 *                    render, in English, with no error. Rename the service prefix
 *                    then, rather than removing the exclusion, which would break
 *                    /delete-account instead.
 *   /wallet/*        first-connect lookup (admin-service)
 *   /token-brand/*   catalogue brand colour/logo lookup (admin-service)
 *   /chain-brand     operator-set chain logo/label/colour (admin-service)
 *   /chains/*        chain visibility and quote curation (identity-service).
 *                    NOT a page — /explore owns chain browsing.
 *   /follow/:address follow + unfollow (identity-service, sole writer)
 *   /wallet/*        first-connect lookup (admin-service), and the wallet
 *                    session + watchlist (identity-service). NOT a page, which
 *                    is why the watchlist lives here rather than at /watchlist.
 *
 * If i18n middleware handles those it can redirect or prefix them, and the
 * result is logos 404ing and uploads failing while the database looks perfectly
 * correct — the same class of failure as dropping the rewrite entirely.
 *
 * `/api` is this app's own route handlers (og, gateway, rows, support) and is equally
 * not a page. Static assets under /_next, /images, /fonts and /tradingview must
 * pass through untouched or the charting library stops loading.
 *
 * ## `/x/complete` is excluded for a different reason
 *
 * Every entry above is excluded because it is NOT a page — someone else's API
 * behind a rewrite. `/x/complete` is a page, and it lives in this app: it is the
 * window the X link handshake lands in, at `app/x/complete/`, deliberately
 * OUTSIDE `[locale]`. The return URL is built by apps/identity-service, which
 * knows nothing about this app's locale segment and cannot be asked to guess one.
 *
 * It passes through today either way — one locale plus `localePrefix:
 * "as-needed"` means nothing gets rewritten. The exclusion is for the day a
 * second locale is added, when i18n would start prefixing it toward
 * `/en/x/complete`, which does not exist. That is this file's documented
 * `/launch-config` failure again, and the popup would 404 while the account link
 * itself succeeded — the confusing half of the bug this route was added to fix.
 *
 * The matcher is therefore an explicit exclusion list, not the framework's
 * usual "match everything" — an allowlist would have to be updated every time a
 * page is added, which is the failure mode that ends with a page silently
 * losing its locale.
 */
export default createMiddleware(routing);

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - api            this app's route handlers
     *  - logo, token-logo, graduate, usd-balance, points, token-brand   rewritten to admin-service
     *  - transfers, transfer-routes                          rewritten to identity-service
     *  - _next, _vercel  framework internals
     *  - images, fonts, tradingview   public assets
     *  - any path with a dot (favicon.ico, robots.txt, icon.svg, *.woff2)
     */
    "/((?!api|logo|token-logo|graduate|usd-balance|points|referral|profile/nonce|profile/edit|profile/delete|profile/x-unlink|profile/avatar|profile/banner|profile/save|x/nonce|x/start|x/callback|x/complete|thesis|launch-config|wallet|token-brand|chain-brand|chains|follow|transfers|transfer-routes|_next|_vercel|images|fonts|tradingview|.*\\..*).*)",
  ],
};
