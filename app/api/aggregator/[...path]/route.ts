import { NextRequest, NextResponse } from "next/server";
import { AggregatorLink } from "@/consts";

/**
 * Same-origin read proxy for browser calls to the AGGREGATOR.
 *
 * The sibling of `app/api/gateway/[...path]`, and separate from it for the
 * reason that route needs a `?network=`: a gateway request has to choose a
 * chain, and an aggregator request must not. Routing aggregator calls through
 * the gateway proxy would mean inventing a chain for a cross-chain question,
 * which is the exact confusion the rank routes exist to remove.
 *
 * Read-only and GET-only. Nothing behind this URL mutates, and a proxy that
 * forwarded writes would let any origin the browser can reach post through the
 * app's own hostname.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!AggregatorLink) {
    return NextResponse.json({ error: "aggregator not configured" }, { status: 503 });
  }

  const { path } = await context.params;
  const query = new URLSearchParams(request.nextUrl.searchParams);
  const upstream = await fetch(
    `${AggregatorLink}/api/${path.map(encodeURIComponent).join("/")}?${query}`,
    { cache: "no-store", headers: { accept: "application/json" } },
  );
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
