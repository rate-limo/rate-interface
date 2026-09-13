import { NextRequest, NextResponse } from "next/server";
import { PonderLinks } from "@/consts";

/**
 * Same-origin read proxy for browser calls to the gateway's protected live
 * endpoints. The gateway intentionally rejects arbitrary localhost origins;
 * server-to-server requests have no browser Origin and remain within policy.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const network = request.nextUrl.searchParams.get("network");
  const gateway = network ? PonderLinks[network] : undefined;
  if (!gateway) return NextResponse.json({ error: "unsupported network" }, { status: 400 });

  const { path } = await context.params;
  if (path.join("/") === "swap/tokens") {
    const [listedResponse, unlistedResponse] = await Promise.all([
      fetch(`${gateway}/api/pairs/1000/1`, { cache: "no-store" }),
      fetch(`${gateway}/api/pairs/unlisted/1000/1`, { cache: "no-store" }),
    ]);
    if (!listedResponse.ok || !unlistedResponse.ok) {
      return NextResponse.json({ error: "could not load swap markets" }, { status: 502 });
    }
    const [listed, unlisted] = await Promise.all([listedResponse.json(), unlistedResponse.json()]);
    const tokens = new Map<string, unknown>();
    for (const pair of [...(listed.pairs ?? []), ...(unlisted.pairs ?? [])]) {
      // Both sides must actually be present before either is read. The line
      // below used to dereference `token.id` unguarded while the price test
      // above used `?.` — so a pair missing a side passed the guard that
      // admitted it might be missing, then threw on the next line and took the
      // WHOLE swap token list down with a 500. One malformed row, no tokens in
      // the swap card at all.
      const { base, quote } = pair;
      if (!base?.id || !quote?.id) continue;
      // Priced at or below zero means unquotable, not merely unknown; a token
      // with no price at all is still listable and is left in deliberately.
      if (base.priceUSD <= 0 || quote.priceUSD <= 0) continue;
      for (const token of [base, quote]) tokens.set(token.id.toLowerCase(), token);
    }
    return NextResponse.json({ tokens: [...tokens.values()] }, { headers: { "cache-control": "no-store" } });
  }

  const query = new URLSearchParams(request.nextUrl.searchParams);
  query.delete("network");
  const upstream = await fetch(`${gateway}/api/${path.map(encodeURIComponent).join("/")}?${query}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
