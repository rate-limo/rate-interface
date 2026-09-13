/*
 * PUBLIC MIRROR STUB — the real implementation is not open source.
 *
 * Support tickets live in Postgres in the private repository. The thread is
 * keyed by a 32-byte access token held only in the visitor's browser, and the
 * queries here are the whole access control for a conversation containing an
 * email address — which is reason enough not to mirror them.
 *
 * Every refusal below is a state the real module can return and every caller
 * already handles, so the widget degrades rather than breaking: it reports that
 * a ticket could not be opened instead of throwing.
 */
import {
  newTicketReference,
  type SupportThreadView,
} from "@iter/types";

export const MAX_OPEN_TICKETS_PER_EMAIL = 5;
export const MAX_MESSAGES_PER_TICKET = 100;

export interface CreatedTicket {
  /** The operator-facing reference, safe to show the visitor so they can quote it. */
  reference: string;
  /** The browser's key to this thread. Shown to nobody. */
  token: string;
}

export type CreateResult =
  | { ok: true; ticket: CreatedTicket }
  | { ok: false; reason: "too-many-open" | "no-reference" };

export type ReplyResult =
  | { ok: true; thread: SupportThreadView }
  | { ok: false; reason: "unknown-ticket" | "thread-full" };

export async function createTicket(
  _input: { email: string; message: string; pagePath?: string },
  _newReference: () => string = newTicketReference,
): Promise<CreateResult> {
  return { ok: false, reason: "no-reference" };
}

export async function loadThread(_token: string): Promise<SupportThreadView | null> {
  return null;
}

export async function appendUserMessage(
  _token: string,
  _message: string,
): Promise<ReplyResult> {
  return { ok: false, reason: "unknown-ticket" };
}
