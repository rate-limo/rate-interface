import { NextRequest, NextResponse } from "next/server";
import { replyDraftSchema } from "@iter/types";
import { appendUserMessage, loadThread } from "@/lib/support/server";

/**
 * Reads and continues one support thread.
 *
 * ## The token travels in a header, never in the URL
 *
 * `x-support-token` is the whole access control for a conversation that
 * contains an email address. Query strings end up in server logs, proxy logs,
 * browser history and `Referer` headers on any outbound link — which is why
 * sensitive values do not go in them. A header is not secret either, but it
 * does not get written down by four systems that were never asked to.
 *
 * ## An unknown token and a malformed one give the same answer
 *
 * Both are 404. Distinguishing them turns this endpoint into an oracle for
 * which tokens exist, and there is nothing a legitimate visitor does with the
 * difference — their browser either has the token that opened the ticket or it
 * does not.
 */

export const dynamic = "force-dynamic";

const TOKEN_HEADER = "x-support-token";

export async function GET(req: NextRequest) {
  const thread = await loadThread(req.headers.get(TOKEN_HEADER) ?? "");
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ thread }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get(TOKEN_HEADER) ?? "";
  const parsed = replyDraftSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "write a message first" }, { status: 400 });
  }

  const result = await appendUserMessage(token, parsed.data.message);

  if (!result.ok) {
    if (result.reason === "thread-full") {
      return NextResponse.json(
        { error: "This conversation has got long — please open a new ticket." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ thread: result.thread }, { headers: { "cache-control": "no-store" } });
}
