import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signed-session primitives, shared by whoever ISSUES a session and whoever
 * VERIFIES one.
 *
 * Moved here from `apps/waitlist/lib/waitlist/session.ts` when the X handshake
 * became its own service. The split is the whole reason this is a package: the
 * identity service signs the cookie, and apps/waitlist and apps/web verify it,
 * so the HMAC scheme now has three call sites in three deployments. Two copies
 * of it would eventually disagree about the separator or the digest encoding,
 * and the failure mode is every session silently reading as forged — the same
 * argument `xOAuth.ts` makes about the OAuth signature, for the same reason.
 *
 * Same file shape as `xOAuth.ts`, and a separate export for the same reason:
 * `node:crypto` must not be pulled into a browser bundle by `@iter/types`'s
 * barrel.
 */

/**
 * The shared session cookie.
 *
 * Set on `Domain=.iter.cx` by the identity service, so every origin under
 * `iter.cx` — the apex and `waitlist.iter.cx` — sees the same sign-in. That is
 * what makes one X handshake serve all of them, and it is also this cookie's
 * one constraint: a frontend on some other registrable domain cannot read it.
 */
export const SESSION_COOKIE = "iter.sid";

/**
 * The waitlist's own pre-split cookie, host-scoped to `waitlist.iter.cx`.
 *
 * Still verified — NOT still issued. Everyone signed in at the cutover holds one
 * of these, and rejecting them would sign out every existing signup to ship a
 * refactor they cannot see. `apps/waitlist` accepts it as a fallback for one
 * release; delete this constant and that fallback together once the 30-day TTL
 * has turned over.
 */
export const LEGACY_WAITLIST_COOKIE = "iter.waitlist";

/** 30 days. Long enough that a visitor can come back for the ranking. */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(xUserId: string, secret: string): string {
  return `${xUserId}.${sign(xUserId, secret)}`;
}

/**
 * Returns the X user id, or null for anything that is not a valid session.
 *
 * Every failure answers the same way. A caller has no use for the difference
 * between "absent", "malformed" and "forged", and reporting it would make this
 * an oracle for what a valid token looks like.
 */
export function verifySession(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [xUserId, provided] = parts;
  if (!xUserId || !provided) return null;

  const expected = sign(xUserId, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? xUserId : null;
}

/**
 * Verify the shared cookie, falling back to the legacy host-scoped one.
 *
 * Lives here rather than in apps/waitlist so the transition has ONE definition
 * and one place to delete. The order matters and is not arbitrary: a browser
 * mid-cutover holds both cookies, and the shared one is the newer proof.
 *
 * `legacySecret` is separate because the two cookies were signed by different
 * deployments with different secrets — passing the same value for both is
 * correct only if the secret was actually reused, which it should not be.
 * Omit it to disable the fallback entirely, which is what the cleanup commit
 * does before deleting this function.
 *
 * BOTH secrets are optional and an empty one is SKIPPED, never used. That is a
 * security property, not defensiveness: `createHmac` accepts an empty key
 * quite happily, so verifying against `""` would authenticate any token an
 * attacker could compute against the empty key. An unset secret must mean "this
 * cookie cannot be verified", never "verify it with nothing".
 */
export function verifySessionWithLegacy(
  cookies: { shared?: string | undefined; legacy?: string | undefined },
  secrets: { secret?: string; legacySecret?: string },
): string | null {
  if (secrets.secret) {
    const current = verifySession(cookies.shared, secrets.secret);
    if (current) return current;
  }
  if (!secrets.legacySecret) return null;
  return verifySession(cookies.legacy, secrets.legacySecret);
}
