import { NextRequest, NextResponse } from "next/server";
import { forwardToAdminService } from "@/lib/adminProxy";

/**
 * Which launch modes a chain offers, from that chain's own panel.
 *
 * Reads `landingContent`, which `packages/db/src/identity.ts` keeps PER CHAIN
 * deliberately — "each is read by the per-chain admin panel curating THAT
 * chain". Served through one fixed `ADMIN_SERVICE_URL` it reported one chain's
 * venue configuration on every chain's launch page, so switching auction
 * launches off for Arc did nothing and switching them off for RISE did it
 * everywhere.
 *
 * A rewrite cannot read the chain a request is for (they resolve at build
 * time), which is why this is a handler. See `lib/upstreams.ts`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return forwardToAdminService(req, "/launch-config", { method: "GET" });
}
