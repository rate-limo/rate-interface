import { isActionable, parseCspReports } from "@/lib/security/cspReport";

/**
 * Where browsers post Content-Security-Policy violations.
 *
 * Named by `report-uri` and `report-to` in `lib/security/csp.ts`. The app's
 * full policy ships report-only, so this is the ONLY place a violation shows
 * up: one `console.warn` line per actionable report, in Vercel's function
 * logs, tagged `[csp]` so `vercel logs --filter csp` finds them. When those
 * are quiet across real use — trading, a withdrawal, the bridge, TradingView
 * on Pro, analytics after consent — the policy moves to the enforced header.
 *
 * Unauthenticated by nature (the browser sends it, with no credentials), so
 * it trusts nothing in the body: the parse caps every field, the body is
 * bounded, and the answer is 204 whatever arrives. Answering an error to a
 * malformed report would only teach a sender what shape gets logged.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    payload = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }

  for (const violation of parseCspReports(payload)) {
    if (!isActionable(violation)) continue;
    console.warn("[csp]", JSON.stringify(violation));
  }
  return new Response(null, { status: 204 });
}
