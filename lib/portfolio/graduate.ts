/**
 * Asking admin-service to re-evaluate a market's listing.
 *
 * ## The click carries no authority
 *
 * apps/web has no operator key and must never hold one. A key-holding proxy
 * here would hand every visitor of a public site the operator secret's full
 * capabilities — token metadata, landing copy, Point config — which is exactly
 * the hole found and closed in apps/admin (see its `app/api/[...path]/route.ts`).
 * And nothing records which wallet launched what (`adminTokenMeta` has six
 * columns, pinned by a schema test), so the server could not verify a creator
 * even if it wanted to.
 *
 * So the request is made worthless instead. admin-service re-derives eligibility
 * from `spotPairs.dayQuoteTvlUSD` and its own config row and lists only if the
 * threshold is met; below it, the call writes nothing. An anonymous caller and
 * an operator get identical outcomes, which is the same argument that makes
 * `POST /token-logo` safe to expose.
 *
 * ## Same-origin, and PER CHAIN since 2026-09-03
 *
 * Posts to `/graduate/:pairId?chain=<slug>`, a route handler in
 * `app/graduate/[pairId]/route.ts` that resolves the chain's own admin-service.
 * It used to be a build-time rewrite at one `ADMIN_SERVICE_URL`, and
 * `evaluateGraduation` re-derives eligibility from `spotPairs.dayQuoteTvlUSD` —
 * ONE chain's order books. So an Arc creator's click was evaluated against
 * RISE's markets, where the pair id does not exist: it reported on a market it
 * had never looked at and wrote nothing.
 *
 * A rewrite could not have fixed it. Next resolves them at build time, so no
 * rewrite can read which chain a request is for.
 *
 * **The slug is required, not defaulted.** A default would restore exactly the
 * bug: a caller that forgot it would be answered by whichever chain the
 * deployment happened to list first, with a 200 the whole way.
 */

export interface GraduationResult {
  pairId: string;
  eligible: boolean;
  /** True when this call is what listed it. False for an already-listed market. */
  graduated: boolean;
  /** Threshold met, but the operator has auto-listing switched off. */
  heldForApproval: boolean;
  reason: "already-graduated" | "below-threshold" | "quote-not-allowed" | null;
  /**
   * Which rule decided, and the figures in ITS unit. Optional so an
   * admin-service deployed before per-quote amounts existed still parses —
   * absent reads as USD, which is what such a deployment grades on.
   */
  basis?: "quote" | "usd";
  unit?: string;
  amount?: number;
  required?: number;
  shortfall?: number;
  quoteTvlUsd: number;
  thresholdUsd: number;
  progressPct: number;
  shortfallUsd: number;
}

export class GraduationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call(
  pairId: string,
  chainSlug: string,
  init: RequestInit,
): Promise<GraduationResult> {
  const path = `/graduate/${encodeURIComponent(pairId)}?chain=${encodeURIComponent(chainSlug)}`;
  const res = await fetch(path, init);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : res.status === 429
          ? "Too many requests. Try again in a minute."
          : "Could not reach the listing service.";
    throw new GraduationError(message, res.status);
  }
  return res.json() as Promise<GraduationResult>;
}

/**
 * Ask for a re-evaluation. Writes only if the threshold is met.
 *
 * `chainSlug` is the chain the MARKET is on, not the page's displayed chain —
 * the portfolio is cross-chain, so a Creator row and the page it sits on
 * routinely disagree. `Creator.tsx` passes `slugFor(t.network)` for that reason.
 */
export function requestGraduation(pairId: string, chainSlug: string): Promise<GraduationResult> {
  return call(pairId, chainSlug, { method: "POST" });
}

/** Read the current standing without asking for anything. Safe to poll. */
export function readGraduation(pairId: string, chainSlug: string): Promise<GraduationResult> {
  return call(pairId, chainSlug, { method: "GET" });
}
