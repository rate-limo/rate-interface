/** Support domain rules. No database, no network.
 *
 * packages/types/node_modules/.bin/tsx --test src/support.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_TOKEN_PATTERN,
  EMAIL_MAX,
  MESSAGE_MAX,
  PAGE_PATH_MAX,
  isAccessToken,
  isTicketStatus,
  needsReply,
  newAccessToken,
  newTicketReference,
  normalizeEmail,
  replyDraftSchema,
  statusAfterOperatorReply,
  statusAfterUserMessage,
  ticketDraftSchema,
} from "./support";

test("a visitor's message always puts the ticket in the queue", () => {
  for (const from of ["open", "answered", "closed"]) {
    assert.equal(statusAfterUserMessage(from), "open");
  }
});

test("an operator's reply hands the ticket back to the visitor", () => {
  assert.equal(statusAfterOperatorReply("open"), "answered");
  assert.equal(statusAfterOperatorReply("answered"), "answered");
});

test("replying to a closed ticket does not reopen it", () => {
  // An operator adding a last note to something they just finished should not
  // put it back in their own queue. Only the visitor reopens.
  assert.equal(statusAfterOperatorReply("closed"), "closed");
});

test("only open tickets are waiting on us", () => {
  assert.equal(needsReply("open"), true);
  assert.equal(needsReply("answered"), false);
  assert.equal(needsReply("closed"), false);
});

test("unknown statuses are rejected by the guard, not crashed on", () => {
  assert.equal(isTicketStatus("open"), true);
  assert.equal(isTicketStatus("escalated"), false);
  // …and still behave sanely if one reaches the helpers from an older row.
  assert.equal(needsReply("escalated"), false);
  assert.equal(statusAfterOperatorReply("escalated"), "answered");
});

test("emails are normalized, not validated into oblivion", () => {
  assert.equal(normalizeEmail("  Someone@Example.COM "), "someone@example.com");

  // Real addresses that a stricter pattern would reject.
  for (const ok of ["a+tag@example.co.uk", "user.name@sub.domain.io", "x@y.dev"]) {
    assert.equal(ticketDraftSchema.safeParse({ email: ok, message: "hi" }).success, true, ok);
  }
});

test("an address we could not possibly reply to is refused", () => {
  for (const bad of ["", "nope", "no@domain", "two @spaces.com", "a@b@c.com"]) {
    assert.equal(ticketDraftSchema.safeParse({ email: bad, message: "hi" }).success, false, bad);
  }
});

test("an empty or whitespace-only message is not a ticket", () => {
  assert.equal(ticketDraftSchema.safeParse({ email: "a@b.co", message: "   " }).success, false);
  assert.equal(replyDraftSchema.safeParse({ message: "\n\t " }).success, false);
});

test("caps are enforced on the parsed value, not left to the input element", () => {
  const email = `${"a".repeat(EMAIL_MAX)}@example.com`;
  assert.equal(ticketDraftSchema.safeParse({ email, message: "hi" }).success, false);

  const message = "x".repeat(MESSAGE_MAX + 1);
  assert.equal(ticketDraftSchema.safeParse({ email: "a@b.co", message }).success, false);
  assert.equal(replyDraftSchema.safeParse({ message }).success, false);

  // Exactly at the cap is fine — an off-by-one here rejects a legitimate report.
  assert.equal(
    ticketDraftSchema.safeParse({ email: "a@b.co", message: "x".repeat(MESSAGE_MAX) }).success,
    true,
  );
});

test("the draft trims before it measures", () => {
  const parsed = ticketDraftSchema.parse({ email: " A@B.co ", message: "  it broke  " });
  assert.equal(parsed.email, "a@b.co");
  assert.equal(parsed.message, "it broke");
});

test("operator references avoid characters that get misread aloud", () => {
  // A reference is retyped from a conversation, so 0/O and 1/I/L are out.
  let seq = 0;
  const cycle = () => (seq++ % 31) / 31;
  const ref = newTicketReference(cycle);
  assert.match(ref, /^T-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  assert.ok(!/[01OIL]/.test(ref.slice(2)));
});

test("access tokens are 64 hex chars and never repeat", () => {
  const a = newAccessToken();
  const b = newAccessToken();
  assert.match(a, ACCESS_TOKEN_PATTERN);
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.equal(isAccessToken(a), true);
});

test("anything that is not exactly a token is refused before it reaches a query", () => {
  for (const bad of [
    "",
    "abc",
    "A".repeat(64), // uppercase hex
    "g".repeat(64), // not hex
    `${"a".repeat(64)} `,
    `${"a".repeat(64)}'--`,
    "a".repeat(63),
    "a".repeat(65),
    null,
    undefined,
    123,
  ]) {
    assert.equal(isAccessToken(bad), false, String(bad));
  }
});

test("a long page path is truncated, never a reason to reject the ticket", () => {
  // `/trade/pro` with a full parameter set is already past 500 characters. A
  // `.max()` here used to fail the whole parse, so a visitor on a deep-linked
  // page could not open a ticket at all — the exact trade /api/waitlist
  // refuses to make with a malformed referral code.
  const long = `/trade/pro?${"chain=rise&base=WBTC&quote=USDC&".repeat(30)}`;
  const parsed = ticketDraftSchema.parse({ email: "a@b.co", message: "it broke", pagePath: long });
  assert.equal(parsed.pagePath!.length, PAGE_PATH_MAX);
  assert.ok(long.startsWith(parsed.pagePath!));
});

test("junk in pagePath is dropped, and the ticket still goes through", () => {
  for (const junk of [123, {}, [], true, null, "", "   "]) {
    const parsed = ticketDraftSchema.parse({
      email: "a@b.co",
      message: "it broke",
      pagePath: junk,
    });
    assert.equal(parsed.pagePath, undefined, JSON.stringify(junk));
  }
});

test("an ordinary page path survives intact", () => {
  const parsed = ticketDraftSchema.parse({
    email: "a@b.co",
    message: "it broke",
    pagePath: "  /trade/pro?chain=rise-testnet  ",
  });
  assert.equal(parsed.pagePath, "/trade/pro?chain=rise-testnet");
});
