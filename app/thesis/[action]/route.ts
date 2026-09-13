import { NextRequest, NextResponse } from "next/server";
import { forwardToAdminService } from "@/lib/adminProxy";

/**
 * Thesis nonce / post / retract, routed to the chain the TRADE is on.
 *
 * ## Why the chain matters here more than anywhere else
 *
 * `/thesis/post` reads `broker.spotTrades` to confirm the trade being written
 * about actually happened, and **that read IS the authorization** — the route
 * takes the trade from the database, never from the request body, which is what
 * stops anyone claiming a thesis on a trade they did not make
 * (apps/admin-service/CLAUDE.md says so at length, and it is why the route
 * stayed on admin-service when `follows` moved to identity-service).
 *
 * Pointed at the wrong chain that check does not merely mislead, it inverts:
 * every genuine thesis is refused because its trade is in another database.
 *
 * ## Three actions, named, not a wildcard
 *
 * admin-service serves exactly these three paths under `/thesis`. A
 * `[...path]` catch-all would claim the whole namespace and forward anything
 * appended to it — the trap `next.config.ts` records for `/profile/:path*`,
 * which silently swallowed the public profile PAGE.
 */

const ACTIONS = new Set(["nonce", "post", "retract"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  const { action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "not a thesis action" }, { status: 404 });
  }
  return forwardToAdminService(req, `/thesis/${action}`, {
    method: "POST",
    body: await req.text(),
  });
}
