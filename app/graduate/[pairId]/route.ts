import { NextRequest, NextResponse } from "next/server";
import { forwardToAdminService } from "@/lib/adminProxy";

/**
 * The Creator tab's Graduate control, routed to the chain the market is on.
 *
 * ## Why this stopped being a rewrite
 *
 * `/graduate/:pairId` was a build-time rewrite at a single `ADMIN_SERVICE_URL`,
 * and admin-service is deployed per chain. `evaluateGraduation` re-derives
 * eligibility from `spotPairs.dayQuoteTvlUSD` — one chain's order books — so an
 * Arc creator's click was evaluated against RISE's markets. The pair id did not
 * exist there, so it reported a market it had never looked at and wrote nothing.
 *
 * A rewrite could not fix that: Next resolves them at BUILD time, so no rewrite
 * can read which chain a request is for.
 *
 * ## The click still carries no authority
 *
 * Unchanged, and it must stay that way. The forwarding helper attaches no
 * `x-admin-key`; the server re-derives eligibility from state it already owns
 * and lists only if the threshold is met. See `lib/portfolio/graduate.ts`.
 */

const PAIR_ID = /^[0-9a-zA-Z_-]{1,128}$/;

function guard(pairId: string): NextResponse | null {
  // Validated before it reaches a URL, so this route can never be pointed at
  // another path on admin-service — the same rule apps/admin applies to the
  // logo route's hash parameter.
  return PAIR_ID.test(pairId) ? null : NextResponse.json({ error: "not a pair id" }, { status: 400 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pairId: string }> },
): Promise<NextResponse> {
  const { pairId } = await params;
  return guard(pairId) ?? forwardToAdminService(req, `/graduate/${pairId}`, { method: "GET" });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pairId: string }> },
): Promise<NextResponse> {
  const { pairId } = await params;
  return (
    guard(pairId) ??
    forwardToAdminService(req, `/graduate/${pairId}`, { method: "POST", body: await req.text() })
  );
}
