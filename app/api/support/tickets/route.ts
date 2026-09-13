import { NextRequest, NextResponse } from "next/server";
import { ticketDraftSchema } from "@iter/types";
import { createTicket } from "@/lib/support/server";

/**
 * Opens a support ticket.
 *
 * Unauthenticated by design, for the same reason as `/api/waitlist`: someone
 * who cannot connect a wallet, or whose problem IS that they cannot connect a
 * wallet, still has to be able to reach a human. Requiring a signature here
 * would gate support behind the thing people most often need support with.
 *
 * The email is therefore ASSERTED, never proved — a string somebody typed. It
 * is a reply-to hint and must not be treated as identity anywhere downstream;
 * the schema comment in packages/db says so at length, and the admin view
 * repeats it on the page.
 *
 * Returns the access token ONCE. It is the browser's only key to the thread,
 * it is never emailed and never shown, and losing it means opening a new
 * ticket — which is the correct trade for not building an account system to
 * answer a support question.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ticketDraftSchema.safeParse(body);

  if (!parsed.success) {
    // The first issue's message, which the schema writes as something a person
    // can act on ("enter an email address we can reply to"), not a zod dump.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "check the form and try again" },
      { status: 400 },
    );
  }

  const result = await createTicket(parsed.data);

  if (!result.ok) {
    if (result.reason === "no-reference") {
      // Three reference collisions in a row. Effectively impossible, but a 500
      // here is an error page in front of someone asking for help, so it gets
      // a sentence and a retry rather than a stack trace.
      return NextResponse.json(
        { error: "Something went wrong opening your ticket. Please try again." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          "You already have several open tickets. Reply on one of those and we'll pick it up there.",
      },
      { status: 429 },
    );
  }

  return NextResponse.json({ ticket: result.ticket }, { status: 201 });
}
