import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { SUPPORTED_CHAINS, findChain } from "@iter/deployments";
import { FRAME_ANCESTORS_HEADER } from "./lib/security/csp";

// Points the plugin at i18n/request.ts, which resolves the locale and loads its
// messages. Without it `next-intl/server` has no config to read.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Does the BUILT `@iter/deployments` still match the registry on disk?
 *
 * ## The failure this catches
 *
 * `deployments.json` is the source and nothing reads it at runtime — this app
 * imports `@iter/deployments`, which tsup inlines the JSON into. So a redeploy
 * that updates the registry leaves a second, older set of addresses behind the
 * same import until somebody rebuilds.
 *
 * On 2026-09-18 that cost an afternoon. The registry carried Arc's live
 * band-pool factory; `dist` carried the retired generation's. Both are real
 * contracts with code, so `getPool` did not error — it answered zero for every
 * current market, and the swap card said "No band pool is listed for
 * USDC/TITER yet". True from where it was looking, and naming none of the
 * cause. `scripts/verify-redeploy.mjs` reads the JSON, so all of its checks
 * passed.
 *
 * ## Why here, and why it is not enough on its own
 *
 * `predev` already builds this app's dependencies, and it only runs when the
 * server STARTS. The dev server that hit this had been up for four days,
 * straight through the pull that changed the registry — nothing re-ran, and
 * Turbopack had long since resolved the stale copy. A running process cannot
 * rebuild its own modules, so the achievable goal is that the NEXT start is
 * loud rather than silently wrong.
 *
 * Dev and non-production only: a production build always compiles the package
 * fresh, and this must never be able to fail a deploy over a local artifact.
 * It throws rather than warns — a warning in a dev server's boot output is
 * scrollback, and the whole failure mode here is being quiet.
 */
function assertDeploymentsAreFresh(): void {
  if (process.env.NODE_ENV === "production" || process.env.ITER_SKIP_DEPLOYMENT_CHECK) return;
  let registry: { chains?: Record<string, { name?: string; contracts?: Record<string, { address?: string }> }> };
  try {
    registry = JSON.parse(
      readFileSync(require.resolve("@iter/deployments/deployments.json"), "utf8"),
    );
  } catch {
    // No registry to compare against is not this check's business to report.
    return;
  }
  for (const [chainId, chain] of Object.entries(registry.chains ?? {})) {
    const built = findChain(Number(chainId));
    if (!built) continue;
    for (const [name, entry] of Object.entries(chain.contracts ?? {})) {
      const onDisk = entry?.address?.toLowerCase();
      const inBuild = (built.contracts as Record<string, { address?: string }> | undefined)?.[name]
        ?.address?.toLowerCase();
      if (!onDisk || onDisk === inBuild) continue;
      throw new Error(
        `@iter/deployments is STALE: ${chain.name ?? chainId} ${name} is ${inBuild ?? "missing"} ` +
          `in the built package and ${onDisk} in deployments.json.\n\n` +
          `  pnpm --filter @iter/deployments build\n\n` +
          `Then RESTART this dev server — Turbopack caches node_modules dependencies, ` +
          `so a reload keeps serving the old addresses. Every contract call this app ` +
          `makes resolves through that package.`,
      );
    }
  }
}

assertDeploymentsAreFresh();

/**
 * Where admin-service lives. Not NEXT_PUBLIC_: the rewrite is resolved on the
 * server, so the browser only ever sees a same-origin path.
 *
 * ## Why this throws instead of defaulting
 *
 * It used to be `?? "http://localhost:4100"`, and that shipped a production
 * build in which every admin-service rewrite pointed at localhost. Vercel
 * refuses to proxy to a private address, so `/referral/*`, `/wallet/*`,
 * `/logo/*`, `/token-logo` and `/graduate/*` all answered 404
 * (DNS_HOSTNAME_RESOLVED_PRIVATE) while the service itself was perfectly
 * healthy.
 *
 * Nothing surfaced it. Both callers swallow the failure by design — the
 * waitlist button treats the referral code as a bonus, and LoginRouter refuses
 * to onboard anyone when the lookup fails — so onboarding was dead site-wide
 * and every screen still looked correct.
 *
 * Rewrites are baked at BUILD time, so the only moment this can be caught is
 * here. A missing value is a broken deploy either way; failing the build is the
 * version that says so. Note `||`, not `??`: an empty string is exactly as
 * broken as an unset one and must take the same path.
 */
const ADMIN_SERVICE_URL = (() => {
  const configured = process.env.ADMIN_SERVICE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // `next dev` and `next build` on a laptop: localhost is the right answer and
  // the service is usually running beside it.
  if (process.env.NODE_ENV !== "production") return "http://localhost:4100";

  throw new Error(
    "ADMIN_SERVICE_URL is required for a production build. Rewrites are " +
      "resolved at build time, so an unset value bakes http://localhost:4100 " +
      "into /referral/*, /wallet/*, /logo/*, /token-logo and /graduate/* — " +
      "which 404s in production and silently kills onboarding and token logos. " +
      "Set it to admin-service's public URL and rebuild.",
  );
})();

/**
 * Where the X OAuth handshake goes — ONE origin for every chain.
 *
 * `ADMIN_SERVICE_URL` is per chain, because admin-service is deployed per chain
 * environment and most of its routes read that chain's data. The X link is not
 * one of those: an EVM address is the same address on every chain, the X row
 * lands in the SHARED identity database (`IDENTITY_DATABASE_URL`), and pointing
 * each chain at its own copy of the flow buys nothing while costing three real
 * things —
 *
 *   * the X consumer key and secret fanned out to every chain environment;
 *   * a DIFFERENT callback URL per environment, since `selfOrigin()` derives it
 *     from each service's own RAILWAY_PUBLIC_DOMAIN, so every one of them has to
 *     be registered in the X developer portal or that chain gets a 401 from X
 *     naming nothing;
 *   * a user who links on one chain and is asked to link again on another,
 *     writing the same fact through a second route.
 *
 * So `/x/*` targets `IDENTITY_SERVICE_URL`, and there is NO LONGER a fallback to
 * `ADMIN_SERVICE_URL`.
 *
 * There was one, on the argument that unset should mean the previous single-origin
 * behaviour. That argument expired the day identity-service became the sole owner of
 * these routes: admin-service serves none of `/x/*`, `/follow/*`, `/profile/*`,
 * `/logo/*` or `/chain-brand` on any chain, so the fallback does not preserve old
 * behaviour — it points a rewrite at a service that answers 404.
 *
 * Measured 2026-09-05, and it cost a debugging session: `/follow/:address` proxied to
 * admin-service and returned 404 while identity-service answered the same request 400,
 * so Follow looked like a broken feature rather than a missing variable. That is the
 * exact failure mode `ADMIN_SERVICE_URL` above throws to prevent, and the reason it
 * throws — a rewrite baked at build time against a wrong origin fails silently.
 *
 * Localhost keeps its convenience: a dev without the variable gets identity-service's
 * usual local port rather than a 404 from a remote service that cannot serve it.
 */
const IDENTITY_SERVICE_URL = (() => {
  const configured = process.env.IDENTITY_SERVICE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // 8090 is identity-service's own default (apps/identity-service/src/main.ts).
  if (process.env.NODE_ENV !== "production") return "http://localhost:8090";

  throw new Error(
    "IDENTITY_SERVICE_URL is required for a production build. It owns /x/*, " +
      "/follow/*, /profile/*, /logo/* and /chain-brand — admin-service serves none " +
      "of them on any chain, so falling back to it 404s every one. Rewrites are " +
      "resolved at build time, so this cannot be corrected by a restart. Set it to " +
      "identity-service's public URL (https://auth.rate.limo) and rebuild.",
  );
})();

/**
 * Every chain this build SERVES must have an admin-service it can reach.
 *
 * `/graduate`, `/thesis/*` and `/launch-config` are route handlers resolving
 * `ADMIN_SERVICE_URL_<chainId>` per request (see lib/upstreams.ts). Those read
 * at request time, so there is no value to bake wrong — but there is still a
 * deployment fact to get wrong, and its failure mode is the quiet one: nothing
 * happens at all until somebody clicks Graduate on the affected chain, and only
 * they see it.
 *
 * ## This check exists because the identical gap shipped and lived for weeks
 *
 * The admin panel resolves upstreams the same way and its suffixed variables
 * were never set in production. `configuredUpstreams()` returned nothing, the
 * fallback quietly served one chain, the switcher hid itself, and Arc was
 * unreachable from the panel entirely — with every page rendering correctly and
 * reporting the chain it was actually showing. Nothing was wrong on screen; a
 * whole chain was simply not offered.
 *
 * So the rule is checked where it can be checked loudly, and it is deliberately
 * strict: with more than one served chain, EVERY one needs its own variable.
 * The unsuffixed fallback can serve exactly one of them and nothing records
 * which, so "some are set" is not a safer state than "none are" — the panel's
 * outage was the none-are case.
 *
 * Production builds only. A laptop runs one admin-service on localhost and the
 * unsuffixed variable is the right answer there.
 */
function assertPerChainUpstreams(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (SUPPORTED_CHAINS.length <= 1) return;

  const configured = new Set(
    Object.entries(process.env)
      .filter(([name, value]) => name.startsWith("ADMIN_SERVICE_URL_") && value)
      .map(([name]) => name.slice("ADMIN_SERVICE_URL_".length))
      .filter((suffix) => /^\d+$/.test(suffix)),
  );

  const missing = SUPPORTED_CHAINS.map((name) => ({ name, chainId: findChain(name)?.chainId }))
    .filter((c) => c.chainId !== undefined && !configured.has(String(c.chainId)))
    .map((c) => `ADMIN_SERVICE_URL_${c.chainId}  (${c.name})`);

  if (missing.length === 0) return;

  throw new Error(
    `SUPPORTED_CHAINS serves ${SUPPORTED_CHAINS.length} chains and ${missing.length} of them ` +
      `have no admin-service configured:\n  ${missing.join("\n  ")}\n\n` +
      "/graduate, /thesis/* and /launch-config resolve one of these per request and would " +
      "answer 503 for those chains — visible only to whoever clicked. The unsuffixed " +
      "ADMIN_SERVICE_URL cannot stand in: it can serve one chain and nothing records which. " +
      "Set each variable on the platform; these are read at request time, so turbo.json is " +
      "not involved.",
  );
}

assertPerChainUpstreams();

const nextConfig: NextConfig = {
  /*
   * Move the dev indicator off the CHAIN SWITCHER.
   *
   * `AppSidebar` pins the switcher to the bottom-left, which is exactly where
   * Next puts its dev badge — so in `next dev` the badge sits on top of it and
   * a click on the switcher opens the Route/Bundler/Preferences menu instead of
   * the chain list. Dev-only, and invisible in production, which is why it
   * reads as "the chain switcher is broken locally".
   */
  devIndicators: { position: "bottom-right" },
  /*
   * Source maps were turned on here to name a React #310 that fired on a
   * successful passkey connect, where the only stack available was minified.
   * They are OFF again: the fault stopped reproducing after the connect path was
   * rebuilt (the injected connector is gone and `ConnectWalletDialog` no longer
   * branches on it), and the flag publishes this private repository's sources on
   * every deploy for as long as it is set.
   *
   * If #310 returns, set `productionBrowserSourceMaps: true` here, reproduce it
   * once, and take it straight back out. It is a diagnostic, not a setting.
   */
  /**
   * Token logos are stored in admin-service's Postgres and served by it at
   * /logo/<sha256>.webp. `adminTokenMeta.logoURI` deliberately holds that
   * ROOT-RELATIVE path rather than an absolute URL: the rows are then portable
   * across environments and survive a domain change, which is the whole point of
   * addressing images by content.
   *
   * The cost is that something has to map the path to the service — the browser
   * resolves `<img src="/logo/…">` against THIS origin, not admin-service's. That
   * is this rewrite. Without it every launched token's logo 404s while looking
   * perfectly correct in the database.
   *
   * Rewrites are evaluated at build time, so ADMIN_SERVICE_URL is a deploy-time
   * setting. The upstream sends `immutable, max-age=31536000`, so the CDN in
   * front of this app absorbs the reads rather than proxying each one.
   */
  /**
   * The waitlist left this app on 2026-08-06 for `waitlist.iter.cx`
   * (`apps/waitlist`). These two entries are what keeps every link minted
   * before that move working.
   *
   * They are not optional: invite links in the form
   * `iter.cx/waitlist/r/CODE` shipped on 2026-08-06 (b7349b4, and the X share
   * in 689907b) and are in circulation. Without this they 404.
   *
   * **307, not 308.** A permanent redirect is cached by browsers indefinitely,
   * and this one is meant to be deleted at launch — when the waitlist stops
   * being the share destination at all. A 308 would outlive its purpose on
   * every machine that followed it once, which is not something a later deploy
   * can undo.
   *
   * `proxy.ts` needs no exclusion for these. `/waitlist` IS inside its matcher,
   * but with `localePrefix: "as-needed"` and a single locale next-intl rewrites
   * nothing, so the path reaches this table unmodified. That stops being true
   * the day a second locale ships and `/en/waitlist` starts existing — add the
   * prefixed form here then.
   */
  async redirects() {
    return [
      {
        source: "/waitlist",
        destination: "https://waitlist.rate.limo/",
        permanent: false,
      },
      {
        source: "/waitlist/:path*",
        destination: "https://waitlist.rate.limo/:path*",
        permanent: false,
      },

      /*
       * /price and /coin folded into /token on 2026-08-31.
       *
       * **308 here, unlike the waitlist pair above.** That one is 307 because it
       * is meant to be deleted at launch, and a permanent redirect outlives its
       * purpose on every machine that followed it once. This is the opposite
       * case: the move is permanent, and /price/[token] held the ranking title
       * for these tokens ("SYM – Name Price, Chart & Marketcap"). A temporary
       * redirect asks search engines to keep indexing the old URL and passes no
       * equity, which would throw away the traffic this merge is meant to keep.
       *
       * Order matters: /price/:token must precede /price, or the bare rule
       * swallows the token path and every deep link lands on the index.
       */
      { source: "/price/:token", destination: "/token/:token", permanent: true },
      // /token (the index) was deleted on 2026-09-03; it duplicated
      // /explore/tokens. A permanent redirect to a 404 is worse than the old
      // URL simply being gone, so this points at the directory that replaced it.
      { source: "/price", destination: "/explore/tokens", permanent: true },
      { source: "/coin/:token", destination: "/token/:token", permanent: true },
    ];
  },

  /**
   * The app's clickjacking rule, as `X-Frame-Options: SAMEORIGIN`.
   *
   * NOT as a `Content-Security-Policy: frame-ancestors` header, and the
   * reason cost three preview deployments to find: on Vercel every entry
   * here is applied to the REQUEST the render receives as well as to the
   * response, and Next reads its script nonce from the request's
   * `content-security-policy` before ever falling back to the report-only
   * header the proxy sets. A nonce-less header under that name untagged
   * every Next chunk. See `lib/security/csp.ts` for the full staging; the
   * other two enforced directives ride a meta tag in the app layout.
   *
   * `/wallet-frame*` is EXCLUDED: those pages are embedded by the app, and
   * SAMEORIGIN here would refuse that embedding. Their own `frame-ancestors`
   * names the app origins.
   */
  async headers() {
    return [
      {
        source: "/:path((?!wallet-frame(?:/|$)|_next/|api/).*)",
        headers: [FRAME_ANCESTORS_HEADER],
      },
    ];
  },

  async rewrites() {
    /**
     * The wallet host serves the wallet frame and NOTHING else.
     *
     * One deployment answers on both hosts (see `proxy.ts`), so without this
     * every page and route handler would also be reachable on the origin that
     * holds the key. `proxy.ts` refuses what its matcher sees; the paths the
     * matcher excludes on purpose — `/api`, `/x/complete`, the admin-service
     * passthroughs — are caught here instead, BEFORE the filesystem routes, and
     * sent to a route that answers 404. Static assets stay: the frame's own
     * chunks and fonts are under `/_next` and `/fonts`.
     *
     * `has: host` is a regex, so the dots are escaped. No entry at all when the
     * origin is unconfigured — that is the same-origin local shape, where there
     * is no second host to guard.
     */
    const walletHost = process.env.NEXT_PUBLIC_WALLET_ORIGIN?.trim()
      ? new URL(process.env.NEXT_PUBLIC_WALLET_ORIGIN.trim()).host
      : null;
    const beforeFiles = walletHost
      ? [
          {
            source: "/:path((?!wallet-frame(?:/|$)|_next/|fonts/|icon\\.svg$).*)",
            has: [{ type: "host" as const, value: walletHost.replace(/\./g, "\\.") }],
            destination: "/wallet-frame/blocked",
          },
        ]
      : [];

    const afterFiles = [
      // IDENTITY_SERVICE_URL, not ADMIN_SERVICE_URL, since 2026-09-03.
      //
      // The bytes used to live in whichever CHAIN's database uploaded them,
      // while this app resolves one fixed ADMIN_SERVICE_URL for every chain it
      // serves. So a logo an operator uploaded was visible only when their chain
      // happened to be the one that variable named, and every other chain's
      // artwork 404'd while the row looked perfectly correct. Repointing the
      // variable at one chain fixed that chain and broke the other; the store
      // moved instead. `chainMeta`'s docstring named this fix before it existed.
      /*
       * Three routes are NOT here any more, and their absence is the point.
       *
       * `/graduate/:pairId`, `/thesis/*` and `/launch-config` are genuinely
       * per chain — they read one chain's order books, trades and venue
       * configuration — and a rewrite is resolved at BUILD time, so it can only
       * ever name one `ADMIN_SERVICE_URL`. Every chain but that one was being
       * answered by the wrong database, with a 200 at every hop.
       *
       * They are route handlers now (`app/graduate`, `app/thesis`,
       * `app/launch-config`), reading `?chain=` per request through
       * `lib/upstreams.ts`. A rewrite could not have carried the chain; that is
       * why the shape changed rather than the destination.
       */
      { source: "/logo/:path*", destination: `${IDENTITY_SERVICE_URL}/logo/:path*` },
      // The launch flow's upload. Same-origin from the browser's point of view,
      // so a multipart POST needs no CORS preflight and the service's hostname
      // never reaches the client bundle. This target is admin-service's PUBLIC
      // route — it takes no operator key, by design (see the note on it).
      { source: "/token-logo", destination: `${ADMIN_SERVICE_URL}/token-logo` },
      // Binding an uploaded image TO a coin — the half that was missing.
      //
      // Storing bytes was always public; pointing a token at them needs proof
      // that you launched it, which these two routes establish with a nonce and
      // a wallet signature (admin-service `/token-logo/nonce` + `/token-logo/claim`,
      // and `tokenLogoClaim.ts` for the security model). Without these rewrites
      // the launch flow could upload artwork and nothing else — which is exactly
      // what it did, leaving every launched coin wearing the token list's
      // placeholder while its real logo sat orphaned in the store.
      //
      // Separate entries rather than `/token-logo/:path*`, so this proxies the
      // two routes that exist instead of forwarding whatever is added next.
      { source: "/token-logo/nonce", destination: `${ADMIN_SERVICE_URL}/token-logo/nonce` },
      { source: "/token-logo/claim", destination: `${ADMIN_SERVICE_URL}/token-logo/claim` },
      // USD balance snapshots, one row per wallet per UTC day. Also a PUBLIC
      // admin-service route: this app has no operator key and must never hold
      // one. It replaces a Strapi write that ran from a "use server" action
      // with a hardcoded CMS token. Unlike /graduate the server cannot verify
      // what it is told — see the route's own note on what must change before
      // anything renders these figures.
      // X account linking. `/x/callback` is where X itself redirects the
      // BROWSER, so it must be reachable on this origin — admin-service builds
      // the callback URL from its own public domain, but the user lands here.
      // IDENTITY_SERVICE_URL, not ADMIN_SERVICE_URL — see its definition above.
      // The X link is chain-agnostic data and belongs to one origin.
      { source: "/x/nonce", destination: `${IDENTITY_SERVICE_URL}/x/nonce` },
      { source: "/x/start", destination: `${IDENTITY_SERVICE_URL}/x/start` },
      { source: "/x/callback", destination: `${IDENTITY_SERVICE_URL}/x/callback` },
      // IDENTITY_SERVICE_URL since 2026-09-03. `accountBalanceDayBuckets` is an
      // identity table and the figure is a CROSS-CHAIN total, so reaching its
      // store through a per-chain admin-service was correct only because one
      // chain was nominated. The routes moved; the table did not have to.
      { source: "/usd-balance", destination: `${IDENTITY_SERVICE_URL}/usd-balance` },
      // BEFORE the `:address` rule below, which would otherwise swallow this
      // path with "nonce" bound as the address. It happens to forward to the
      // right place today — same literal, same destination — but only by
      // coincidence, and the coincidence breaks the moment either rule's
      // destination changes. Being explicit costs one line.
      { source: "/usd-balance/nonce", destination: `${IDENTITY_SERVICE_URL}/usd-balance/nonce` },
      { source: "/usd-balance/:address", destination: `${IDENTITY_SERVICE_URL}/usd-balance/:address` },
      /*
       * Transfers. Rewritten rather than called directly because
       * identity-service has NO CORS configuration at all — its own CLAUDE.md
       * says to add some before any client is pointed straight at it — and a
       * same-origin rewrite involves no preflight.
       *
       * `/transfers` and `/transfers/:address` are separate entries for the
       * same reason every other pair here is: a single `:path*` would also
       * capture an `app/[locale]/transfers/` page if one were ever added, and
       * shadow it with a proxy.
       */
      { source: "/transfers", destination: `${IDENTITY_SERVICE_URL}/transfers` },
      // Its own entry rather than relying on `/transfers/:address` to catch it:
      // that parameter would match the literal "discover", which works by
      // accident and breaks the day the list route gains a sibling.
      { source: "/transfers/discover", destination: `${IDENTITY_SERVICE_URL}/transfers/discover` },
      { source: "/transfers/:address", destination: `${IDENTITY_SERVICE_URL}/transfers/:address` },
      /*
       * ── The three below stay on ONE origin, and that is a DECISION ──
       *
       * `/points/:address`, `/referral/*` and `/wallet/known/:address` read
       * `tPoints`, `tReferrals` and `referralCodes`, which are per-chain
       * tables. So by the rule that moved `/graduate` and `/thesis` to
       * per-chain handlers, these should follow.
       *
       * They must not, and routing them per chain would be a new bug rather
       * than a fix:
       *
       *  - An invite code minted while the user was on Arc would register in
       *    Arc's `referralCodes` and then fail to resolve from a RISE page.
       *    Codes are shared as links; a link that works only on the chain its
       *    owner happened to be viewing is not a referral system.
       *  - `/wallet/known`'s `onboarded` is `hasPoints`, and it gates whether
       *    someone is shown the welcome flow at all. Per chain it answers "has
       *    this wallet traded HERE" for a question that means "has it traded
       *    anywhere" — so a trader of six months would be re-onboarded by
       *    switching chains.
       *
       * Today's single origin makes all three globally consistent by accident.
       * Pinning it deliberately keeps that, and it is strictly better than the
       * per-chain alternative until the product question `packages/db/src/
       * identity.ts` names is answered: does a referral earn on every chain,
       * and are the balances summed? The real fix moves `tReferrals` AND the
       * points ledger together, which is a migration, not a routing change.
       *
       * A wallet's own points. Public and narrower than the operator's
       * `/api/point/wallet`: it withholds the referral graph and transfer
       * counterparties, which a route taking any address would let anyone walk.
       */
      { source: "/points/:address", destination: `${ADMIN_SERVICE_URL}/points/:address` },
      // Referral code lookup and linking. Read routes are public and safe to
      // poll; the link route verifies a Privy access token server-side, so the
      // wallet is never taken from the request body.
      { source: "/referral/:path*", destination: `${ADMIN_SERVICE_URL}/referral/:path*` },
      // Profile nonce + delete, for /delete-account. Signed like /referral/*: the
      // service recovers the address from the signature rather than reading it from
      // the body, so this passthrough carries no authority of its own.
      // NAMED, not `/profile/:path*`. admin-service owns exactly three paths
      // here (nonce, edit, delete) and a wildcard claimed the whole namespace —
      // which silently swallowed `/profile/[address]`, the public profile PAGE,
      // and proxied it to a service that has no such route. A rewrite should
      // claim what a service actually serves, not a prefix it happens to sit
      // under.
      { source: "/profile/nonce", destination: `${IDENTITY_SERVICE_URL}/profile/nonce` },
      { source: "/profile/edit", destination: `${IDENTITY_SERVICE_URL}/profile/edit` },
      { source: "/profile/delete", destination: `${IDENTITY_SERVICE_URL}/profile/delete` },
      // Detach a verified X account. Same nonce -> sign -> verify shape as the two
      // above, and identity-service owns the `profiles` row that holds the link.
      { source: "/profile/x-unlink", destination: `${IDENTITY_SERVICE_URL}/profile/x-unlink` },
      // "Have we seen this wallet" — the onboarding trigger, since a wallet
      // connection carries no account history the way a Privy session did.
      // NARROWED from `/wallet/:path*` on 2026-09-02. admin-service serves exactly
      // one route here — `/wallet/known/:address` — and the wildcard was matching
      // ahead of the identity-service wallet-session routes below, sending them to
      // a service that has no such path. Rewrites match in ORDER, so a broad
      // source silently captures every later, more specific one.
      { source: "/wallet/known/:path*", destination: `${ADMIN_SERVICE_URL}/wallet/known/:path*` },
      // The token catalogue's brand colour/logo for one deployment. Public and
      // keyed by (chainId, address) — the exact identity a live token already
      // carries, never a symbol (this venue lets anyone mint a coin called
      // USDC). Nulls for an unlinked deployment, not a 404: most tokens have
      // not been catalogued yet, and that is a normal answer, not an error.
      // IDENTITY_SERVICE_URL since 2026-09-03. This route TAKES a chainId and
      // then has to answer for that chain — served from a per-chain
      // admin-service it answered from whichever chain ADMIN_SERVICE_URL named
      // and ignored the id in its own path, which is correct by coincidence for
      // exactly one chain.
      {
        source: "/token-brand/:chainId/:address",
        destination: `${IDENTITY_SERVICE_URL}/token-brand/:chainId/:address`,
      },
      // Operator-set chain presentation. IDENTITY_SERVICE_URL since 2026-09-03.
      // It pointed at ADMIN_SERVICE_URL because `logoURI` is a root-relative
      // /logo/:hash path and the row had to come from wherever the bytes were —
      // which was one chain's database. Both moved together, so the constraint
      // is satisfied by them sharing the platform store instead.
      { source: "/chain-brand", destination: `${IDENTITY_SERVICE_URL}/chain-brand` },
      // Which chains to SHOW: an operator's overrides on top of the build's
      // own list. Read-only booleans, and an unreachable service degrades to
      // the shipped list — see lib/chains/useVisibleChains.ts for why the
      // build stays in charge of what CAN be served.
      // IDENTITY_SERVICE_URL, not ADMIN_SERVICE_URL, since 2026-09-02. The flag
      // used to live in the per-chain database, and the admin panel can point at
      // any chain's admin-service — so hiding a chain from the wrong panel wrote
      // a row this app never read, with a 200 at every hop. One copy now, in the
      // database every deployment shares.
      {
        source: "/chains/display",
        destination: `${IDENTITY_SERVICE_URL}/chains/display`,
      },
      {
        // The cross-chain routes on offer. Chain-agnostic by nature — a route is
        // about a PAIR of chains — so it comes from identity-service, not from a
        // per-chain admin-service. Needs the proxy.ts exclusion too; missing
        // that is silent, because next-intl claims the path first.
        source: "/transfer-routes",
        destination: `${IDENTITY_SERVICE_URL}/transfer-routes`,
      },
      // An operator's ordering/hiding of a chain's quote assets. Presentation
      // only — the contract remains the allowlist.
      {
        source: "/chains/:chainId/quotes",
        destination: `${IDENTITY_SERVICE_URL}/chains/:chainId/quotes`,
      },
      // Follow / unfollow. IDENTITY_SERVICE_URL, not the per-chain gateway:
      // `follows` is chain-agnostic and identity-service is its sole writer.
      // Routed through this rewrite rather than called directly so the request
      // stays same-origin and needs no CORS on identity-service.
      {
        source: "/follow/:address",
        destination: `${IDENTITY_SERVICE_URL}/follow/:address`,
      },
      // Profile writes, all of them, on one origin. PUT /profile and the two
      // image uploads came off the per-chain gateway; /profile/{nonce,edit,
      // delete} came off the per-chain admin-service. `profiles` and
      // `accountProfiles` are both identity, so both writers are here now.
      // `/profile/save`, not a bare `/profile`: a rewrite on the bare path would
      // capture EVERY method, so the day someone adds an `app/[locale]/profile`
      // page it would be shadowed by an API proxy — the exact trap proxy.ts's
      // matcher comment warns about for this prefix. The destination is still
      // `PUT /profile`, which is the correct shape on the service itself.
      { source: "/profile/save", destination: `${IDENTITY_SERVICE_URL}/profile` },
      { source: "/profile/avatar", destination: `${IDENTITY_SERVICE_URL}/profile/avatar` },
      { source: "/profile/banner", destination: `${IDENTITY_SERVICE_URL}/profile/banner` },
      // The wallet session and the watchlist it authorizes. Same-origin through
      // this rewrite so the httpOnly wallet cookie is sent without CORS or a
      // third-party-cookie problem — identity-service sets it on .iter.cx, and
      // a cross-origin fetch would need credentials mode plus an allow-list it
      // does not have.
      // Everything else under /wallet is identity-service: the session and the
      // watchlist it authorizes. Order matters — /wallet/known above is
      // admin-service's and must be matched first.
      //
      // The watchlist deliberately does NOT own /watchlist: a rewrite captures
      // every method, so that path would be unavailable as a PAGE, which is
      // exactly what a watchlist wants. proxy.ts's matcher notes already name
      // /wallet as a prefix that will never be a page.
      { source: "/wallet/:path*", destination: `${IDENTITY_SERVICE_URL}/wallet/:path*` },
    ];

    return { beforeFiles, afterFiles };
  },

  // /api/og reads the two share cards off disk at request time. Route
  // handlers only ship the files the tracer can see them reference, and a
  // runtime-built path isn't traceable, so name them explicitly or the
  // route 500s in production while working fine locally.
  outputFileTracingIncludes: {
    "/api/og": ["./public/images/opengraph-light.jpg", "./public/images/opengraph-dark.jpg"],
  },

  // WalletConnect (via AppKit's wagmi adapter) pulls in optional
  // React-Native and Node-only branches that don't apply in a browser
  // build; externalizing them silences "module not found" build warnings.
  webpack: (config) => {
    config.externals.push(
      "pino-pretty",
      "lokijs",
      "encoding",
      "@react-native-async-storage/async-storage"
    );
    return config;
  },
};

export default withNextIntl(nextConfig);
