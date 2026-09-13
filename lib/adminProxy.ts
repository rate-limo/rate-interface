import { NextRequest, NextResponse } from "next/server";
import { CHAIN_PARAM, resolveAdminUpstream } from "./upstreams";

/**
 * Forward one request to the admin-service of the chain it names.
 *
 * Shared by the handlers that replaced the single-origin rewrites — see
 * `lib/upstreams.ts` for why those rewrites were wrong and why this cannot be a
 * rewrite. Three handlers doing the same forwarding by hand is three places for
 * the header allowlist and the error shape to drift.
 *
 * ## It carries no authority, and must not gain any
 *
 * Every route forwarded through here is a PUBLIC admin-service route. The
 * request is made worthless rather than authenticated: `/graduate` re-derives
 * eligibility from state the server already owns, `/thesis/post` reads the trade
 * from `broker.spotTrades` rather than the body, `/launch-config` is read-only.
 *
 * **Never attach `x-admin-key` here.** apps/web is a public site; a key-holding
 * proxy would hand every visitor the operator secret's full capabilities. That
 * exact hole existed in apps/admin and was closed — see its
 * `app/api/[...path]/route.ts`, and `lib/portfolio/graduate.ts` here.
 *
 * ## Headers are an allowlist in both directions
 *
 * Forwarding the incoming headers wholesale would send this origin's cookies —
 * `iter.sid` and `iter.wallet`, both `Domain=.iter.cx` — to a service that has
 * no business reading them. Only `content-type` goes up; only the response
 * headers a browser needs come back.
 */

/** Response headers worth passing through. Anything else is the upstream's own
 * bookkeeping and is better re-derived here than mirrored. */
// `retry-after` rides along because /graduate is rate-limited upstream; dropping
// it would leave a 429 with no answer to "when can I try again".
const PASSTHROUGH = ["content-type", "cache-control", "etag", "retry-after"] as const;

export async function forwardToAdminService(
  req: NextRequest,
  path: string,
  init: { method: string; body?: BodyInit | null } = { method: "GET" },
): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get(CHAIN_PARAM);
  const resolved = resolveAdminUpstream(slug);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${resolved.upstream.url}${path}`, {
      method: init.method,
      // Only content-type. See the note above on why the cookies must not travel.
      headers: req.headers.get("content-type")
        ? { "content-type": req.headers.get("content-type") as string }
        : undefined,
      body: init.body ?? undefined,
      // The whole point of this handler is that it reads the environment per
      // request; a cached response would reintroduce a baked answer.
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `could not reach admin-service for ${slug ?? "the default chain"}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
