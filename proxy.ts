import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { wagmiChains } from "./lib/customChains";
import { appConnectOrigins } from "./lib/security/connectOrigins";
import { appCsp, newNonce, walletFrameCsp } from "./lib/security/csp";
import { appOrigins, walletFrameHost, walletOrigin } from "./lib/wallet/frame/origins";

/**
 * Locale negotiation, and the wallet frame's own headers.
 *
 * Named `proxy.ts`, not `middleware.ts`: Next 16 deprecated the middleware file
 * convention and warns on every build. Same export shape, same matcher.
 *
 * With `localePrefix: "as-needed"` and a single locale this currently rewrites
 * nothing — but the matcher below is the part that has to be right from day
 * one, because what it accidentally swallows fails silently.
 *
 * ## What must NOT reach the i18n middleware
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
 * moved to waitlist.rate.limo and whether its entries want excluding depends on
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
 *   /token-brand/*   catalogue brand colour/logo lookup (identity-service)
 *   /chain-brand     operator-set chain logo/label/colour (identity-service)
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
 * ## `/wallet-frame` is NOT in the matcher's exclusion list, on purpose
 *
 * It is a page outside `[locale]` like `/x/complete`, and it would fit the same
 * exclusion — except that this proxy has work to do on it: a per-request
 * Content-Security-Policy with a nonce, and a host check. So the matcher lets it
 * through and the function below branches on the path BEFORE the i18n
 * middleware ever sees it. Adding `wallet-frame` to the exclusion list would
 * silently drop the CSP; the pages would still render, without the header that
 * is the point of them.
 *
 * ## Two hosts, one deployment
 *
 * When `NEXT_PUBLIC_WALLET_ORIGIN` is set, the wallet frame is served on THAT
 * host and refused on the app host, and every other path on the wallet host is
 * refused here (`next.config.ts` rewrites the ones this matcher excludes to a
 * 404 route). The wallet origin serves the frame pages and nothing else — a
 * page served there runs on the origin that holds the key.
 *
 * The matcher is therefore an explicit exclusion list, not the framework's
 * usual "match everything" — an allowlist would have to be updated every time a
 * page is added, which is the failure mode that ends with a page silently
 * losing its locale.
 */
const intl = createMiddleware(routing);

const FRAME_PREFIX = "/wallet-frame";

function requestHost(request: NextRequest): string {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
}

function rpcOrigins(): string[] {
  return Array.from(new Set(wagmiChains.flatMap((chain) => chain.rpcUrls.default.http.map((url) => new URL(url).origin))));
}

const isDev = process.env.NODE_ENV === "development";

/**
 * The frame pages: the strict policy, enforced. Next reads the nonce off the
 * REQUEST's CSP header when it renders, and the browser reads it off the
 * RESPONSE's. Both, or the inline scripts Next emits carry no nonce and the
 * policy blocks the page it protects.
 */
function withWalletFrameHeaders(request: NextRequest): NextResponse {
  const nonce = newNonce();
  const csp = walletFrameCsp({ nonce, dev: isDev, appOrigins: appOrigins(), rpcOrigins: rpcOrigins() });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * The app pages: the full policy report-only (the safe directives are enforced
 * from next.config.ts — see below for why not here). See lib/security/csp.ts
 * for why it is staged that way.
 *
 * The nonce has to reach the render as a REQUEST header, and the response
 * here is built by next-intl. It clones `request.headers` when it builds its
 * response (`new Headers(request.headers)` → `NextResponse.next({request})`),
 * so setting the headers on the incoming request BEFORE calling it is what
 * forwards them. Next accepts the nonce from either CSP header name.
 */
function withAppHeaders(request: NextRequest): NextResponse {
  const nonce = newNonce();
  const csp = appCsp({ nonce, dev: isDev, walletOrigin: walletOrigin(), connectOrigins: appConnectOrigins() });

  request.headers.set("x-nonce", nonce);
  // The REQUEST-only copy Next reads the nonce from. It is the full policy
  // under the enforced header's NAME, because Next looks at
  // `content-security-policy` first and at the report-only name only when
  // that is absent — and on Vercel the render sees a nonce-less enforced
  // header there (the config-set one), which locally it does not. A request
  // header set by the proxy never reaches the browser; the RESPONSE carries
  // the enforced directives from next.config.ts and the report-only policy
  // set below. Verified by counting nonced scripts: 1/45 before, 45/45 after.
  request.headers.set("Content-Security-Policy", csp.reportOnly);
  request.headers.set("Content-Security-Policy-Report-Only", csp.reportOnly);

  const response = intl(request);
  // The ENFORCED header is deliberately NOT set here. Next copies every
  // response header a proxy sets back onto the request before rendering, and
  // then reads the nonce from `content-security-policy` FIRST, falling back
  // to the report-only header only when that one is absent. An enforced
  // header without a nonce therefore shadowed the one with it, and every
  // Next chunk shipped untagged — found by counting nonces in the HTML. The
  // enforced directives ride `headers()` in next.config.ts instead, which is
  // applied to the response and never reaches the render.
  response.headers.set("Content-Security-Policy-Report-Only", csp.reportOnly);
  response.headers.set("Reporting-Endpoints", csp.reportingEndpoints);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const walletHost = walletFrameHost();
  const host = requestHost(request);

  if (pathname === FRAME_PREFIX || pathname.startsWith(`${FRAME_PREFIX}/`)) {
    // Configured but asked for on the wrong host: not served. The app host must
    // not serve the frame (its storage would then be the app's), and there is no
    // reason for a third host to.
    if (walletHost && host !== walletHost) return new NextResponse(null, { status: 404 });
    return withWalletFrameHeaders(request);
  }

  // Anything else on the wallet host is refused — see the header.
  if (walletHost && host === walletHost) return new NextResponse(null, { status: 404 });

  return withAppHeaders(request);
}

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
     *
     * NOT excluded: wallet-frame — the function above handles it before i18n.
     * Note `wallet/` with its slash: these tokens are PREFIXES, and a bare
     * `wallet` also swallowed `/wallet-frame`, which shipped the frame pages
     * without their CSP on the first attempt. Verified by curl, not by reading.
     */
    "/((?!api|logo|token-logo|graduate|usd-balance|points|referral|profile/nonce|profile/edit|profile/delete|profile/x-unlink|profile/avatar|profile/banner|profile/save|x/nonce|x/start|x/callback|x/complete|thesis|launch-config|wallet/|token-brand|chain-brand|chains|follow|transfers|transfer-routes|_next|_vercel|images|fonts|tradingview|.*\\..*).*)",
  ],
};
