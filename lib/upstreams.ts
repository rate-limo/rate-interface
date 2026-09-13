import { SUPPORTED_CHAINS, findChain } from "@iter/deployments";
import { slugToNetworkName } from "@/consts";

/**
 * WHICH chain's admin-service a request goes to.
 *
 * ## The problem this exists to fix
 *
 * admin-service is deployed PER CHAIN and bound to one `DATABASE_URL`. apps/web
 * is ONE deployment serving MANY chains, and every admin passthrough was a
 * build-time rewrite at a single `ADMIN_SERVICE_URL` — so every chain-scoped
 * admin read answered from whichever chain that variable happened to name.
 *
 * For presentation data the answer was to stop having a chain at all: logos,
 * chain marks and the token catalogue moved to the platform store on
 * 2026-09-03 and are served by identity-service. The routes here are the ones
 * where that is not available, because the question genuinely has a per-chain
 * answer:
 *
 *  - `/graduate/:pairId` re-derives eligibility from `spotPairs.dayQuoteTvlUSD`,
 *    which is one chain's order books. Pointed at the wrong chain, an Arc
 *    creator's click evaluated a RISE market and wrote nothing — reporting
 *    "below threshold" for a market it never looked at.
 *  - `/thesis/*` reads `broker.spotTrades` to verify the trade being written
 *    about actually happened, and THAT READ is the authorization (see
 *    apps/admin-service/CLAUDE.md). Against the wrong chain it refuses every
 *    real thesis and would accept none it should.
 *  - `/launch-config` reads `landingContent`, which `packages/db/src/identity.ts`
 *    keeps per chain on purpose — each chain's panel curates its own venue.
 *
 * ## Why a route handler and not a rewrite
 *
 * Next resolves `rewrites()` at BUILD time, so a rewrite cannot read the chain
 * a request is for. That is not a limitation to work around — it is the reason
 * these were wrong. A route handler reads the environment per request, which is
 * also what apps/admin's own `/logo` handler does and for the same recorded
 * reason: there is no build-time value to bake wrong.
 *
 * ## Configuration
 *
 * Per chain, suffixed with the numeric chain id — the same names apps/admin
 * already uses, so a deployment configures one set:
 *
 *   ADMIN_SERVICE_URL_11155931 = https://admin-service-rise.up.railway.app
 *   ADMIN_SERVICE_URL_5042002  = https://admin-service-arc.up.railway.app
 *
 * **No API keys here, ever.** apps/admin's map carries `ADMIN_API_KEY_*`
 * because that app authenticates as an operator. Every route this module serves
 * is a PUBLIC admin-service route that carries no authority, and a key-holding
 * proxy on a public site would hand every visitor the operator secret's
 * capabilities — the hole found and closed in apps/admin. Adding a key here
 * "for consistency" would reopen it.
 *
 * ## The fallback is NARROW, deliberately
 *
 * `ADMIN_SERVICE_URL` (unsuffixed) is used only when NO suffixed variable is
 * configured — i.e. a single-chain deployment or local development, where it is
 * the right answer for every chain by construction.
 *
 * Once any suffixed variable exists, an unconfigured chain is REFUSED rather
 * than served from a neighbour. apps/admin can fall back safely because an
 * operator picked the chain by hand and a chip on every page reports what was
 * actually served; here nobody picked and nothing reports, so a silent fallback
 * is precisely the failure this module was written to end — one chain's answer
 * presented as another's, with a 200 at every hop.
 *
 * ## A chain id cannot become an SSRF
 *
 * The caller names a chain SLUG, never a URL. Resolution is a lookup in the
 * registry followed by a lookup in the env-configured set, so nothing the
 * browser sends reaches `fetch`. An unknown slug resolves to nothing and is
 * refused.
 *
 * Slug → NAME → id, not slug → id, because the repo does not agree with itself
 * on every number: `consts.chainIds` puts MegaETH Testnet at 6342 while
 * `deployments.json` says 6343. `lib/search/explorer.ts` resolves chains by name
 * for exactly this reason; so does this.
 */

/** The query parameter every caller passes. Matches the app's own URL scheme,
 * where `?chain=<slug>` already identifies the displayed chain. */
export const CHAIN_PARAM = "chain";

const URL_PREFIX = "ADMIN_SERVICE_URL_";

export interface AdminUpstream {
  /** null for the unsuffixed fallback, which names no chain. */
  chainId: number | null;
  url: string;
}

const trim = (value: string): string => value.replace(/\/+$/, "");

/** Every chain this deployment has an admin-service configured for. */
export function configuredUpstreams(): AdminUpstream[] {
  const out: AdminUpstream[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(URL_PREFIX) || !value) continue;
    const suffix = name.slice(URL_PREFIX.length);
    // A numeric suffix only. Anything else is a differently-named variable that
    // happens to share the prefix, and guessing at it would invent a chain.
    if (!/^\d+$/.test(suffix)) continue;
    out.push({ chainId: Number(suffix), url: trim(value) });
  }
  return out.sort((a, b) => (a.chainId ?? 0) - (b.chainId ?? 0));
}

/** The numeric chain id for a URL slug, or null if nothing knows that slug. */
export function chainIdForSlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  const name = slugToNetworkName[slug.trim().toLowerCase()];
  if (!name) return null;
  return findChain(name)?.chainId ?? null;
}

/**
 * Chains this build SERVES but has no admin-service configured for.
 *
 * `configuredUpstreams()` answers "what can I dial". This answers "what should
 * I be able to dial", and the difference is what makes a forgotten variable
 * visible. Without it an absence produces nothing at all until somebody clicks
 * Graduate on the affected chain and gets a 503 — which is loud, but only for
 * whoever clicked, and only then.
 *
 * ## One served chain needs no suffix; two need both
 *
 * With a single chain the unsuffixed `ADMIN_SERVICE_URL` is complete by
 * construction. With two it can serve exactly one and **nothing records
 * which**, so both count as missing until each has its own variable.
 *
 * Deliberately stricter than "some suffixed variables exist". The admin panel
 * spent weeks with ZERO of them and two served chains, unable to reach one of
 * them at all, and a rule that only flagged PARTIAL configuration would have
 * stayed silent through the whole thing. Nothing here is checking for a typo;
 * it is checking that the deployment can reach what it claims to serve.
 */
export function missingUpstreams(): { chainId: number; label: string; variable: string }[] {
  if (SUPPORTED_CHAINS.length <= 1) return [];
  const configured = new Set(configuredUpstreams().map((u) => u.chainId));
  const out: { chainId: number; label: string; variable: string }[] = [];
  for (const name of SUPPORTED_CHAINS) {
    const chainId = findChain(name)?.chainId;
    if (chainId === undefined || configured.has(chainId)) continue;
    out.push({ chainId, label: name, variable: `${URL_PREFIX}${chainId}` });
  }
  return out.sort((a, b) => a.chainId - b.chainId);
}

export type UpstreamResolution =
  | { ok: true; upstream: AdminUpstream }
  | { ok: false; status: 400 | 503; error: string };

/**
 * Resolve the admin-service for a request's `?chain=` slug.
 *
 * Every failure names what is missing. These routes were silently answering
 * from the wrong chain before; a handler that degrades quietly would replace one
 * invisible fault with another.
 */
export function resolveAdminUpstream(slug: string | null | undefined): UpstreamResolution {
  const configured = configuredUpstreams();

  if (configured.length === 0) {
    // Single-chain deployment or local development: the unsuffixed variable is
    // the right answer for every chain, because there is only one.
    const fallback = process.env.ADMIN_SERVICE_URL?.trim();
    if (!fallback) {
      return {
        ok: false,
        status: 503,
        error:
          "no admin-service is configured: set ADMIN_SERVICE_URL_<chainId> for each chain, " +
          "or ADMIN_SERVICE_URL for a single-chain deployment",
      };
    }
    return { ok: true, upstream: { chainId: null, url: trim(fallback) } };
  }

  const chainId = chainIdForSlug(slug);
  if (chainId === null) {
    return {
      ok: false,
      status: 400,
      // Named rather than defaulted: this endpoint's whole purpose is to answer
      // for ONE chain, and there is no honest default once several are served.
      error: slug
        ? `unknown chain "${slug}"`
        : `a ${CHAIN_PARAM} parameter is required — this deployment serves several chains`,
    };
  }

  const upstream = configured.find((u) => u.chainId === chainId);
  if (!upstream) {
    return {
      ok: false,
      status: 503,
      error: `no admin-service configured for chain ${chainId} (set ${URL_PREFIX}${chainId})`,
    };
  }
  return { ok: true, upstream };
}
