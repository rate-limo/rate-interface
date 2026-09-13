import { z } from "zod";

/**
 * Support ticket domain rules, shared by the three apps that touch a ticket.
 *
 * apps/web writes them (a visitor opens a ticket and replies), admin-service
 * writes them (an operator replies or closes), and apps/admin reads them. The
 * status machine has to agree across all three, and it is exactly the kind of
 * three-line rule that gets re-implemented slightly differently in each place —
 * so it lives here, where all three already depend.
 *
 * Everything in this module is pure. Nothing here talks to a database.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * - `open` — the visitor is waiting on us. This is the operator's queue.
 * - `answered` — an operator replied; the ball is with the visitor.
 * - `closed` — done, by an operator's decision.
 *
 * Deliberately NOT a pg enum: adding a state would then be a migration, and
 * these are display states that will change more often than the table does.
 * `isTicketStatus` is the guard at every boundary, and unknown values from the
 * database render as-is rather than crashing a page.
 */
export const TICKET_STATUSES = ["open", "answered", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

/**
 * A message from the visitor puts the ticket back in the queue — including on
 * a closed one.
 *
 * Reopening rather than refusing is the point: the alternative is a visitor
 * typing into a thread that silently goes nowhere because an operator called
 * it done. If they still have something to say, it is still open. There is no
 * "reopened" state, because for the operator it is indistinguishable from any
 * other ticket that needs an answer.
 */
export function statusAfterUserMessage(_current: TicketStatus | string): TicketStatus {
  return "open";
}

/**
 * An operator's reply moves the ticket out of the queue and onto the visitor.
 *
 * A reply to a CLOSED ticket leaves it closed: an operator adding a last note
 * to something they just finished should not put it back in their own queue.
 */
export function statusAfterOperatorReply(current: TicketStatus | string): TicketStatus {
  return current === "closed" ? "closed" : "answered";
}

/** Only `open` tickets are waiting on us. Drives the queue count. */
export function needsReply(status: TicketStatus | string): boolean {
  return status === "open";
}

/* -------------------------------------------------------------------------- */
/* What a visitor may submit                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Caps, enforced on the SERVER. A `maxLength` on an input is a courtesy to
 * someone typing, not a limit — anything can POST here, and this endpoint is
 * unauthenticated by design.
 */
export const EMAIL_MAX = 254; // RFC 5321 practical maximum
export const MESSAGE_MAX = 4000;
/** Truncation point for the page a ticket was opened from — never a rejection. */
export const PAGE_PATH_MAX = 512;
export const MESSAGE_MIN = 1;

/**
 * Deliberately permissive: one `@`, something either side, no whitespace.
 *
 * A strict pattern rejects valid addresses (plus-tags, new TLDs, unicode
 * domains) and still cannot prove the mailbox exists — so tightening it only
 * turns "we might not reach you" into "you cannot ask for help". The address is
 * asserted, never verified; see the schema comment in packages/db.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed. Not deduplicated against anything — two tickets from
 * the same address are not known to be the same person. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const ticketDraftSchema = z.object({
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX)
    .regex(EMAIL_PATTERN, "enter an email address we can reply to")
    .transform(normalizeEmail),
  message: z.string().trim().min(MESSAGE_MIN, "tell us what happened").max(MESSAGE_MAX),
  /**
   * Where they were when they opened the widget. Context for the operator,
   * nothing more, and never trusted for anything but display.
   *
   * It can NEVER fail the parse. A long URL — `/trade/pro` with a full set of
   * params is already past 500 characters — must not cost someone their
   * support request, which is what `.max()` did here until it was caught. Same
   * call `/api/waitlist` makes about a malformed referral code: failing the
   * thing that matters over the thing that does not is the wrong trade. Junk
   * is dropped, long values are truncated, and the ticket goes through.
   */
  pagePath: z
    .unknown()
    .optional()
    .transform((v) =>
      typeof v === "string" ? v.trim().slice(0, PAGE_PATH_MAX) || undefined : undefined,
    ),
});

export const replyDraftSchema = z.object({
  message: z.string().trim().min(MESSAGE_MIN).max(MESSAGE_MAX),
});

export type TicketDraft = z.infer<typeof ticketDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                */
/* -------------------------------------------------------------------------- */

/** Unambiguous alphabet — no 0/O, 1/I/L — because these get read aloud and
 * retyped into a support conversation. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * The operator-facing reference, e.g. `T-7QK2M9`. NOT a secret and never
 * treated as one — it appears in admin URLs. 6 characters of a 31-symbol
 * alphabet is ~30 bits, which is plenty to keep references distinct for a
 * support queue and far too little to protect anything.
 */
export function newTicketReference(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)];
  }
  return `T-${out}`;
}

/**
 * The visitor's browser key for a thread: 32 bytes of CSPRNG as hex.
 *
 * This is the only thing that reads a thread back, so it is the whole access
 * control for a conversation containing an email address. `crypto.getRandomValues`
 * (never `Math.random`) — and the caller cannot pass a generator, deliberately,
 * so there is no seam through which a test's predictable stub reaches production.
 */
export function newAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 64 lowercase hex characters. Checked BEFORE the value reaches a WHERE clause,
 * the same rule the logo route applies to its sha256 path parameter. */
export const ACCESS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isAccessToken(value: unknown): value is string {
  return typeof value === "string" && ACCESS_TOKEN_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

export type MessageAuthor = "user" | "operator";

export interface SupportMessageView {
  id: number;
  author: MessageAuthor;
  body: string;
  createdAt: string;
}

/** What the visitor's widget gets back. Note what is NOT here: no ticket id.
 * The browser holds a token and needs nothing else, and echoing the operator
 * reference would put it in a place it has no reason to be. */
export interface SupportThreadView {
  status: TicketStatus | string;
  email: string;
  createdAt: string;
  messages: SupportMessageView[];
}

/** A row in the operator's queue. */
export interface SupportTicketSummary {
  id: string;
  email: string;
  status: TicketStatus | string;
  createdAt: string;
  lastMessageAt: string;
  pagePath: string | null;
  messageCount: number;
  /** First line of the opening message, for scanning the queue. */
  preview: string;
}
