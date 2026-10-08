/**
 * Where tabs report how often the commit watermark had to act
 * (`lib/realtime/watermark.ts`, `reportWatermarkCounters`).
 *
 * One `[watermark]` line per report in Vercel's function logs, so
 * `vercel logs --filter watermark` answers "how often does a user get an
 * answer older than what the socket already showed them". `retried` is the
 * mechanism working; `refused` and `healed` are the numbers to watch.
 *
 * Same stance as /api/csp-report: unauthenticated (a beacon carries no
 * credentials), trusts nothing in the body, keeps only small non-negative
 * integers under short chain keys, and answers 204 whatever arrives. The body
 * carries no wallet, no URL and no identifier — just counts per chain.
 */

import { parseWatermarkReport } from "@/lib/realtime/watermarkReport";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    for (const [chain, row] of Object.entries(parseWatermarkReport(JSON.parse(text)))) {
      const line = JSON.stringify({ chain, ...row });
      if (row.refused > 0 || row.healed > 0) console.warn("[watermark]", line);
      else console.log("[watermark]", line);
    }
  } catch {
    // A malformed report is dropped; the answer does not say why.
  }
  return new Response(null, { status: 204 });
}
